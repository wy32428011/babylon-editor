import { spawn } from "child_process";
import { copyFile, ensureDir, pathExists, readdir, stat } from "fs-extra";
import { basename, dirname, extname, join } from "path/posix";

import { findAvailableFilename } from "../fs";
import { analyzeCadDxfDrawingSheets, ICadDrawingSheetCandidate } from "./dxf";

export type CadDrawingSourceExtension = ".dxf" | ".dwg";

export interface ICadDrawingImportResult {
	originalPath: string;
	projectSourcePath: string;
	importablePath: string;
	convertedFrom?: ".dwg";
	sheetCandidates: ICadDrawingSheetCandidate[];
}

export type ICadDrawingSelectedSheetMetadata = Omit<ICadDrawingSheetCandidate, "thumbnailPath">;

export interface ICadDrawingMetadata {
	originalPath: string;
	projectSourcePath: string;
	importablePath: string;
	convertedFrom?: ".dwg";
	originalFormat: CadDrawingSourceExtension;
	unit: "meter";
	scale: 1;
	placedOnGround: true;
	selectedSheet?: ICadDrawingSelectedSheetMetadata;
}

export interface ICadDrawingImportProgress {
	value: number;
	message: string;
	log?: string;
}

export type CadDrawingImportProgressHandler = (progress: ICadDrawingImportProgress) => void;

interface ICadDwgConverterCandidate {
	name: string;
	executable: string;
	args: string[];
	displayCommand: string;
}

interface ICadDwgConverterRunResult {
	exitCode: number | null;
	timedOut: boolean;
	output: string;
	error?: string;
	errorCode?: string;
	signal?: string;
}

const cadDrawingExtensions = new Set<CadDrawingSourceExtension>([".dxf", ".dwg"]);
const DWG_CONVERTER_TIMEOUT_MS = 5 * 60 * 1000;
const DWG_CONVERTER_OUTPUT_LIMIT = 10000;
const DWG_CONVERTER_KILL_GRACE_MS = 10000;
const DWG_CONVERTER_FORCE_KILL_GRACE_MS = 3000;
const commercialFreeDwgConverterExecutableNames = new Set(["dwg2dxf", "dwg2dxf.exe", "dwgread", "dwgread.exe"]);

let cachedCommercialFreeDwgConverterExecutables: string[] | null = null;

/**
 * 规范化 CAD 图纸路径，保证 Windows 路径也能和项目内 POSIX 风格路径一起计算。
 * @param path 定义需要规范化的文件路径。
 */
export function normalizeCadDrawingPath(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * 读取 CAD 图纸源文件扩展名，仅允许当前版本支持的 DXF 和 DWG。
 * @param absolutePath 定义 CAD 图纸源文件路径。
 */
export function getCadDrawingSourceExtension(absolutePath: string): CadDrawingSourceExtension | null {
	const extension = extname(absolutePath).toLowerCase() as CadDrawingSourceExtension;
	return cadDrawingExtensions.has(extension) ? extension : null;
}

/**
 * 判断给定路径是否是当前 CAD 导入入口支持的图纸格式。
 * @param absolutePath 定义需要判断的文件路径。
 */
export function isSupportedCadDrawingFile(absolutePath: string): boolean {
	return getCadDrawingSourceExtension(absolutePath) !== null;
}

/**
 * 把 CAD 图纸准备成 Assimp/Babylon 可导入的项目内资源路径。
 * @param projectPath 定义当前 Babylon Editor 项目文件路径。
 * @param sourcePath 定义用户选择的 CAD 图纸源文件路径。
 * @param onProgress 定义导入准备阶段的进度回调。
 */
export async function prepareCadDrawingImport(projectPath: string, sourcePath: string, onProgress?: CadDrawingImportProgressHandler): Promise<ICadDrawingImportResult> {
	const originalPath = normalizeCadDrawingPath(sourcePath);
	reportCadDrawingProgress(onProgress, 5, "校验 CAD 图纸", `源文件：${originalPath}`);

	const originalFormat = getCadDrawingSourceExtension(originalPath);
	if (!originalFormat) {
		throw new Error("仅支持导入 .dxf 和 .dwg CAD 图纸。");
	}

	if (!(await pathExists(originalPath))) {
		throw new Error(`CAD 图纸文件不存在：${originalPath}`);
	}

	reportCadDrawingProgress(onProgress, 20, "复制 CAD 图纸到项目资产目录", `原始格式：${originalFormat}`);
	const projectSourcePath = await prepareProjectCadSource(projectPath, originalPath, originalFormat === ".dwg");
	reportCadDrawingProgress(onProgress, 40, "CAD 图纸资产已准备", `项目内源文件：${projectSourcePath}`);

	if (originalFormat === ".dxf") {
		const sheetCandidates = await analyzeCadDrawingSheets(projectSourcePath, onProgress);
		return {
			originalPath,
			projectSourcePath,
			importablePath: projectSourcePath,
			sheetCandidates,
		};
	}

	const importablePath = await convertDwgToDxf(projectSourcePath, onProgress);
	reportCadDrawingProgress(onProgress, 65, "DWG 转 DXF 完成", `DXF 导入文件：${importablePath}`);
	const sheetCandidates = await analyzeCadDrawingSheets(importablePath, onProgress);

	return {
		originalPath,
		projectSourcePath,
		importablePath,
		convertedFrom: ".dwg",
		sheetCandidates,
	};
}

/**
 * 生成写入场景根节点的 CAD 元数据。
 * @param importResult 定义 CAD 图纸准备和转换后的导入结果。
 * @param selectedSheet 定义用户选择的图纸候选。
 */
export function createCadDrawingMetadata(importResult: ICadDrawingImportResult, selectedSheet?: ICadDrawingSheetCandidate): ICadDrawingMetadata {
	const originalFormat = getCadDrawingSourceExtension(importResult.originalPath);
	if (!originalFormat) {
		throw new Error("无法识别 CAD 图纸原始格式。");
	}

	return {
		originalPath: importResult.originalPath,
		projectSourcePath: importResult.projectSourcePath,
		importablePath: importResult.importablePath,
		convertedFrom: importResult.convertedFrom,
		originalFormat,
		unit: "meter",
		scale: 1,
		placedOnGround: true,
		selectedSheet: selectedSheet ? createSelectedSheetMetadata(selectedSheet) : undefined,
	};
}

/**
 * 分析 DXF 中的多图纸候选并上报进度。
 * @param importablePath 定义已经可读取的 DXF 文件路径。
 * @param onProgress 定义导入进度回调。
 */
async function analyzeCadDrawingSheets(importablePath: string, onProgress?: CadDrawingImportProgressHandler): Promise<ICadDrawingSheetCandidate[]> {
	reportCadDrawingProgress(onProgress, 70, "分析 CAD 图纸候选", `DXF 文件：${importablePath}`);
	const candidates = await analyzeCadDxfDrawingSheets(importablePath);
	reportCadDrawingProgress(onProgress, 74, "CAD 图纸候选分析完成", `识别候选：${candidates.length} 个`);
	return candidates;
}

/**
 * 裁剪图纸候选元数据，避免把缩略图临时路径写入场景节点。
 * @param selectedSheet 定义用户选择的图纸候选。
 */
function createSelectedSheetMetadata(selectedSheet: ICadDrawingSheetCandidate): ICadDrawingSelectedSheetMetadata {
	return {
		id: selectedSheet.id,
		name: selectedSheet.name,
		source: selectedSheet.source,
		bounds: selectedSheet.bounds,
		entityCount: selectedSheet.entityCount,
	};
}

/**
 * 把项目外 CAD 图纸复制到项目 assets/cad-drawings 目录；项目内文件直接复用。
 * @param projectPath 定义当前项目文件路径。
 * @param sourcePath 定义 CAD 源文件路径。
 * @param forceCopy 定义是否强制复制到新的项目资产目录，DWG 转换需要独立输出目录避免复用旧 DXF。
 */
async function prepareProjectCadSource(projectPath: string, sourcePath: string, forceCopy: boolean): Promise<string> {
	const projectDir = dirname(normalizeCadDrawingPath(projectPath));
	const projectRoot = normalizeCadDrawingPath(join(projectDir, "/")).toLowerCase();
	const normalizedSourcePath = normalizeCadDrawingPath(sourcePath);

	if (!forceCopy && normalizedSourcePath.toLowerCase().startsWith(projectRoot)) {
		return normalizedSourcePath;
	}

	const cadAssetsDir = join(projectDir, "assets", "cad-drawings");
	await ensureDir(cadAssetsDir);

	const sourceName = basename(normalizedSourcePath, extname(normalizedSourcePath));
	const targetFolder = await findAvailableFilename(cadAssetsDir, sourceName, "");
	const targetDir = join(cadAssetsDir, targetFolder);
	await ensureDir(targetDir);

	const projectSourcePath = join(targetDir, basename(normalizedSourcePath));
	await copyFile(normalizedSourcePath, projectSourcePath);
	return projectSourcePath;
}

/**
 * 自动探测本机转换器并把 DWG 转换为 DXF。
 * @param inputPath 定义项目内 DWG 源文件路径。
 * @param onProgress 定义转换阶段的进度回调。
 */
async function convertDwgToDxf(inputPath: string, onProgress?: CadDrawingImportProgressHandler): Promise<string> {
	const outputDir = dirname(inputPath);
	const outputPath = join(outputDir, `${basename(inputPath, extname(inputPath))}.dxf`);
	const failures: string[] = [];
	const candidates = await getDwgConverterCandidates(inputPath, outputPath);
	let missingAllExecutables = true;

	for (let index = 0; index < candidates.length; index++) {
		const candidate = candidates[index];
		reportCadDrawingProgress(onProgress, Math.min(70, 45 + index * 5), `自动转换 DWG：${candidate.name}`, `转换命令：${candidate.displayCommand}`);

		const runResult = await runDwgConverter(candidate, outputDir, DWG_CONVERTER_TIMEOUT_MS);
		if (runResult.errorCode !== "ENOENT") {
			missingAllExecutables = false;
		}

		if (runResult.timedOut) {
			const timeoutMessage = `转换超时：${Math.round(DWG_CONVERTER_TIMEOUT_MS / 1000)} 秒`;
			reportCadDrawingProgress(onProgress, Math.min(75, 50 + index * 5), `${candidate.name} 转换命令超时`, `${timeoutMessage}${getProcessOutputSuffix(runResult.output)}`);
			failures.push(`[${candidate.name}]\n命令：${candidate.displayCommand}\n工作目录：${outputDir}\n${timeoutMessage}${getProcessOutputSuffix(runResult.output)}`);
			continue;
		}

		const exitCode = runResult.exitCode ?? -1;
		const runLog = runResult.error ? `错误：${runResult.error}${getProcessOutputSuffix(runResult.output)}` : `退出码：${exitCode}${getProcessOutputSuffix(runResult.output)}`;
		reportCadDrawingProgress(onProgress, Math.min(75, 50 + index * 5), `${candidate.name} 转换命令已结束`, runLog);
		if (exitCode === 0 && (await pathExists(outputPath))) {
			const outputSize = await tryGetFileSize(outputPath);
			if (outputSize && outputSize > 0) {
				return outputPath;
			}

			const emptyOutputMessage = outputSize === 0 ? "错误：转换器生成了空 DXF 文件。" : "错误：无法读取转换后的 DXF 文件。";
			failures.push(`[${candidate.name}]\n命令：${candidate.displayCommand}\n工作目录：${outputDir}\n${emptyOutputMessage}${getProcessOutputSuffix(runResult.output)}`);
			continue;
		}

		failures.push(
			`[${candidate.name}]\n命令：${candidate.displayCommand}\n工作目录：${outputDir}\n${runResult.error ? `错误：${runResult.error}` : `退出码：${exitCode}`}${getProcessOutputSuffix(runResult.output)}`
		);
	}

	if (missingAllExecutables) {
		// 用户可能在应用运行中补充 bin/cad 转换器，失败后清空缓存以便下次导入重新探测。
		cachedCommercialFreeDwgConverterExecutables = null;
	}

	throw new Error(
		[
			`自动 DWG 转 DXF 失败，未生成预期 DXF 文件：${outputPath}`,
			"编辑器只会自动探测商用免费插件：LibreDWG/libdxfrw 的 dwg2dxf 或 dwgread，不再自动安装或默认使用 ODA File Converter。",
			"请将 dwg2dxf.exe 或 dwgread.exe 放到编辑器 bin/cad/ 目录，或确认这些命令可在 PATH 中执行。",
			"LibreDWG/libdxfrw 采用 GPL 授权，商业使用免费，但随应用分发时需要遵守 GPL 源码和许可证义务。",
			"尝试记录：",
			failures.join("\n\n"),
		].join("\n")
	);
}

/**
 * 使用无 shell 子进程执行 DWG 转换器，避免用户路径被命令行解释器展开。
 * @param candidate 定义当前尝试的转换器候选。
 * @param cwd 定义转换进程工作目录。
 * @param timeoutMs 定义等待转换完成的超时时间。
 */
function runDwgConverter(candidate: ICadDwgConverterCandidate, cwd: string, timeoutMs: number): Promise<ICadDwgConverterRunResult> {
	return new Promise<ICadDwgConverterRunResult>((resolve) => {
		let output = "";
		let timedOut = false;
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let killGraceTimeout: ReturnType<typeof setTimeout> | null = null;
		let forceKillGraceTimeout: ReturnType<typeof setTimeout> | null = null;

		const finish = (result: ICadDwgConverterRunResult): void => {
			if (settled) {
				return;
			}

			settled = true;
			if (timeout) {
				clearTimeout(timeout);
			}
			if (killGraceTimeout) {
				clearTimeout(killGraceTimeout);
			}
			if (forceKillGraceTimeout) {
				clearTimeout(forceKillGraceTimeout);
			}

			resolve(result);
		};

		const process = spawn(candidate.executable, candidate.args, {
			cwd,
			shell: false,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		timeout = setTimeout(() => {
			timedOut = true;
			killDwgConverterProcess(process);
			killGraceTimeout = setTimeout(() => {
				killDwgConverterProcess(process, "SIGKILL");
				forceKillGraceTimeout = setTimeout(() => {
					finish({
						exitCode: null,
						timedOut: true,
						output,
						error: `转换超时后进程未在 ${Math.round((DWG_CONVERTER_KILL_GRACE_MS + DWG_CONVERTER_FORCE_KILL_GRACE_MS) / 1000)} 秒内退出。`,
					});
				}, DWG_CONVERTER_FORCE_KILL_GRACE_MS);
			}, DWG_CONVERTER_KILL_GRACE_MS);
		}, timeoutMs);

		process.stdout.on("data", (data: Buffer) => {
			output = appendDwgConverterOutput(output, data);
		});

		process.stderr.on("data", (data: Buffer) => {
			output = appendDwgConverterOutput(output, data);
		});

		process.on("error", (error) => {
			const nodeError = error as NodeJS.ErrnoException;
			finish({
				exitCode: null,
				timedOut,
				output,
				error: error instanceof Error ? error.message : String(error),
				errorCode: nodeError.code,
			});
		});

		process.on("close", (exitCode, signal) => {
			finish({
				exitCode: timedOut ? null : exitCode,
				timedOut,
				output,
				signal: signal ?? undefined,
			});
		});
	});
}

/**
 * 终止当前 DWG 转换进程；失败时交给 close/error/超时兜底继续收口。
 * @param process 定义当前转换器子进程。
 * @param signal 定义可选的终止信号。
 */
function killDwgConverterProcess(process: ReturnType<typeof spawn>, signal?: NodeJS.Signals): void {
	try {
		process.kill(signal);
	} catch (e) {
		// 转换器可能已经退出，后续 close 事件或超时兜底会完成状态收口。
	}
}

/**
 * 限制 DWG 转换器输出长度，避免异常输出占用过多内存。
 * @param output 定义当前已经捕获的输出。
 * @param chunk 定义新增的输出片段。
 */
function appendDwgConverterOutput(output: string, chunk: Buffer): string {
	return `${output}${chunk.toString("utf-8")}`.slice(-DWG_CONVERTER_OUTPUT_LIMIT);
}

/**
 * 构建自动 DWG 转 DXF 候选命令，按稳定性从高到低尝试。
 * @param inputPath 定义项目内 DWG 输入路径。
 * @param outputPath 定义期望生成的 DXF 输出路径。
 */
async function getDwgConverterCandidates(inputPath: string, outputPath: string): Promise<ICadDwgConverterCandidate[]> {
	const candidates: ICadDwgConverterCandidate[] = [];
	for (const executable of await findCommercialFreeDwgConverterExecutables()) {
		candidates.push(...createCommercialFreeDwgConverterCandidates(executable, inputPath, outputPath));
	}

	candidates.push(
		...createCommercialFreeDwgConverterCandidates("dwg2dxf", inputPath, outputPath),
		...createCommercialFreeDwgConverterCandidates("dwgread", inputPath, outputPath)
	);

	return candidates;
}

/**
 * 基于可执行文件名构建商用免费 DWG 转换器候选命令。
 * @param executable 定义转换器可执行文件或 PATH 命令名。
 * @param inputPath 定义项目内 DWG 输入路径。
 * @param outputPath 定义期望生成的 DXF 输出路径。
 */
function createCommercialFreeDwgConverterCandidates(executable: string, inputPath: string, outputPath: string): ICadDwgConverterCandidate[] {
	const name = basename(normalizeCadDrawingPath(executable)).toLowerCase();
	const source = executable.includes("/") ? "bin/cad" : "PATH";
	if (name.startsWith("dwgread")) {
		return [createDwgConverterCandidate(`LibreDWG dwgread (${source})`, executable, ["-O", "DXF", "-o", outputPath, inputPath])];
	}

	return [
		createDwgConverterCandidate(`LibreDWG dwg2dxf R2000 (${source})`, executable, ["--as", "r2000", "-y", "-o", outputPath, inputPath]),
		createDwgConverterCandidate(`LibreDWG/libdxfrw dwg2dxf (${source})`, executable, ["-y", inputPath, "-o", outputPath]),
		createDwgConverterCandidate(`LibreDWG/libdxfrw dwg2dxf (${source})`, executable, ["-y", "-o", outputPath, inputPath]),
		createDwgConverterCandidate(`LibreDWG/libdxfrw dwg2dxf (${source})`, executable, [inputPath, "-o", outputPath]),
		createDwgConverterCandidate(`LibreDWG/libdxfrw dwg2dxf (${source})`, executable, ["-o", outputPath, inputPath]),
	];
}

/**
 * 创建 DWG 转换器候选项；displayCommand 仅用于日志展示，实际执行不经过 shell。
 * @param name 定义转换器显示名称。
 * @param executable 定义转换器可执行文件或 PATH 命令名。
 * @param args 定义传给转换器的参数数组。
 */
function createDwgConverterCandidate(name: string, executable: string, args: string[]): ICadDwgConverterCandidate {
	return {
		name,
		executable,
		args,
		displayCommand: [executable, ...args].map(quoteCommandDisplayValue).join(" "),
	};
}

/**
 * 查找编辑器随带的商用免费 CAD 转换器目录，打包后无需用户配置命令模板。
 */
async function findCommercialFreeDwgConverterExecutables(): Promise<string[]> {
	if (cachedCommercialFreeDwgConverterExecutables) {
		return cachedCommercialFreeDwgConverterExecutables;
	}

	const processWithResourcesPath = process as NodeJS.Process & { resourcesPath?: string };
	const cwd = normalizeCadDrawingPath(process.cwd());
	const roots = [
		process.env["BABYLONJS_EDITOR_CAD_CONVERTER_DIR"],
		join(cwd, "bin", "cad"),
		join(dirname(cwd), "bin", "cad"),
		join(cwd, "editor", "bin", "cad"),
		processWithResourcesPath.resourcesPath ? join(normalizeCadDrawingPath(processWithResourcesPath.resourcesPath), "bin", "cad") : null,
		processWithResourcesPath.resourcesPath ? join(normalizeCadDrawingPath(processWithResourcesPath.resourcesPath), "app.asar.unpacked", "bin", "cad") : null,
	].filter(Boolean) as string[];

	const executables: string[] = [];
	for (const root of roots) {
		for (const executable of await findCommercialFreeDwgConverterExecutablesRecursively(normalizeCadDrawingPath(root), 4)) {
			if (!executables.includes(executable)) {
				executables.push(executable);
			}
		}
	}

	executables.sort((a, b) => getCommercialFreeDwgConverterPriority(a) - getCommercialFreeDwgConverterPriority(b));
	cachedCommercialFreeDwgConverterExecutables = executables;
	return executables;
}

/**
 * 定义 DWG 转换器优先级，优先使用已验证更适合 Babylon/Assimp 导入的 dwg2dxf。
 * @param executable 定义待排序的转换器路径。
 */
function getCommercialFreeDwgConverterPriority(executable: string): number {
	const name = basename(normalizeCadDrawingPath(executable)).toLowerCase();
	if (name.startsWith("dwg2dxf")) {
		return 0;
	}

	if (name.startsWith("dwgread")) {
		return 1;
	}

	return 2;
}

/**
 * 在指定目录下有限递归查找 LibreDWG/libdxfrw 转换器，避免扫描整盘导致导入卡顿。
 * @param root 定义起始目录。
 * @param maxDepth 定义最大递归深度。
 */
async function findCommercialFreeDwgConverterExecutablesRecursively(root: string, maxDepth: number): Promise<string[]> {
	if (maxDepth < 0 || !(await pathExists(root))) {
		return [];
	}

	const results: string[] = [];
	for (const entry of await tryReadDirectory(root)) {
		const absolutePath = join(root, entry);
		const normalizedEntry = entry.toLowerCase();
		if (commercialFreeDwgConverterExecutableNames.has(normalizedEntry) && (await pathExists(absolutePath))) {
			results.push(absolutePath);
			continue;
		}

		if (maxDepth > 0 && (await isDirectory(absolutePath))) {
			results.push(...(await findCommercialFreeDwgConverterExecutablesRecursively(absolutePath, maxDepth - 1)));
		}
	}

	return results;
}

/**
 * 判断路径是否是目录，读取失败时返回 false。
 * @param path 定义需要判断的路径。
 */
async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch (e) {
		return false;
	}
}

/**
 * 读取文件大小，读取失败时返回 null 以便调用方给出明确转换失败日志。
 * @param path 定义需要读取大小的文件路径。
 */
async function tryGetFileSize(path: string): Promise<number | null> {
	try {
		return (await stat(path)).size;
	} catch (e) {
		return null;
	}
}

/**
 * 安全读取目录，读取失败时返回空数组避免自动探测中断导入流程。
 * @param directory 定义需要读取的目录。
 */
async function tryReadDirectory(directory: string): Promise<string[]> {
	try {
		return await readdir(directory);
	} catch (e) {
		return [];
	}
}

/**
 * 为日志中的命令片段加引号；仅用于显示，实际执行使用 spawn 参数数组。
 * @param value 定义需要展示的命令片段。
 */
function quoteCommandDisplayValue(value: string): string {
	const normalized = normalizeCadDrawingPath(value);
	return normalized.includes("/") || normalized.includes(" ") ? `"${normalized.replace(/"/g, '\\"')}"` : normalized;
}

/**
 * 上报 CAD 图纸导入准备阶段进度，并把关键路径写入日志。
 * @param onProgress 定义可选进度回调。
 * @param value 定义进度百分比。
 * @param message 定义当前阶段文案。
 * @param log 定义可选日志内容。
 */
function reportCadDrawingProgress(onProgress: CadDrawingImportProgressHandler | undefined, value: number, message: string, log?: string): void {
	onProgress?.({
		value,
		message,
		log,
	});
}

/**
 * 裁剪转换进程输出，避免错误提示过长。
 * @param output 定义转换命令输出内容。
 */
function getProcessOutputSuffix(output: string): string {
	const normalizedOutput = output.trim();
	return normalizedOutput ? ` 输出：${normalizedOutput.slice(-1000)}` : "";
}
