import { spawn } from "child_process";
import { basename, dirname, extname, join } from "path/posix";

import { ipcMain } from "electron";
import { ensureDir, pathExists, readdir, readFile, remove, stat } from "fs-extra";

import { ICadDwgConversionRequest, ICadDwgConversionResponse } from "../../tools/cad/types";

type CadDwgConverterKind = "oda" | "libredwg";

interface ICadDwgConverterCandidate {
	kind: CadDwgConverterKind;
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

interface ICadDxfStructureValidationResult {
	ok: boolean;
	message?: string;
	log: string;
}

interface ICadDxfStructureSummary {
	sections: string[];
	hasEntitiesSection: boolean;
	hasBlocksSection: boolean;
	hasEof: boolean;
	entityCounts: Record<string, number>;
	blockEntityCounts: Record<string, number>;
	drawableEntityCount: number;
	blockDrawableEntityCount: number;
	lineCount: number;
}

const DWG_CONVERTER_TIMEOUT_MS = 5 * 60 * 1000;
const DWG_CONVERTER_OUTPUT_LIMIT = 10000;
const DWG_CONVERTER_KILL_GRACE_MS = 10000;
const DWG_CONVERTER_FORCE_KILL_GRACE_MS = 3000;
const ODA_OUTPUT_VERSION = "ACAD2018";
const ODA_FILE_CONVERTER_EXECUTABLE_NAMES = new Set(["odafileconverter", "odafileconverter.exe"]);
const DWG2DXF_EXECUTABLE_NAMES = new Set(["dwg2dxf", "dwg2dxf.exe"]);
const DXF_DRAWABLE_ENTITY_NAMES = ["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "SPLINE", "INSERT"];

let cachedBundledCadConverterExecutables: string[] | null = null;

ipcMain.on("editor:cad:convert-dwg-to-dxf", async (ev, messageId: string, request: ICadDwgConversionRequest) => {
	ev.sender.send(messageId, await convertDwgToDxf(request));
});

/**
 * 在 Electron 主进程中调用本机 CAD 转换器，把 DWG 转换为可解析的 DXF。
 * @param request 定义输入、输出和可选转换器路径。
 */
async function convertDwgToDxf(request: ICadDwgConversionRequest): Promise<ICadDwgConversionResponse> {
	try {
		await validateConversionRequest(request);
		const candidates = await getDwgConverterCandidates(request);
		const failures: string[] = [];
		let missingAllExecutables = true;

		for (const candidate of candidates) {
			await remove(request.outputPath);

			const runResult = await runDwgConverter(candidate, dirname(request.inputPath), DWG_CONVERTER_TIMEOUT_MS);
			if (runResult.errorCode !== "ENOENT") {
				missingAllExecutables = false;
			}

			const resultLog = formatRunResultLog(candidate, dirname(request.inputPath), runResult);
			if (runResult.exitCode === 0 && !runResult.timedOut && (await hasNonEmptyFile(request.outputPath))) {
				const validation = await validateConvertedDxfOutput(request.outputPath);
				if (validation.ok) {
					return {
						ok: true,
						outputPath: request.outputPath,
						log: `${resultLog}\n${validation.log}`,
					};
				}

				failures.push(`${resultLog}\n${validation.message}\n${validation.log}`);
				continue;
			}

			failures.push(resultLog);
		}

		if (missingAllExecutables) {
			cachedBundledCadConverterExecutables = null;
			return {
				ok: false,
				code: "CAD_DWG_CONVERTER_NOT_FOUND",
				message: "未找到可用的 DWG 转 DXF 工具。请安装 ODA File Converter，并在 CAD 导入配置中填写 ODAFileConverter.exe 路径，或设置 ODA_FILE_CONVERTER / BABYLONJS_EDITOR_ODA_CONVERTER_DIR。",
				log: failures.join("\n\n"),
			};
		}

		return {
			ok: false,
			code: "CAD_DWG_CONVERTER_FAILED",
			message: `DWG 转 DXF 失败，未生成结构完整的 DXF 文件：${request.outputPath}`,
			log: failures.join("\n\n"),
		};
	} catch (e) {
		return {
			ok: false,
			code: "CAD_DWG_CONVERTER_REQUEST_INVALID",
			message: e instanceof Error ? e.message : String(e),
		};
	}
}

/**
 * 校验 DWG 转换请求的路径和文件状态。
 * @param request 定义转换请求。
 */
async function validateConversionRequest(request: ICadDwgConversionRequest): Promise<void> {
	if (!request?.inputPath || !request.outputPath) {
		throw new Error("DWG 转换请求缺少输入或输出路径。");
	}

	if (extname(request.inputPath).toLowerCase() !== ".dwg") {
		throw new Error(`DWG 转换输入文件格式无效：${request.inputPath}`);
	}

	if (extname(request.outputPath).toLowerCase() !== ".dxf") {
		throw new Error(`DWG 转换输出文件必须是 DXF：${request.outputPath}`);
	}

	if (dirname(request.inputPath).toLowerCase() !== dirname(request.outputPath).toLowerCase()) {
		throw new Error("DWG 转换输出 DXF 必须位于输入 DWG 同一目录。");
	}

	const expectedOutputName = `${basename(request.inputPath, extname(request.inputPath))}.dxf`;
	if (basename(request.outputPath).toLowerCase() !== expectedOutputName.toLowerCase()) {
		throw new Error(`DWG 转换输出 DXF 文件名必须与输入 DWG 同名：${expectedOutputName}`);
	}

	if (!(await pathExists(request.inputPath))) {
		throw new Error(`DWG 文件不存在或不可读取：${request.inputPath}`);
	}

	if (!(await hasNonEmptyFile(request.inputPath))) {
		throw new Error(`DWG 文件为空或无法读取：${request.inputPath}`);
	}

	await ensureDir(dirname(request.outputPath));
}

/**
 * 按 ODA 优先、LibreDWG 兜底的顺序构建 DWG 转 DXF 候选命令。
 * @param request 定义转换请求。
 */
async function getDwgConverterCandidates(request: ICadDwgConversionRequest): Promise<ICadDwgConverterCandidate[]> {
	const candidates: ICadDwgConverterCandidate[] = [];
	const bundledExecutables = await findBundledCadConverterExecutables();

	await addConverterCandidates(candidates, request.converterPath, request, "用户配置");
	await addConverterCandidates(candidates, process.env["ODA_FILE_CONVERTER"], request, "ODA_FILE_CONVERTER", ["oda"]);
	await addConverterCandidates(candidates, process.env["BABYLONJS_EDITOR_ODA_CONVERTER_DIR"], request, "BABYLONJS_EDITOR_ODA_CONVERTER_DIR", ["oda"]);

	for (const executable of bundledExecutables.filter(isOdaFileConverterExecutable)) {
		addConverterExecutableCandidates(candidates, executable, request, "bin/cad", ["oda"]);
	}
	for (const executable of getPlatformOdaFileConverterNames()) {
		addConverterExecutableCandidates(candidates, executable, request, "PATH", ["oda"]);
	}

	await addConverterCandidates(candidates, process.env["LIBREDWG_DWG2DXF"], request, "LIBREDWG_DWG2DXF", ["libredwg"]);
	for (const executable of bundledExecutables.filter(isDwg2DxfExecutable)) {
		addConverterExecutableCandidates(candidates, executable, request, "bin/cad", ["libredwg"]);
	}
	for (const executable of getPlatformDwg2DxfNames()) {
		addConverterExecutableCandidates(candidates, executable, request, "PATH", ["libredwg"]);
	}

	return candidates;
}

/**
 * 将用户或环境变量提供的可执行文件/目录加入候选列表。
 * @param candidates 定义候选列表。
 * @param value 定义用户填写或环境变量提供的路径。
 * @param request 定义转换请求。
 * @param sourceLabel 定义日志中的来源标签。
 * @param allowedKinds 定义允许创建的转换器类型。
 */
async function addConverterCandidates(
	candidates: ICadDwgConverterCandidate[],
	value: string | undefined,
	request: ICadDwgConversionRequest,
	sourceLabel: string,
	allowedKinds?: CadDwgConverterKind[]
): Promise<void> {
	if (!value) {
		return;
	}

	const normalized = normalizePath(value);
	if (!(await pathExists(normalized))) {
		addConverterExecutableCandidates(candidates, normalized, request, sourceLabel, allowedKinds);
		return;
	}

	if (await isDirectory(normalized)) {
		for (const executableName of getPlatformOdaFileConverterNames()) {
			addConverterExecutableCandidates(candidates, join(normalized, executableName), request, sourceLabel, allowedKinds);
		}
		for (const executableName of getPlatformDwg2DxfNames()) {
			addConverterExecutableCandidates(candidates, join(normalized, executableName), request, sourceLabel, allowedKinds);
			addConverterExecutableCandidates(candidates, join(normalized, "bin", "cad", executableName), request, sourceLabel, allowedKinds);
		}
		return;
	}

	addConverterExecutableCandidates(candidates, normalized, request, sourceLabel, allowedKinds);
}

/**
 * 根据可执行文件名创建对应转换器命令。
 * @param candidates 定义候选列表。
 * @param executable 定义转换器可执行文件或 PATH 命令。
 * @param request 定义转换请求。
 * @param sourceLabel 定义日志中的来源标签。
 * @param allowedKinds 定义允许创建的转换器类型。
 */
function addConverterExecutableCandidates(
	candidates: ICadDwgConverterCandidate[],
	executable: string,
	request: ICadDwgConversionRequest,
	sourceLabel: string,
	allowedKinds?: CadDwgConverterKind[]
): void {
	const kinds = allowedKinds ?? ["oda", "libredwg"];
	const normalized = normalizePath(executable);

	if (kinds.includes("oda") && isOdaFileConverterExecutable(normalized)) {
		addUniqueCandidate(candidates, createOdaFileConverterCandidate(normalized, request.inputPath, request.outputPath, sourceLabel));
	}

	if (kinds.includes("libredwg") && isDwg2DxfExecutable(normalized)) {
		addUniqueCandidate(candidates, createDwg2DxfCandidate(normalized, request.inputPath, request.outputPath, sourceLabel));
	}
}

/**
 * 查找仓库、安装包和配置目录中的 CAD 转换器。
 */
async function findBundledCadConverterExecutables(): Promise<string[]> {
	if (cachedBundledCadConverterExecutables) {
		return cachedBundledCadConverterExecutables;
	}

	const processWithResourcesPath = process as NodeJS.Process & { resourcesPath?: string };
	const cwd = normalizePath(process.cwd());
	const roots = [
		process.env["BABYLONJS_EDITOR_ODA_CONVERTER_DIR"],
		process.env["BABYLONJS_EDITOR_CAD_CONVERTER_DIR"],
		process.env["BABYLONJS_EDITOR_CAD_CONVERTER_DIR"] ? join(normalizePath(process.env["BABYLONJS_EDITOR_CAD_CONVERTER_DIR"]), "bin", "cad") : null,
		join(cwd, "bin", "cad"),
		join(dirname(cwd), "bin", "cad"),
		join(cwd, "editor", "bin", "cad"),
		process.platform === "win32" ? "C:/Program Files/ODA" : null,
		process.platform === "win32" ? "C:/Program Files (x86)/ODA" : null,
		processWithResourcesPath.resourcesPath ? join(normalizePath(processWithResourcesPath.resourcesPath), "bin", "cad") : null,
		processWithResourcesPath.resourcesPath ? join(normalizePath(processWithResourcesPath.resourcesPath), "app.asar.unpacked", "bin", "cad") : null,
	].filter(Boolean) as string[];

	const executables: string[] = [];
	for (const root of roots) {
		for (const executable of await findCadConverterExecutablesRecursively(normalizePath(root), 4)) {
			addUniqueExecutable(executables, executable);
		}
	}

	cachedBundledCadConverterExecutables = executables;
	return executables;
}

/**
 * 在指定目录中有限递归查找 ODAFileConverter 和 dwg2dxf，避免扫描整盘。
 * @param root 定义起始目录。
 * @param maxDepth 定义最大递归深度。
 */
async function findCadConverterExecutablesRecursively(root: string, maxDepth: number): Promise<string[]> {
	if (maxDepth < 0 || !(await pathExists(root))) {
		return [];
	}

	const results: string[] = [];
	for (const entry of await tryReadDirectory(root)) {
		const absolutePath = join(root, entry);
		if ((ODA_FILE_CONVERTER_EXECUTABLE_NAMES.has(entry.toLowerCase()) || DWG2DXF_EXECUTABLE_NAMES.has(entry.toLowerCase())) && (await pathExists(absolutePath))) {
			results.push(absolutePath);
			continue;
		}

		if (maxDepth > 0 && (await isDirectory(absolutePath))) {
			results.push(...(await findCadConverterExecutablesRecursively(absolutePath, maxDepth - 1)));
		}
	}

	return results;
}

/**
 * 创建 ODA File Converter 候选命令。
 * @param executable 定义 ODAFileConverter 可执行文件或 PATH 命令。
 * @param inputPath 定义 DWG 输入路径。
 * @param outputPath 定义 DXF 输出路径。
 * @param sourceLabel 定义候选来源标签。
 */
function createOdaFileConverterCandidate(executable: string, inputPath: string, outputPath: string, sourceLabel: string): ICadDwgConverterCandidate {
	const args = [dirname(inputPath), dirname(outputPath), ODA_OUTPUT_VERSION, "DXF", "0", "1", basename(inputPath)];
	return {
		kind: "oda",
		name: `ODA File Converter (${sourceLabel})`,
		executable,
		args,
		displayCommand: [executable, ...args].map(quoteCommandDisplayValue).join(" "),
	};
}

/**
 * 创建 LibreDWG dwg2dxf 候选命令。
 * @param executable 定义 dwg2dxf 可执行文件或 PATH 命令。
 * @param inputPath 定义 DWG 输入路径。
 * @param outputPath 定义 DXF 输出路径。
 * @param sourceLabel 定义候选来源标签。
 */
function createDwg2DxfCandidate(executable: string, inputPath: string, outputPath: string, sourceLabel: string): ICadDwgConverterCandidate {
	const args = ["-y", "-o", outputPath, inputPath];
	return {
		kind: "libredwg",
		name: `LibreDWG dwg2dxf (${sourceLabel})`,
		executable,
		args,
		displayCommand: [executable, ...args].map(quoteCommandDisplayValue).join(" "),
	};
}

/**
 * 使用无 shell 子进程执行 CAD 转换器，避免用户路径被命令解释器展开。
 * @param candidate 定义当前转换器候选。
 * @param cwd 定义转换进程工作目录。
 * @param timeoutMs 定义转换超时时间。
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
			clearTimer(timeout);
			clearTimer(killGraceTimeout);
			clearTimer(forceKillGraceTimeout);
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
			output = appendConverterOutput(output, data);
		});

		process.stderr.on("data", (data: Buffer) => {
			output = appendConverterOutput(output, data);
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
 * 校验转换后的 DXF 是否包含可导入的二维 CAD 几何。
 * @param outputPath 定义转换后的 DXF 路径。
 */
async function validateConvertedDxfOutput(outputPath: string): Promise<ICadDxfStructureValidationResult> {
	if (!(await hasNonEmptyFile(outputPath))) {
		return {
			ok: false,
			message: "转换器生成了空 DXF 文件。",
			log: `DXF 结构校验失败：文件为空。`,
		};
	}

	const text = await readFile(outputPath, "utf-8");
	if (!text.trim()) {
		return {
			ok: false,
			message: "转换器生成了空 DXF 文件。",
			log: `DXF 结构校验失败：文件只包含空白字符。`,
		};
	}

	const summary = analyzeDxfStructure(text);
	const problems: string[] = [];
	const warnings: string[] = [];
	const hasModelSpaceDrawableEntities = summary.hasEntitiesSection && summary.drawableEntityCount > 0;
	const hasBlockDrawableEntities = summary.hasBlocksSection && summary.blockDrawableEntityCount > 0;
	if (!hasModelSpaceDrawableEntities && !hasBlockDrawableEntities) {
		problems.push("没有可绘制的 LINE、POLYLINE、CIRCLE、ARC、SPLINE 或 INSERT CAD 实体");
	}
	if (!summary.hasEntitiesSection && hasBlockDrawableEntities) {
		warnings.push("缺少 ENTITIES 模型空间实体段，将按 BLOCKS/INSERT 递归展开导入");
	}
	if (summary.hasEntitiesSection && summary.drawableEntityCount === 0 && hasBlockDrawableEntities) {
		warnings.push("ENTITIES 段内没有可绘制实体，将使用 BLOCKS/INSERT 中的几何内容");
	}
	if (!summary.hasEof) {
		warnings.push("缺少 0/EOF 结束标记，导入前会自动补齐给 DXF 解析器读取");
	}

	const log = formatDxfStructureSummary(summary, warnings);
	if (problems.length) {
		return {
			ok: false,
			message: `DWG 转换后的 DXF 结构异常：${problems.join("，")}。该结果无法生成 CAD 贴地图，已拒绝导入。`,
			log,
		};
	}

	return {
		ok: true,
		log,
	};
}

/**
 * 扫描 DXF group code/value，提取 section 与常见二维实体数量。
 * @param text 定义 DXF 文本。
 */
function analyzeDxfStructure(text: string): ICadDxfStructureSummary {
	const sections: string[] = [];
	const entityCounts = Object.fromEntries(DXF_DRAWABLE_ENTITY_NAMES.map((name) => [name, 0])) as Record<string, number>;
	const blockEntityCounts = Object.fromEntries(DXF_DRAWABLE_ENTITY_NAMES.map((name) => [name, 0])) as Record<string, number>;
	const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	let pendingCode: string | null = null;
	let activeSection: string | null = null;
	let expectingSectionName = false;
	let hasEof = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		if (pendingCode === null) {
			pendingCode = line;
			continue;
		}

		if (expectingSectionName && pendingCode === "2") {
			activeSection = line.toUpperCase();
			sections.push(activeSection);
			expectingSectionName = false;
		}

		if (pendingCode === "0") {
			const value = line.toUpperCase();
			if (value === "SECTION") {
				expectingSectionName = true;
			} else if (value === "ENDSEC") {
				activeSection = null;
			} else if (value === "EOF") {
				hasEof = true;
			} else if (activeSection === "ENTITIES" && Object.prototype.hasOwnProperty.call(entityCounts, value)) {
				entityCounts[value]++;
			} else if (activeSection === "BLOCKS" && Object.prototype.hasOwnProperty.call(blockEntityCounts, value)) {
				blockEntityCounts[value]++;
			}
		}

		pendingCode = null;
	}

	return {
		sections,
		hasEntitiesSection: sections.includes("ENTITIES"),
		hasBlocksSection: sections.includes("BLOCKS"),
		hasEof,
		entityCounts,
		blockEntityCounts,
		drawableEntityCount: Object.values(entityCounts).reduce((total, count) => total + count, 0),
		blockDrawableEntityCount: Object.values(blockEntityCounts).reduce((total, count) => total + count, 0),
		lineCount: lines.length,
	};
}

/**
 * 格式化 DXF 结构摘要，便于 Console 排查转换质量。
 * @param summary 定义 DXF 结构扫描结果。
 * @param warnings 定义转换结果可继续导入但需要提示的结构问题。
 */
function formatDxfStructureSummary(summary: ICadDxfStructureSummary, warnings: string[] = []): string {
	const entitySummary = Object.entries(summary.entityCounts)
		.filter(([, count]) => count > 0)
		.map(([name, count]) => `${name}:${count}`)
		.join(", ");
	const blockEntitySummary = Object.entries(summary.blockEntityCounts)
		.filter(([, count]) => count > 0)
		.map(([name, count]) => `${name}:${count}`)
		.join(", ");
	return [
		`DXF 结构：sections=${summary.sections.join("/") || "无"}`,
		`ENTITIES=${summary.hasEntitiesSection ? "是" : "否"}`,
		`BLOCKS=${summary.hasBlocksSection ? "是" : "否"}`,
		`EOF=${summary.hasEof ? "是" : "否"}`,
		`modelSpaceDrawableEntities=${summary.drawableEntityCount}`,
		`blockDrawableEntities=${summary.blockDrawableEntityCount}`,
		`entities=${entitySummary || "无"}`,
		`blockEntities=${blockEntitySummary || "无"}`,
		`warnings=${warnings.join("；") || "无"}`,
		`lines=${summary.lineCount}`,
	].join("；");
}

/**
 * 格式化转换命令执行结果，供 renderer Console 展示。
 * @param candidate 定义当前候选命令。
 * @param cwd 定义工作目录。
 * @param runResult 定义执行结果。
 */
function formatRunResultLog(candidate: ICadDwgConverterCandidate, cwd: string, runResult: ICadDwgConverterRunResult): string {
	const exitCode = runResult.exitCode ?? -1;
	const status = runResult.timedOut ? "转换超时" : runResult.error ? `错误：${runResult.error}` : `退出码：${exitCode}`;
	return [`[${candidate.name}]`, `类型：${candidate.kind}`, `命令：${candidate.displayCommand}`, `工作目录：${cwd}`, `${status}${getProcessOutputSuffix(runResult.output)}`].join("\n");
}

/**
 * 判断文件是否存在且非空。
 * @param path 定义文件路径。
 */
async function hasNonEmptyFile(path: string): Promise<boolean> {
	try {
		return (await stat(path)).size > 0;
	} catch (e) {
		return false;
	}
}

/**
 * 判断路径是否为目录。
 * @param path 定义文件系统路径。
 */
async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch (e) {
		return false;
	}
}

/**
 * 安全读取目录，读取失败时返回空数组。
 * @param directory 定义目录路径。
 */
async function tryReadDirectory(directory: string): Promise<string[]> {
	try {
		return await readdir(directory);
	} catch (e) {
		return [];
	}
}

/**
 * 判断路径是否指向 ODA File Converter。
 * @param executable 定义待判断的可执行文件路径或命令名。
 */
function isOdaFileConverterExecutable(executable: string): boolean {
	return ODA_FILE_CONVERTER_EXECUTABLE_NAMES.has(basename(normalizePath(executable)).toLowerCase());
}

/**
 * 判断路径是否指向 LibreDWG dwg2dxf。
 * @param executable 定义待判断的可执行文件路径或命令名。
 */
function isDwg2DxfExecutable(executable: string): boolean {
	return DWG2DXF_EXECUTABLE_NAMES.has(basename(normalizePath(executable)).toLowerCase());
}

/**
 * 加入去重后的候选命令。
 * @param candidates 定义候选列表。
 * @param candidate 定义待加入项。
 */
function addUniqueCandidate(candidates: ICadDwgConverterCandidate[], candidate: ICadDwgConverterCandidate): void {
	if (!candidates.some((existing) => existing.displayCommand.toLowerCase() === candidate.displayCommand.toLowerCase())) {
		candidates.push(candidate);
	}
}

/**
 * 加入去重后的候选可执行文件。
 * @param executables 定义候选列表。
 * @param executable 定义待加入项。
 */
function addUniqueExecutable(executables: string[], executable: string): void {
	const normalized = normalizePath(executable);
	if (!executables.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
		executables.push(normalized);
	}
}

/**
 * 根据当前平台返回常见 ODA File Converter 可执行文件名。
 */
function getPlatformOdaFileConverterNames(): string[] {
	return process.platform === "win32" ? ["ODAFileConverter.exe", "ODAFileConverter"] : ["ODAFileConverter"];
}

/**
 * 根据当前平台返回常见 dwg2dxf 可执行文件名。
 */
function getPlatformDwg2DxfNames(): string[] {
	return process.platform === "win32" ? ["dwg2dxf.exe", "dwg2dxf"] : ["dwg2dxf"];
}

/**
 * 终止当前转换进程。
 * @param process 定义当前子进程。
 * @param signal 定义可选终止信号。
 */
function killDwgConverterProcess(process: ReturnType<typeof spawn>, signal?: NodeJS.Signals): void {
	try {
		process.kill(signal);
	} catch (e) {
		// 进程可能已经退出，后续 close 事件会完成收口。
	}
}

/**
 * 限制转换器输出长度，避免异常输出占用内存。
 * @param output 定义当前输出。
 * @param chunk 定义新增输出片段。
 */
function appendConverterOutput(output: string, chunk: Buffer): string {
	return `${output}${chunk.toString("utf-8")}`.slice(-DWG_CONVERTER_OUTPUT_LIMIT);
}

/**
 * 为日志中的命令片段加引号；实际执行仍使用参数数组。
 * @param value 定义待展示片段。
 */
function quoteCommandDisplayValue(value: string): string {
	const normalized = normalizePath(value);
	return normalized.includes("/") || normalized.includes(" ") ? `"${normalized.replace(/"/g, '\\"')}"` : normalized;
}

/**
 * 裁剪转换进程输出，避免错误提示过长。
 * @param output 定义转换命令输出内容。
 */
function getProcessOutputSuffix(output: string): string {
	const normalizedOutput = output.trim();
	return normalizedOutput ? ` 输出：${normalizedOutput.slice(-1000)}` : "";
}

/**
 * 清理可空定时器。
 * @param timer 定义待清理定时器。
 */
function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
	if (timer) {
		clearTimeout(timer);
	}
}

/**
 * 统一路径分隔符，便于 Electron 和日志展示。
 * @param path 定义原始路径。
 */
function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}
