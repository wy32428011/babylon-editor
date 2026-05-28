import { isAbsolute as isNativeAbsolute } from "path";
import { extname, join, normalize } from "path/posix";

import { pathExists, readFile } from "fs-extra";
import { Scene } from "babylonjs";

import { Editor } from "../../editor/main";
import { normalizeCadDrawingPath } from "../../tools/cad/drawing";
import { isCadGroundRootNode, rebuildCadGroundFromMetadata } from "../../tools/cad/ground-importer";
import { ICadGroundMetadata } from "../../tools/cad/types";

/**
 * 恢复保存项目时只保留根节点 metadata 的 CAD 贴地参考层。
 * @param editor 定义当前编辑器实例，用于写入 Console 日志。
 * @param scene 定义已经完成基础节点加载的场景。
 * @param projectDir 定义项目根目录。
 */
export async function restoreCadGroundReferences(editor: Editor, scene: Scene, projectDir: string): Promise<void> {
	const roots = scene.transformNodes.filter((node) => isCadGroundRootNode(node));
	if (!roots.length) {
		return;
	}

	for (const root of roots) {
		const metadata = root.metadata?.cad as ICadGroundMetadata | undefined;
		if (!metadata) {
			editor.layout.console.error(`[CAD 参考] ${root.name} 缺少 metadata.cad，已跳过自动重建。`);
			continue;
		}

		const importablePath = await resolveExistingCadImportablePath(projectDir, metadata);
		if (!importablePath) {
			editor.layout.console.error(`[CAD 参考] 未找到 ${root.name} 的 DXF 文件，无法重建贴地参考。已检查：${getCadImportablePathCandidates(projectDir, metadata).join("；") || "metadata 无路径"}`);
			continue;
		}

		try {
			editor.layout.console.log(`[CAD 参考] 正在从 DXF 重建 ${root.name}：${importablePath}`);
			const dxfText = await readFile(importablePath, "utf-8");
			const result = rebuildCadGroundFromMetadata(scene, root, dxfText);
			editor.layout.console.log(
				`[CAD 参考] 已恢复 ${root.name}，地面尺寸 ${result.metadata.ground.width.toFixed(3)} × ${result.metadata.ground.height.toFixed(3)} m，图层 ${result.metadata.layers.length} 个。`
			);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			editor.layout.console.error(`[CAD 参考] 重建 ${root.name} 失败：${message}`);
		}
	}
}

/**
 * 按“项目相对路径优先、绝对路径兜底”的顺序寻找可读取 DXF。
 * @param projectDir 定义项目根目录。
 * @param metadata 定义 CAD 根节点 metadata。
 */
async function resolveExistingCadImportablePath(projectDir: string, metadata: ICadGroundMetadata): Promise<string | null> {
	for (const candidate of getCadImportablePathCandidates(projectDir, metadata)) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return null;
}

/**
 * 生成可用于恢复 CAD 的 DXF 路径候选列表。
 * @param projectDir 定义项目根目录。
 * @param metadata 定义 CAD 根节点 metadata。
 */
function getCadImportablePathCandidates(projectDir: string, metadata: ICadGroundMetadata): string[] {
	const candidates: string[] = [];
	addCadPathCandidate(candidates, resolveProjectRelativeCadPath(projectDir, metadata.projectRelativeImportablePath));
	addCadPathCandidate(candidates, resolveProjectRelativeCadPath(projectDir, metadata.projectRelativeSourcePath));
	addCadPathCandidate(candidates, metadata.importablePath);
	addCadPathCandidate(candidates, metadata.projectSourcePath);

	return candidates.filter((candidate) => extname(candidate).toLowerCase() === ".dxf");
}

/**
 * 解析项目相对 CAD 路径，并阻止 metadata 中的路径越界到项目目录外。
 * @param projectDir 定义项目根目录。
 * @param relativePath 定义保存到 metadata 的项目相对路径。
 */
function resolveProjectRelativeCadPath(projectDir: string, relativePath: string | undefined): string | null {
	if (!relativePath) {
		return null;
	}

	const normalizedRelativePath = normalizeCadDrawingPath(relativePath);
	if (isUnsafeProjectRelativeCadPath(normalizedRelativePath)) {
		return null;
	}

	const absolutePath = normalizeCadDrawingPath(join(projectDir, normalize(normalizedRelativePath)));
	return isPathInsideProject(projectDir, absolutePath) ? absolutePath : null;
}

/**
 * 判断项目相对路径是否包含绝对路径或向上级目录穿越。
 * @param relativePath 定义待检查的路径。
 */
function isUnsafeProjectRelativeCadPath(relativePath: string): boolean {
	const normalizedPath = normalize(relativePath);
	return (
		!normalizedPath ||
		normalizedPath === "." ||
		normalizedPath === ".." ||
		normalizedPath.startsWith("../") ||
		normalizedPath.startsWith("/") ||
		isNativeAbsolute(normalizedPath) ||
		/^[a-zA-Z]:\//.test(normalizedPath)
	);
}

/**
 * 判断解析出的绝对路径是否仍位于项目根目录中。
 * @param projectDir 定义项目根目录。
 * @param absolutePath 定义解析后的绝对路径。
 */
function isPathInsideProject(projectDir: string, absolutePath: string): boolean {
	const projectRoot = normalizeCadDrawingPath(join(projectDir, "/")).toLowerCase();
	return normalizeCadDrawingPath(absolutePath).toLowerCase().startsWith(projectRoot);
}

/**
 * 加入去重后的 CAD 路径候选。
 * @param candidates 定义候选列表。
 * @param path 定义待加入路径。
 */
function addCadPathCandidate(candidates: string[], path: string | null | undefined): void {
	if (!path) {
		return;
	}

	const normalizedPath = normalizeCadDrawingPath(path);
	if (!candidates.some((candidate) => candidate.toLowerCase() === normalizedPath.toLowerCase())) {
		candidates.push(normalizedPath);
	}
}
