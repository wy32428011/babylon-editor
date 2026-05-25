import { copy, ensureDir, pathExists, readdir } from "fs-extra";
import { basename, dirname, extname, join } from "path/posix";

import { AbstractMesh, ISceneLoaderAsyncResult, Node, Scene, Tools, TransformNode, Vector3 } from "babylonjs";

import { findAvailableFilename } from "./fs";
import { UniqueNumber } from "./tools";

export type ModelSidecarScriptKind = "params" | "animation";

export interface IModelSidecarAnimationScript {
	name: string;
	key: string;
}

export interface IModelSidecarMetadata {
	modelPath: string;
	paramsScriptKey: string | null;
	animationScripts: IModelSidecarAnimationScript[];
	selectedAnimationKey: string | null;
	importOffset?: [number, number, number];
}

export interface IModelSidecarScriptRecord {
	_id?: string;
	enabled: boolean;
	key: string;
	root?: "src" | "project";
	kind?: ModelSidecarScriptKind;
	animationName?: string;
	values?: Record<string, unknown>;
}

export interface IDiscoveredModelSidecar {
	modelPath: string;
	paramsScriptKey: string | null;
	animationScripts: IModelSidecarAnimationScript[];
}

const modelExtensions = new Set([".x", ".b3d", ".dae", ".glb", ".gltf", ".fbx", ".stl", ".lwo", ".dxf", ".obj", ".3ds", ".ms3d", ".blend", ".babylon"]);

/**
 * 规范化路径分隔符，确保 Windows 路径也能参与项目内相对路径计算。
 */
export function normalizeSidecarPath(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * 判断给定文件是否是编辑器可导入的模型文件。
 */
export function isSupportedModelSidecarFile(absolutePath: string): boolean {
	return modelExtensions.has(extname(absolutePath).toLowerCase());
}

/**
 * 返回脚本记录在项目中的绝对路径，兼容旧的 src 脚本和新的项目根脚本。
 */
export function getScriptAbsolutePath(projectDir: string, script: IModelSidecarScriptRecord): string {
	const normalizedKey = normalizeSidecarPath(script.key);
	return script.root === "project" ? join(projectDir, normalizedKey) : join(projectDir, "src", normalizedKey);
}

/**
 * 返回生成的 src/scripts.ts 中应使用的模块导入路径。
 */
export function getScriptImportPathFromScriptsFile(script: IModelSidecarScriptRecord): string {
	const keyWithoutExtension = normalizeSidecarPath(script.key).replace(extname(script.key), "");
	return script.root === "project" ? `../${keyWithoutExtension}` : `./${keyWithoutExtension}`;
}

/**
 * 判断脚本记录是否属于模型外挂脚本。
 */
export function isModelSidecarScript(script: IModelSidecarScriptRecord): boolean {
	return script.root === "project" && (script.kind === "params" || script.kind === "animation");
}

/**
 * 将绝对路径转换为相对项目根目录的路径。
 */
export function getProjectRelativeSidecarPath(projectDir: string, absolutePath: string): string {
	const normalizedProjectDir = normalizeSidecarPath(join(projectDir, "/"));
	const normalizedAbsolutePath = normalizeSidecarPath(absolutePath);
	return normalizedAbsolutePath.replace(normalizedProjectDir, "");
}

/**
 * 为外部拖入的模型复制整个模型包目录，返回复制后的模型文件路径。
 */
export async function prepareExternalModelSidecarPackage(projectPath: string, sourceModelPath: string): Promise<string> {
	const projectDir = dirname(projectPath);
	const normalizedProjectDir = normalizeSidecarPath(join(projectDir, "/")).toLowerCase();
	const normalizedSourcePath = normalizeSidecarPath(sourceModelPath);

	if (normalizedSourcePath.toLowerCase().startsWith(normalizedProjectDir)) {
		return normalizedSourcePath;
	}

	const assetsDir = join(projectDir, "assets");
	await ensureDir(assetsDir);

	const modelName = basename(sourceModelPath, extname(sourceModelPath));
	const targetFolderName = await findAvailableFilename(assetsDir, modelName, "");
	const targetDir = join(assetsDir, targetFolderName);

	await copy(dirname(sourceModelPath), targetDir, {
		overwrite: false,
		errorOnExist: false,
	});

	return join(targetDir, basename(sourceModelPath));
}

/**
 * 按固定命名规则发现模型同目录下的参数脚本和动画脚本。
 */
export async function discoverModelSidecar(projectPath: string, modelAbsolutePath: string): Promise<IDiscoveredModelSidecar | null> {
	const projectDir = dirname(projectPath);
	const modelDir = dirname(modelAbsolutePath);
	const modelName = basename(modelAbsolutePath, extname(modelAbsolutePath));

	const files = await readdir(modelDir);
	const paramsScriptKey = await findPreferredSidecarScript(projectDir, modelDir, [`${modelName}.params.ts`, `${modelName}.params.tsx`]);
	const animationScripts = findAnimationSidecarScripts(projectDir, modelDir, modelName, files);

	if (!paramsScriptKey && animationScripts.length === 0) {
		return null;
	}

	return {
		modelPath: getProjectRelativeSidecarPath(projectDir, modelAbsolutePath),
		paramsScriptKey,
		animationScripts,
	};
}

/**
 * 配置导入模型的根节点，并把发现到的外挂脚本写入模型根节点 metadata。
 */
export function applyModelSidecarToImport(scene: Scene, result: ISceneLoaderAsyncResult, sidecar: IDiscoveredModelSidecar): TransformNode {
	const { root, importOffset } = getOrCreateModelSidecarRoot(scene, result, sidecar.modelPath);
	root.metadata ??= {};

	const selectedAnimationKey = sidecar.animationScripts.length === 1 ? sidecar.animationScripts[0].key : null;

	root.metadata.modelSidecar = {
		modelPath: sidecar.modelPath,
		paramsScriptKey: sidecar.paramsScriptKey,
		animationScripts: sidecar.animationScripts,
		selectedAnimationKey,
		...(importOffset ? { importOffset } : {}),
	} satisfies IModelSidecarMetadata;

	const regularScripts = ((root.metadata.scripts ?? []) as IModelSidecarScriptRecord[]).filter((script) => !isModelSidecarScript(script));
	const sidecarScripts: IModelSidecarScriptRecord[] = [];

	if (sidecar.paramsScriptKey) {
		sidecarScripts.push({
			enabled: true,
			key: sidecar.paramsScriptKey,
			root: "project",
			kind: "params",
		});
	}

	sidecar.animationScripts.forEach((script) => {
		sidecarScripts.push({
			enabled: script.key === selectedAnimationKey,
			key: script.key,
			root: "project",
			kind: "animation",
			animationName: script.name,
		});
	});

	root.metadata.scripts = [...regularScripts, ...sidecarScripts];

	return root;
}

/**
 * 选择模型外挂动画脚本，并同步 metadata.scripts 中动画脚本的启用状态。
 */
export function setSelectedModelSidecarAnimation(object: any, selectedAnimationKey: string | null): void {
	const sidecar = object.metadata?.modelSidecar as IModelSidecarMetadata | undefined;
	if (!sidecar) {
		return;
	}

	sidecar.selectedAnimationKey = selectedAnimationKey;

	(object.metadata?.scripts as IModelSidecarScriptRecord[] | undefined)?.forEach((script) => {
		if (script.root === "project" && script.kind === "animation") {
			script.enabled = script.key === selectedAnimationKey;
		}
	});
}

/**
 * 从候选文件中按顺序选择存在的外挂脚本，`.ts` 会优先于 `.tsx`。
 */
async function findPreferredSidecarScript(projectDir: string, modelDir: string, candidates: string[]): Promise<string | null> {
	for (const candidate of candidates) {
		const absolutePath = join(modelDir, candidate);
		if (await pathExists(absolutePath)) {
			return getProjectRelativeSidecarPath(projectDir, absolutePath);
		}
	}

	return null;
}

/**
 * 扫描并返回模型同目录下按动画名排序的动画外挂脚本。
 */
function findAnimationSidecarScripts(projectDir: string, modelDir: string, modelName: string, files: string[]): IModelSidecarAnimationScript[] {
	const scriptsByName = new Map<string, string>();
	const prefix = `${modelName}.anim.`;

	files.forEach((file) => {
		if (!file.startsWith(prefix)) {
			return;
		}

		const extension = extname(file).toLowerCase();
		if (extension !== ".ts" && extension !== ".tsx") {
			return;
		}

		const animationName = file.slice(prefix.length, -extension.length);
		if (!animationName) {
			return;
		}

		const existing = scriptsByName.get(animationName);
		if (!existing || extension === ".ts") {
			scriptsByName.set(animationName, file);
		}
	});

	return [...scriptsByName.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, file]) => ({
			name,
			key: getProjectRelativeSidecarPath(projectDir, join(modelDir, file)),
		}));
}

/**
 * 获取导入模型的根节点；没有稳定根节点时创建一个新的 TransformNode。
 */
function getOrCreateModelSidecarRoot(scene: Scene, result: ISceneLoaderAsyncResult, modelPath: string): { root: TransformNode; importOffset: [number, number, number] | null } {
	const importNodes = [...result.meshes, ...result.transformNodes, ...result.lights] as Node[];
	const importNodeSet = new Set<Node>(importNodes);
	const topLevelTransformNodes = [...result.meshes, ...result.transformNodes].filter((node) => !node.parent || !importNodeSet.has(node.parent));
	const existingRoot = topLevelTransformNodes.find((node) => node.name === basename(modelPath)) ?? (topLevelTransformNodes.length === 1 ? topLevelTransformNodes[0] : null);

	if (existingRoot) {
		return { root: existingRoot, importOffset: null };
	}

	const root = new TransformNode(`${basename(modelPath, extname(modelPath))}_root`, scene);
	root.id = Tools.RandomId();
	root.uniqueId = UniqueNumber.Get();

	topLevelTransformNodes.forEach((node) => {
		node.parent = root;
	});

	const geometryCenter = getImportedMeshesBoundingCenter(result.meshes);
	if (!geometryCenter) {
		return { root, importOffset: null };
	}

	topLevelTransformNodes.forEach((node) => {
		node.position.subtractInPlace(geometryCenter);
	});

	return { root, importOffset: vectorToTuple(geometryCenter.negate()) };
}

/**
 * 计算本次导入网格的聚合包围盒中心，用于把 CAD 大坐标模型居中到 sidecar 根节点附近。
 */
function getImportedMeshesBoundingCenter(meshes: AbstractMesh[]): Vector3 | null {
	let minimum: Vector3 | null = null;
	let maximum: Vector3 | null = null;

	meshes.forEach((mesh) => {
		if (mesh.getTotalVertices() <= 0) {
			return;
		}

		mesh.refreshBoundingInfo({
			applyMorph: true,
			applySkeleton: true,
			updatePositionsArray: true,
		});

		const box = mesh.getBoundingInfo().boundingBox;
		minimum = minimum ? Vector3.Minimize(minimum, box.minimumWorld) : box.minimumWorld.clone();
		maximum = maximum ? Vector3.Maximize(maximum, box.maximumWorld) : box.maximumWorld.clone();
	});

	return minimum && maximum ? Vector3.Center(minimum, maximum) : null;
}

/**
 * 将 Vector3 转成可序列化的三元组，便于写入模型 metadata。
 */
function vectorToTuple(vector: Vector3): [number, number, number] {
	return [vector.x, vector.y, vector.z];
}
