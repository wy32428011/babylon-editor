import { isAbsolute } from "path";
import { fileURLToPath } from "url";
import { join, dirname, basename } from "path/posix";
import { pathExists, readFile, readJSON, writeFile } from "fs-extra";

import axios from "axios";
import { toast } from "sonner";

import {
	CubeTexture,
	ISceneLoaderAsyncResult,
	Material,
	Node,
	Scene,
	ImportMeshAsync,
	Texture,
	Tools,
	ColorGradingTexture,
	Vector3,
	Quaternion,
	Sprite,
	IParticleSystem,
	HDRCubeTexture,
} from "babylonjs";

import { UniqueNumber } from "../../../../tools/tools";
import { isMesh } from "../../../../tools/guards/nodes";
import { isSprite } from "../../../../tools/guards/sprites";
import { isTexture } from "../../../../tools/guards/texture";
import { executeSimpleWorker } from "../../../../tools/worker";
import { isMultiMaterial } from "../../../../tools/guards/material";
import { configureSimultaneousLightsForMaterial } from "../../../../tools/material/material";
import { onNodesAddedObservable, onTextureAddedObservable } from "../../../../tools/observables";

import { projectConfiguration } from "../../../../project/configuration";

/**
 * 规范化导入贴图路径，保证 Windows 路径也能参与项目相对路径计算。
 */
function normalizeImportedTexturePath(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * 将 file URL 转成本地文件路径，无法解析时返回空值。
 */
function getLocalPathFromFileUrl(path: string): string | null {
	if (!path.startsWith("file:")) {
		return null;
	}

	try {
		return normalizeImportedTexturePath(fileURLToPath(path));
	} catch (e) {
		return null;
	}
}

/**
 * 判断贴图路径是否属于运行时 URL，不能改写为项目相对路径。
 */
function isRuntimeOnlyTexturePath(path: string): boolean {
	return path.startsWith("data:") || path.startsWith("blob:") || path.startsWith("http://") || path.startsWith("https://");
}

/**
 * 把项目内绝对路径转换为项目根相对路径。
 */
function getProjectRelativeTexturePath(absolutePath: string, projectRoot: string): string | null {
	const normalizedAbsolutePath = normalizeImportedTexturePath(absolutePath);
	if (!normalizedAbsolutePath.toLowerCase().startsWith(projectRoot.toLowerCase())) {
		return null;
	}

	return normalizedAbsolutePath.substring(projectRoot.length);
}

/**
 * 解析导入模型中的贴图路径，兼容绝对路径和模型文件所在目录的相对路径。
 */
function getImportedTextureProjectRelativePath(texturePath: string, importedAssetPath?: string): string | null {
	if (!projectConfiguration.path || !texturePath || isRuntimeOnlyTexturePath(texturePath)) {
		return null;
	}

	const projectDir = dirname(projectConfiguration.path);
	const projectRoot = normalizeImportedTexturePath(join(projectDir, "/"));
	const textureLocalPath = getLocalPathFromFileUrl(texturePath);
	let normalizedTexturePath = normalizeImportedTexturePath(textureLocalPath ?? texturePath);

	if (normalizedTexturePath.startsWith("./")) {
		normalizedTexturePath = normalizedTexturePath.substring(2);
	}

	if (isAbsolute(normalizedTexturePath)) {
		return getProjectRelativeTexturePath(normalizedTexturePath, projectRoot);
	}

	if (normalizedTexturePath === "assets" || normalizedTexturePath.startsWith("assets/")) {
		return normalizedTexturePath;
	}

	if (!importedAssetPath) {
		return null;
	}

	// GLTF/OBJ 等模型常把贴图写成模型文件旁的相对路径，这里统一改成项目根相对路径供保存和 Play 导出使用。
	const importedLocalPath = normalizeImportedTexturePath(getLocalPathFromFileUrl(importedAssetPath) ?? importedAssetPath);
	const absoluteFromImportedAsset = normalizeImportedTexturePath(join(dirname(importedLocalPath), normalizedTexturePath));
	return getProjectRelativeTexturePath(absoluteFromImportedAsset, projectRoot);
}

export async function tryConvertSceneFile(absolutePath: string, progress?: (percent: number) => void) {
	const toolsUrl = process.env.EDITOR_TOOLS_URL ?? "https://editor.babylonjs.com";
	const buffer = (await readFile(absolutePath)) as Buffer;
	const blob = new Blob([new Uint8Array(buffer)], { type: "application/octet-stream" });
	const file = new File([blob], basename(absolutePath), { type: "application/octet-stream" });

	const form = new FormData();
	form.append("file", file);

	try {
		const { data } = await axios.post(`${toolsUrl}/api/converter`, form, {
			responseType: "arraybuffer",
			onUploadProgress: (event) => {
				if (event.progress) {
					progress?.(event.progress * 100);
				}
			},
		});

		const destination = join(dirname(absolutePath), `editor-generated_${basename(absolutePath)}.glb`);
		await writeFile(destination, Buffer.from(data));

		return destination;
	} catch (e) {
		console.error(e);
		return "";
	}
}

/**
 * 定义导入场景文件时需要覆盖的编辑器处理选项。
 */
export interface ILoadImportedSceneFileOptions {
	/**
	 * 是否保留导入根节点的原始缩放。
	 * @deprecated 导入链路默认保留真实尺寸，该选项仅兼容旧调用方。
	 */
	preserveRootScaling?: boolean;
	/**
	 * 导入底层加载失败时的错误回调，用于业务入口写入更清晰的日志。
	 */
	onError?: (error: unknown) => void;
	/**
	 * 是否跳过通用导入失败提示，避免业务入口重复弹出错误。
	 */
	suppressFailureToast?: boolean;
}

export async function loadImportedSceneFile(scene: Scene, absolutePath: string, options?: ILoadImportedSceneFileOptions) {
	if (!projectConfiguration.path) {
		return null;
	}

	let result: ISceneLoaderAsyncResult;

	try {
		result = await ImportMeshAsync(basename(absolutePath), scene, {
			rootUrl: join(dirname(absolutePath), "/"),
		});
		// result = await SceneLoader.ImportMeshAsync("", join(dirname(absolutePath), "/"), basename(absolutePath), scene);
	} catch (e) {
		console.error(e);
		options?.onError?.(e);
		if (!options?.suppressFailureToast) {
			toast.error("Failed to load the scene file.");
		}
		return null;
	}

	const root = result.meshes.find((m) => m.name === "__root__");
	if (root) {
		root.name = basename(absolutePath);

		// TODO: try cleaning the gltf to remove useless transform nodes. Also, does it make sens to clean the gltf for the user?
		// cleanImportedGltf(result);
	}

	result.meshes.forEach((mesh) => {
		configureImportedNodeIds(mesh);

		mesh.receiveShadows = true;

		if (mesh.skeleton) {
			mesh.skeleton.id = Tools.RandomId();
			mesh.skeleton["_uniqueId"] = UniqueNumber.Get();
			mesh.skeleton.bones.forEach((bone) => configureImportedNodeIds(bone));
		}

		if (mesh.morphTargetManager) {
			mesh.morphTargetManager["_uniqueId"] = UniqueNumber.Get();

			for (let i = 0, len = mesh.morphTargetManager.numTargets; i < len; i++) {
				const target = mesh.morphTargetManager.getTarget(i);
				if (!target) {
					continue;
				}

				target.id = Tools.RandomId();
				target["_uniqueId"] = UniqueNumber.Get();
				target.name = `${mesh.name}_${target.name}`;
			}
		}
	});

	result.lights.forEach((light) => configureImportedNodeIds(light));
	result.transformNodes.forEach((transformNode) => configureImportedNodeIds(transformNode));
	result.animationGroups.forEach((animationGroup) => (animationGroup.uniqueId = UniqueNumber.Get()));

	scene.lights.forEach((light) => {
		const shadowMap = light.getShadowGenerator()?.getShadowMap();
		if (!shadowMap?.renderList) {
			return;
		}

		result.meshes.forEach((mesh) => {
			shadowMap.renderList!.push(mesh);
		});
	});

	const configuredEmbeddedTextures: number[] = [];

	result.meshes.forEach((mesh) => {
		if (isMesh(mesh)) {
			if (mesh.geometry) {
				mesh.geometry.id = Tools.RandomId();
				mesh.geometry.uniqueId = UniqueNumber.Get();
			}

			if (mesh.material) {
				configureImportedMaterial(mesh.material);

				if (isMultiMaterial(mesh.material)) {
					mesh.material.subMaterials.forEach((subMaterial) => {
						if (subMaterial) {
							configureImportedMaterial(subMaterial);
							configureSimultaneousLightsForMaterial(subMaterial);
						}
					});
				} else {
					configureSimultaneousLightsForMaterial(mesh.material);
				}
			}
		}

		const textures = mesh.material?.getActiveTextures();

		textures?.forEach((texture) => {
			if (isTexture(texture)) {
				if (configuredEmbeddedTextures.includes(texture.uniqueId)) {
					return;
				}

				configuredEmbeddedTextures.push(texture.uniqueId);

				configureImportedTexture(texture, false, absolutePath);
				configureEmbeddedTexture(texture, absolutePath);
			}
		});
	});

	onNodesAddedObservable.notifyObservers();

	return result;
}

export function configureImportedNodeIds(node: Node | Sprite | IParticleSystem) {
	if (!isSprite(node)) {
		node.id = Tools.RandomId();
	}

	node.uniqueId = UniqueNumber.Get();
}

export function configureImportedMaterial(material: Material) {
	material.id = Tools.RandomId();
	material.uniqueId = UniqueNumber.Get();
}

/**
 * 统一导入贴图的持久化路径，避免编辑预览能显示但 Play 模式找不到模型目录相对贴图。
 */
export function configureImportedTexture<T extends Texture | CubeTexture | ColorGradingTexture | HDRCubeTexture>(texture: T, noCheckInvertY?: boolean, importedAssetPath?: string): T {
	const sourcePath = [texture.url, texture.name].find((value) => value && !isRuntimeOnlyTexturePath(value));
	if (!sourcePath) {
		return texture;
	}

	const sourceLocalPath = normalizeImportedTexturePath(getLocalPathFromFileUrl(sourcePath) ?? sourcePath);
	const relativePath = getImportedTextureProjectRelativePath(sourcePath, importedAssetPath);
	if (relativePath) {
		if (isAbsolute(sourceLocalPath) && !noCheckInvertY && isTexture(texture) && !texture.invertY && !texture._buffer) {
			texture._invertY = true;
			texture.vScale *= -1;
			texture.updateURL(sourceLocalPath);
		}

		texture.name = relativePath;
		texture.url = relativePath;
	}

	return texture;
}

export async function configureEmbeddedTexture(texture: Texture, absolutePath: string) {
	if (!projectConfiguration.path) {
		return;
	}

	if (!texture._buffer || !texture.mimeType) {
		return onTextureAddedObservable.notifyObservers(texture);
	}

	if (texture.url && texture.url.startsWith("data:")) {
		const path = texture.url.split("data:")[1];
		try {
			if (await pathExists(path)) {
				return cleanTexture(texture, path);
			}
		} catch (e) {
			// Catch silently.
		}
	}

	let extension = "";
	switch (texture.mimeType) {
		case "image/png":
			extension = "png";
			break;
		case "image/gif":
			extension = "gif";
			break;
		case "image/jpeg":
			extension = "jpg";
			break;
		case "image/bmp":
			extension = "bmp";
			break;
		default:
			return;
	}

	let buffer: Buffer;
	if (typeof texture._buffer === "string") {
		const byteString = atob(texture._buffer);
		const ab = new ArrayBuffer(byteString.length);

		const ia = new Uint8Array(ab);
		for (let i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}

		buffer = Buffer.from(ia);
	} else {
		buffer = Buffer.from(texture._buffer as Uint8Array);
	}

	let filename = texture.url;
	filename = filename?.split(":")[1] ?? filename; // in case prefiexed by data:

	if (filename && !(await pathExists(filename))) {
		const hash = await executeSimpleWorker("workers/md5.js", buffer);
		filename = join(dirname(absolutePath), `editor-generated_${hash}.${extension}`);

		if (!(await pathExists(filename))) {
			await writeFile(filename, buffer);
		}

		if (!texture.invertY) {
			texture._invertY = true;
			texture.vScale *= -1;
			texture.updateURL(filename);
		}
	}

	if (!filename) {
		return;
	}

	cleanTexture(texture, filename);
}

export function cleanTexture(texture: Texture, filename: string) {
	texture._buffer = null;

	if (!texture.invertY) {
		texture._invertY = true;
		texture.vScale *= -1;
		texture.updateURL(filename);
	}

	const relativePath = filename.replace(join(dirname(projectConfiguration.path!), "/"), "");
	texture.name = relativePath;
	texture.url = relativePath;

	onTextureAddedObservable.notifyObservers(texture);
}

export async function loadImportedMaterial(scene: Scene, absolutePath: string) {
	if (!projectConfiguration.path) {
		return null;
	}

	const data = await readJSON(absolutePath);
	const uniqueId = data.uniqueId;

	const existingMaterial = scene.materials.find((material) => material.uniqueId === uniqueId);
	if (existingMaterial) {
		return existingMaterial;
	}

	const material = Material.Parse(data, scene, join(dirname(projectConfiguration.path!), "/"));
	if (!material) {
		return null;
	}

	material.uniqueId = uniqueId;

	return material;
}

export function cleanImportedGltf(result: ISceneLoaderAsyncResult) {
	const identityQuaternion = Quaternion.Identity();
	const allBones = result?.skeletons.map((s) => s.bones).flat();

	result.transformNodes.slice().forEach((transformNode) => {
		if (
			transformNode.position.equalsWithEpsilon(Vector3.ZeroReadOnly) &&
			(transformNode.rotation.equalsWithEpsilon(Vector3.ZeroReadOnly) || transformNode.rotationQuaternion?.equalsWithEpsilon(identityQuaternion)) &&
			transformNode.scaling.equalsWithEpsilon(Vector3.OneReadOnly) &&
			!allBones.find((b) => b._linkedTransformNode === transformNode)
		) {
			const descendants = transformNode.getDescendants(true);
			descendants.forEach((node) => {
				node.parent = transformNode.parent;
			});

			transformNode.dispose(true, false);
		}
	});
}
