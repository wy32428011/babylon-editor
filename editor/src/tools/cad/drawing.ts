import { copyFile, ensureDir, pathExists } from "fs-extra";
import { basename, dirname, extname, join } from "path/posix";

import { findAvailableFilename } from "../fs";
import { convertCadDwgToDxf } from "./dwg-to-dxf";
import type { ICadDrawingSheetCandidate } from "./dxf";

export type CadDrawingSourceExtension = ".dxf" | ".dwg";

export interface ICadDrawingImportResult {
	originalPath: string;
	projectSourcePath: string;
	projectRelativeSourcePath?: string;
	importablePath: string;
	projectRelativeImportablePath?: string;
	convertedFrom?: ".dwg";
	sheetCandidates: ICadDrawingSheetCandidate[];
}

export type ICadDrawingSelectedSheetMetadata = Omit<ICadDrawingSheetCandidate, "thumbnailPath">;

export interface ICadDrawingImportOptions {
	/**
	 * 定义用户手动指定的 DWG 转换器路径。
	 */
	converterPath?: string;
}

export interface ICadDrawingMetadata {
	originalPath: string;
	projectSourcePath: string;
	projectRelativeSourcePath?: string;
	importablePath: string;
	projectRelativeImportablePath?: string;
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

const cadDrawingExtensions = new Set<CadDrawingSourceExtension>([".dxf", ".dwg"]);

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
 * @param options 定义可选的 DWG 转换配置。
 */
export async function prepareCadDrawingImport(
	projectPath: string,
	sourcePath: string,
	onProgress?: CadDrawingImportProgressHandler,
	options?: ICadDrawingImportOptions
): Promise<ICadDrawingImportResult> {
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
	const projectRelativeSourcePath = getProjectRelativeCadDrawingPath(projectPath, projectSourcePath);
	reportCadDrawingProgress(onProgress, 40, "CAD 图纸资产已准备", `项目内源文件：${projectSourcePath}${projectRelativeSourcePath ? `\n项目相对源文件：${projectRelativeSourcePath}` : ""}`);

	if (originalFormat === ".dxf") {
		return {
			originalPath,
			projectSourcePath,
			projectRelativeSourcePath,
			importablePath: projectSourcePath,
			projectRelativeImportablePath: projectRelativeSourcePath,
			sheetCandidates: [],
		};
	}

	const importablePath = await convertDwgToDxf(projectSourcePath, options?.converterPath, onProgress);
	const projectRelativeImportablePath = getProjectRelativeCadDrawingPath(projectPath, importablePath);
	reportCadDrawingProgress(onProgress, 65, "DWG 转 DXF 完成", `DXF 导入文件：${importablePath}${projectRelativeImportablePath ? `\n项目相对 DXF：${projectRelativeImportablePath}` : ""}`);

	return {
		originalPath,
		projectSourcePath,
		projectRelativeSourcePath,
		importablePath,
		projectRelativeImportablePath,
		convertedFrom: ".dwg",
		sheetCandidates: [],
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
		projectRelativeSourcePath: importResult.projectRelativeSourcePath,
		importablePath: importResult.importablePath,
		projectRelativeImportablePath: importResult.projectRelativeImportablePath,
		convertedFrom: importResult.convertedFrom,
		originalFormat,
		unit: "meter",
		scale: 1,
		placedOnGround: true,
		selectedSheet: selectedSheet ? createSelectedSheetMetadata(selectedSheet) : undefined,
	};
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
 * 计算 CAD 项目资产路径相对项目根目录的稳定路径，便于项目目录移动后继续恢复。
 * @param projectPath 定义当前 Babylon Editor 项目文件路径。
 * @param absolutePath 定义已经位于项目中的 CAD 文件绝对路径。
 */
export function getProjectRelativeCadDrawingPath(projectPath: string, absolutePath: string): string | undefined {
	const projectDir = dirname(normalizeCadDrawingPath(projectPath));
	const projectRoot = normalizeCadDrawingPath(join(projectDir, "/")).toLowerCase();
	const normalizedPath = normalizeCadDrawingPath(absolutePath);

	if (!normalizedPath.toLowerCase().startsWith(projectRoot)) {
		return undefined;
	}

	return normalizedPath.substring(projectRoot.length);
}

/**
 * 自动探测本机转换器并把 DWG 转换为 DXF。
 * @param inputPath 定义项目内 DWG 源文件路径。
 * @param onProgress 定义转换阶段的进度回调。
 */
async function convertDwgToDxf(inputPath: string, converterPath: string | undefined, onProgress?: CadDrawingImportProgressHandler): Promise<string> {
	const outputDir = dirname(inputPath);
	const outputPath = join(outputDir, `${basename(inputPath, extname(inputPath))}.dxf`);
	reportCadDrawingProgress(onProgress, 45, "自动转换 DWG", `输出 DXF：${outputPath}`);
	const response = await convertCadDwgToDxf({
		inputPath,
		outputPath,
		converterPath,
	});
	if (response.log) {
		reportCadDrawingProgress(onProgress, 60, response.ok ? "DWG 转换命令完成" : "DWG 转换命令失败", response.log);
	}

	if (!response.ok || !response.outputPath) {
		throw new Error(response.message ?? "DWG 转 DXF 失败，未生成有效 DXF 文件。");
	}

	return response.outputPath;
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
