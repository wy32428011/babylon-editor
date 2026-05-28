import { isAbsolute as isNativeAbsolute } from "path";
import { fileURLToPath } from "url";
import { join, dirname, basename, extname } from "path/posix";
import { copyFile, pathExists, readJSON, readdir, remove, writeJSON } from "fs-extra";

import { RenderTargetTexture, SceneSerializer } from "babylonjs";

import { toast } from "sonner";

import { isNodeMaterial } from "../../tools/guards/material";
import { isHDRCubeTexture } from "../../tools/guards/texture";
import { getCollisionMeshFor } from "../../tools/mesh/collision";
import { storeTexturesBaseSize } from "../../tools/material/texture";
import { extractNodeMaterialTextures } from "../../tools/material/extract";
import { createDirectoryIfNotExist, normalizedGlob } from "../../tools/fs";
import { isCollisionMesh, isEditorCamera, isMesh } from "../../tools/guards/nodes";
import { extractNodeParticleSystemSetTextures, extractParticleSystemTextures } from "../../tools/particles/extract";

import { taaPipelineCameraConfigurations } from "../../editor/rendering/taa";
import { vlsPostProcessCameraConfigurations } from "../../editor/rendering/vls";
import { saveRenderingConfigurationForCamera } from "../../editor/rendering/tools";
import { ssrRenderingPipelineCameraConfigurations } from "../../editor/rendering/ssr";
import { ssaoRenderingPipelineCameraConfigurations } from "../../editor/rendering/ssao";
import { defaultPipelineCameraConfigurations } from "../../editor/rendering/default-pipeline";
import { motionBlurPostProcessCameraConfigurations } from "../../editor/rendering/motion-blur";

import { Editor } from "../../editor/main";

import { ensureSceneMetadataSpace } from "../space";
import { writeBinaryGeometry } from "../tools/geometry";

import { processAssetFile } from "./assets";
import { configureMeshesLODs } from "./lod";
import { handleExportScripts } from "./scripts";
import { configureMaterials } from "./materials";
import { configureMeshesPhysics } from "./physics";
import { configureClusteredLights } from "./light";
import { configureParticleSystems } from "./particles";
import { EditorExportProjectProgressComponent } from "./progress";
import { ExportSceneProgressComponent, showExportSceneProgressDialog } from "./dialog";

export type IExportProjectOptions = {
	optimize: boolean;
	noDialog?: boolean;
	noProgress?: boolean;
};

let exporting = false;

const supportedExportTextureExtensions = [".jpg", ".jpeg", ".webp", ".png", ".bmp", ".env", ".dds", ".hdr", ".exr", ".3dl"];

type ExportableTexture = {
	name?: string;
	url?: string;
	uniqueId?: number;
	_texture?: {
		url?: string | null;
	} | null;
};

/**
 * 规范化导出贴图路径，兼容 Windows 路径和 Babylon 的运行时路径拼接。
 */
function normalizeExportTexturePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * 判断贴图地址是否为远程运行时资源。
 */
function isRemoteTexturePath(path: string): boolean {
	return /^https?:/i.test(path);
}

/**
 * 判断贴图地址是否为不能直接写回 name 的临时运行时资源。
 */
function isTransientTexturePath(path: string): boolean {
	return /^(data|blob):/i.test(path);
}

/**
 * 将 file URL 转为本地文件路径。
 */
function getLocalPathFromFileUrl(path: string): string | null {
	if (!path.startsWith("file:")) {
		return null;
	}

	try {
		return normalizeExportTexturePath(fileURLToPath(path));
	} catch (e) {
		return null;
	}
}

/**
 * 判断路径是否为本机绝对路径。
 */
function isLocalAbsoluteTexturePath(path: string): boolean {
	return isNativeAbsolute(path) || /^[a-zA-Z]:\//.test(path);
}

/**
 * 把项目中的绝对路径换算成项目根相对路径。
 */
function getProjectRelativeTexturePath(absolutePath: string, projectRoot: string): string | null {
	const normalizedPath = normalizeExportTexturePath(absolutePath);
	if (!normalizedPath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
		return null;
	}

	return normalizedPath.substring(projectRoot.length);
}

/**
 * 去掉 Play 导出目录前缀，恢复成运行时资源相对路径。
 */
function normalizeProjectRelativeTexturePath(path: string): string {
	let normalizedPath = normalizeExportTexturePath(path);
	if (normalizedPath.startsWith("public/scene/")) {
		normalizedPath = normalizedPath.substring("public/scene/".length);
	}

	if (normalizedPath.startsWith("scene/")) {
		normalizedPath = normalizedPath.substring("scene/".length);
	}

	return normalizedPath;
}

/**
 * 将不在 assets 目录中的本地贴图复制到可导出的生成资源目录。
 */
async function copyTextureIntoGeneratedAssets(texture: ExportableTexture, sourcePath: string, projectDir: string): Promise<string | null> {
	if (!(await pathExists(sourcePath))) {
		return null;
	}

	if (!supportedExportTextureExtensions.includes(extname(sourcePath).toLowerCase())) {
		return null;
	}

	const filename = basename(sourcePath);
	if (!filename) {
		return null;
	}

	const textureId = texture.uniqueId ?? "texture";
	const relativePath = join("assets", "editor-generated_exported-textures", `${textureId}_${filename}`);
	const targetPath = join(projectDir, relativePath);

	await createDirectoryIfNotExist(dirname(targetPath));
	if (normalizeExportTexturePath(sourcePath) !== normalizeExportTexturePath(targetPath)) {
		await copyFile(sourcePath, targetPath);
	}

	return relativePath;
}

/**
 * 根据项目相对路径判断贴图是否可以直接被 Play 导出包加载。
 */
async function resolveProjectTexturePath(texture: ExportableTexture, sourcePath: string, relativePath: string, projectDir: string): Promise<string | null> {
	const normalizedRelativePath = normalizeProjectRelativeTexturePath(relativePath);
	if (normalizedRelativePath.startsWith("assets/")) {
		if (await pathExists(join(projectDir, normalizedRelativePath))) {
			return normalizedRelativePath;
		}

		return copyTextureIntoGeneratedAssets(texture, sourcePath, projectDir);
	}

	return copyTextureIntoGeneratedAssets(texture, sourcePath, projectDir);
}

/**
 * 解析单个贴图候选路径，保证最终路径能被复制到 public/scene。
 */
async function resolveExportTextureCandidate(texture: ExportableTexture, candidate: string, projectDir: string, projectRoot: string): Promise<string | null> {
	if (!candidate) {
		return null;
	}

	if (isTransientTexturePath(candidate)) {
		return null;
	}

	if (isRemoteTexturePath(candidate)) {
		return candidate;
	}

	const localPathFromUrl = getLocalPathFromFileUrl(candidate);
	const normalizedCandidate = normalizeExportTexturePath(localPathFromUrl ?? candidate);
	if (!normalizedCandidate) {
		return null;
	}

	if (isLocalAbsoluteTexturePath(normalizedCandidate)) {
		const relativePath = getProjectRelativeTexturePath(normalizedCandidate, projectRoot);
		if (relativePath) {
			return resolveProjectTexturePath(texture, normalizedCandidate, relativePath, projectDir);
		}

		return copyTextureIntoGeneratedAssets(texture, normalizedCandidate, projectDir);
	}

	const relativePath = normalizeProjectRelativeTexturePath(normalizedCandidate);
	if (relativePath.startsWith("assets/") && (await pathExists(join(projectDir, relativePath)))) {
		return relativePath;
	}

	if (!relativePath.startsWith("assets/")) {
		const assetRelativePath = join("assets", relativePath);
		if (await pathExists(join(projectDir, assetRelativePath))) {
			return assetRelativePath;
		}
	}

	const absolutePath = join(projectDir, relativePath);
	if (await pathExists(absolutePath)) {
		return resolveProjectTexturePath(texture, absolutePath, relativePath, projectDir);
	}

	return null;
}

/**
 * 将场景中的贴图路径规范化为 Play 导出包可访问的路径。
 */
async function configureTexturePathForExport(texture: ExportableTexture, projectDir: string): Promise<void> {
	const projectRoot = normalizeExportTexturePath(join(projectDir, "/"));
	const candidates = [texture.url, texture.name, texture._texture?.url].filter((value): value is string => typeof value === "string" && value.length > 0);
	const checkedCandidates = new Set<string>();

	for (const candidate of candidates) {
		if (checkedCandidates.has(candidate)) {
			continue;
		}

		checkedCandidates.add(candidate);

		const resolvedPath = await resolveExportTextureCandidate(texture, candidate, projectDir, projectRoot);
		if (resolvedPath) {
			texture.name = resolvedPath;
			texture.url = resolvedPath;
			return;
		}
	}
}

/**
 * 批量规范化场景贴图，避免编辑预览正常但 Play 重新加载时找不到贴图。
 */
async function configureTexturesPathsForExport(editor: Editor, projectDir: string): Promise<void> {
	const textures = [...editor.layout.preview.scene.textures];
	const environmentTexture = editor.layout.preview.scene.environmentTexture;
	if (environmentTexture && !textures.includes(environmentTexture)) {
		textures.push(environmentTexture);
	}

	await Promise.all(textures.map((texture) => configureTexturePathForExport(texture as ExportableTexture, projectDir)));
}

export async function exportProject(editor: Editor, options: IExportProjectOptions): Promise<void> {
	if (exporting) {
		return;
	}

	exporting = true;

	if (options.optimize) {
		editor.layout.selectTab("console");
	}

	try {
		await _exportProject(editor, options);
	} catch (e) {
		console.log(e);

		editor.layout.console.error(`Error exporting project:\n ${e.message}`);
		toast.error("导出项目时出错");
	} finally {
		exporting = false;
	}
}

async function _exportProject(editor: Editor, options: IExportProjectOptions): Promise<void> {
	if (!editor.state.projectPath || !editor.state.lastOpenedScenePath) {
		return;
	}

	let progress: EditorExportProjectProgressComponent | null = null;
	const toastId = toast(<EditorExportProjectProgressComponent ref={(r) => (progress = r)} />, {
		dismissible: false,
		duration: options.noProgress ? -1 : Infinity,
	});

	let dialog: ExportSceneProgressComponent | null = null;
	if (!options.noDialog) {
		dialog = await showExportSceneProgressDialog(editor, "Exporting scene...");
	}

	const scene = editor.layout.preview.scene;
	const editorCamera = scene.cameras.find((camera) => isEditorCamera(camera));
	const clusteredLightContainer = editor.layout.preview.clusteredLightContainer;

	if (scene.activeCamera) {
		saveRenderingConfigurationForCamera(scene.activeCamera);
	}

	const projectDir = dirname(editor.state.projectPath);
	const publicPath = join(projectDir, "public");

	const sceneName = basename(editor.state.lastOpenedScenePath).split(".").shift()!;

	const scenePath = join(publicPath, "scene");
	const extractedTexturesOutputPath = join(scenePath, "assets", "editor-generated_extracted-textures");

	await Promise.all([
		createDirectoryIfNotExist(publicPath),
		createDirectoryIfNotExist(scenePath),
		createDirectoryIfNotExist(join(scenePath, sceneName)),
		createDirectoryIfNotExist(extractedTexturesOutputPath),
	]);

	const exportedAssets: string[] = [];

	const savedGeometries: string[] = [];
	const savedGeometryIds: string[] = [];

	await configureTexturesPathsForExport(editor, projectDir);
	storeTexturesBaseSize(scene);

	scene.meshes.forEach((mesh) => (mesh.doNotSerialize = mesh.metadata?.doNotSerialize ?? false));
	scene.lights.forEach((light) => (light.doNotSerialize = light.metadata?.doNotSerialize ?? false));
	scene.cameras.forEach((camera) => (camera.doNotSerialize = camera.metadata?.doNotSerialize ?? false));
	scene.transformNodes.forEach((transformNode) => (transformNode.doNotSerialize = transformNode.metadata?.doNotSerialize ?? false));
	clusteredLightContainer.lights.forEach((light) => (light.doNotSerialize = light.metadata?.doNotSerialize ?? false));

	const data = await SceneSerializer.SerializeAsync(scene);

	scene.meshes.forEach((mesh) => (mesh.doNotSerialize = false));
	scene.lights.forEach((light) => (light.doNotSerialize = false));
	scene.cameras.forEach((camera) => (camera.doNotSerialize = false));
	scene.transformNodes.forEach((transformNode) => (transformNode.doNotSerialize = false));
	clusteredLightContainer.lights.forEach((light) => (light.doNotSerialize = false));

	const editorCameraIndex = data.cameras?.findIndex((camera) => camera.id === editorCamera?.id);
	if (editorCameraIndex !== -1) {
		data.cameras?.splice(editorCameraIndex, 1);
	}

	const clusteredLightContainerIndex = data.lights?.findIndex((light) => light.id === clusteredLightContainer.id);
	if (clusteredLightContainerIndex !== -1) {
		data.lights?.splice(clusteredLightContainerIndex, 1);
	}

	data.metadata ??= {};
	data.metadata = ensureSceneMetadataSpace(data.metadata);

	data.metadata.rendering = scene.cameras
		.filter((camera) => !isEditorCamera(camera))
		.map((camera) => ({
			cameraId: camera.id,
			ssao2RenderingPipeline: ssaoRenderingPipelineCameraConfigurations.get(camera),
			vlsPostProcess: vlsPostProcessCameraConfigurations.get(camera),
			ssrRenderingPipeline: ssrRenderingPipelineCameraConfigurations.get(camera),
			motionBlurPostProcess: motionBlurPostProcessCameraConfigurations.get(camera),
			defaultRenderingPipeline: defaultPipelineCameraConfigurations.get(camera),
			taaRenderingPipeline: taaPipelineCameraConfigurations.get(camera),
		}));

	delete data.effectLayers;
	delete data.postProcesses;
	delete data.spriteManagers;

	data.metadata.physicsGravity = scene.getPhysicsEngine()?.gravity?.asArray();

	configureMaterials(data);
	configureMeshesLODs(data, scene);
	configureMeshesPhysics(data, scene);
	configureParticleSystems(data, scene);
	configureClusteredLights(data, clusteredLightContainer);

	// Configure environment texture
	if (isHDRCubeTexture(scene.environmentTexture)) {
		data.environmentTextureSize = 512;
		data.environmentTextureType = "BABYLON.HDRCubeTexture";
		data.environmentTextureRotationY = scene.environmentTexture.rotationY;
	}

	// Write all geometries as incremental. This makes the scene way less heavy as binary saved geometry
	// is not stored in the JSON scene file. Moreover, this may allow to load geometries on the fly compared
	// to single JSON file.
	await Promise.all(
		data.meshes?.map(async (mesh: any) => {
			if (mesh.renderOverlay) {
				mesh.renderOverlay = false;
			}

			if (mesh.overlayAlpha) {
				mesh.overlayAlpha = 1;
			}

			if (mesh.overlayColor) {
				mesh.overlayColor = [0, 0, 0];
			}

			const instantiatedMesh = scene.getMeshById(mesh.id);

			if (instantiatedMesh) {
				if (isMesh(instantiatedMesh)) {
					const collisionMesh = getCollisionMeshFor(instantiatedMesh);
					if (collisionMesh) {
						mesh.isPickable = false;
						mesh.checkCollisions = false;

						mesh.instances?.forEach((instance) => {
							instance.isPickable = false;
							instance.checkCollisions = false;
						});
					}
				}

				if (isCollisionMesh(instantiatedMesh)) {
					if (mesh.materialId) {
						const materialIndex = data.materials.findIndex((material: any) => {
							return material.id === mesh.materialId;
						});

						if (materialIndex !== -1) {
							data.materials.splice(materialIndex);
						}
					}

					mesh.checkCollisions = true;
					mesh.instances?.forEach((instance) => {
						instance.checkCollisions = true;
					});
				}
			}

			const geometry = data.geometries?.vertexData?.find((v) => v.id === mesh.geometryId);

			if (geometry) {
				const geometryFileName = `${geometry.id}.babylonbinarymeshdata`;

				mesh.delayLoadingFile = `${sceneName}/${geometryFileName}`;
				mesh.boundingBoxMaximum = instantiatedMesh?.getBoundingInfo()?.maximum?.asArray() ?? [0, 0, 0];
				mesh.boundingBoxMinimum = instantiatedMesh?.getBoundingInfo()?.minimum?.asArray() ?? [0, 0, 0];
				mesh._binaryInfo = {};

				const geometryPath = join(scenePath, sceneName, geometryFileName);

				try {
					let writeGeometry = false;
					if (!savedGeometryIds.includes(geometry.id)) {
						writeGeometry = true;
						savedGeometryIds.push(geometry.id);
					}

					await writeBinaryGeometry({
						mesh,
						geometry,
						path: geometryPath,
						write: writeGeometry,
					});

					let geometryIndex = -1;
					do {
						geometryIndex = data.geometries!.vertexData!.findIndex((g) => g.id === mesh.geometryId);
						if (geometryIndex !== -1) {
							data.geometries!.vertexData!.splice(geometryIndex, 1);
						}
					} while (geometryIndex !== -1);

					savedGeometries.push(geometryFileName);
				} catch (e) {
					editor.layout.console.error(`Export: Failed to write geometry for mesh ${mesh.name}`);
				}
			}
		})
	);

	// Configure lights
	data.shadowGenerators?.forEach((shadowGenerator) => {
		const instantiatedLight = scene.getLightById(shadowGenerator.lightId);
		const instantiatedShadowGenerator = instantiatedLight?.getShadowGenerator();

		const light = data.lights?.find((light) => light.id === shadowGenerator.lightId);
		if (light && instantiatedShadowGenerator) {
			light.metadata ??= {};
			light.metadata.refreshRate = instantiatedShadowGenerator?.getShadowMap()?.refreshRate ?? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
		}
	});

	// Extract textures from particle systems.
	await Promise.all(
		data.particleSystems?.map(async (particleSystemData: any) => {
			const result = await extractParticleSystemTextures(editor, particleSystemData, {
				assetsDirectory: extractedTexturesOutputPath,
			});

			if (result) {
				exportedAssets.push(join(scenePath, result.relativePath));
			}
		})
	);

	// Extract textures from node materials.
	const nodeMaterials = data.materials?.filter((materialData) => {
		const existingMaterial = scene.getMaterialById(materialData.id);
		return existingMaterial && isNodeMaterial(existingMaterial);
	});

	if (nodeMaterials.length) {
		await Promise.all(
			nodeMaterials.map(async (materialData) => {
				const relativePaths = await extractNodeMaterialTextures(editor, {
					materialData,
					assetsDirectory: extractedTexturesOutputPath,
				});

				exportedAssets.push(...relativePaths.map((path) => join(scenePath, path)));
			})
		);
	}

	// Extract texture from node particle systems.
	const nodeParticleSystems = data.meshes?.filter((meshData) => {
		return meshData.isNodeParticleSystemMesh && meshData.nodeParticleSystemSet;
	});

	if (nodeParticleSystems.length) {
		await Promise.all(
			nodeParticleSystems.map(async (meshData) => {
				const relativePaths = await extractNodeParticleSystemSetTextures(editor, {
					assetsDirectory: extractedTexturesOutputPath,
					particlesData: meshData.nodeParticleSystemSet,
				});

				exportedAssets.push(...relativePaths.map((path) => join(scenePath, path)));
			})
		);
	}

	// Write final scene file.
	await writeJSON(join(scenePath, `${sceneName}.babylon`), data);

	// Clear old geometries
	const geometriesDir = join(scenePath, sceneName);
	const geometriesFiles = await readdir(geometriesDir);

	await Promise.all(
		geometriesFiles.map(async (file) => {
			if (!savedGeometries.includes(file)) {
				await remove(join(geometriesDir, file));
			}
		})
	);

	// Copy files
	const files = await normalizedGlob(join(projectDir, "/assets/**/*"), {
		nodir: true,
		ignore: {
			childrenIgnored: (p) => extname(p.name) === ".scene",
		},
	});

	// Export scripts
	await handleExportScripts(editor);

	// Export assets
	const promises: Promise<void>[] = [];
	const progressStep = 100 / files.length;

	let cache: Record<string, string> = {};
	try {
		cache = await readJSON(join(projectDir, "assets/.export-cache.json"));
	} catch (e) {
		// Catch silently.
	}

	for (const file of files) {
		if (promises.length >= 5) {
			await Promise.all(promises);
			promises.length = 0;
		}

		promises.push(
			new Promise<void>(async (resolve) => {
				await processAssetFile(editor, file.toString(), {
					cache,
					scenePath,
					projectDir,
					exportedAssets,
					optimize: options.optimize,
				});
				progress?.step(progressStep);
				dialog?.step(progressStep);
				resolve();
			})
		);
	}

	await Promise.all(promises);

	await writeJSON(join(projectDir, "assets/.export-cache.json"), cache, {
		encoding: "utf-8",
		spaces: "\t",
	});

	toast.dismiss(toastId);
	dialog?.dispose();

	if (options.optimize) {
		toast.success("项目已导出");

		const publicFiles = await normalizedGlob(join(projectDir, "/public/scene/assets/**/*"), {
			nodir: true,
		});

		publicFiles.forEach((file) => {
			if (!exportedAssets.includes(file.toString())) {
				remove(file);
			}
		});
	}
}
