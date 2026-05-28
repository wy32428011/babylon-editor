import { Color3, Material, StandardMaterial, TransformNode, type AbstractMesh, type Node } from "babylonjs";

/**
 * 查找 CAD 根节点下的图层根节点。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 */
export function getCadLayerRoots(root: TransformNode): TransformNode[] {
	return root.getChildren((node) => node instanceof TransformNode && node.metadata?.cadLayer) as TransformNode[];
}

/**
 * 设置指定 CAD 图层显示状态。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 * @param layerName 定义原始 CAD 图层名。
 * @param enabled 定义是否启用该图层。
 */
export function setCadLayerEnabled(root: TransformNode, layerName: string, enabled: boolean): void {
	for (const layerRoot of getCadLayerRoots(root)) {
		if (layerRoot.metadata?.cadLayer?.name === layerName) {
			layerRoot.setEnabled(enabled);
		}
	}
}

/**
 * 设置指定 CAD 图层线条颜色。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 * @param layerName 定义原始 CAD 图层名。
 * @param color 定义十六进制颜色。
 */
export function setCadLayerColor(root: TransformNode, layerName: string, color: string): void {
	const color3 = Color3.FromHexString(color);
	for (const layerRoot of getCadLayerRoots(root)) {
		if (layerRoot.metadata?.cadLayer?.name !== layerName) {
			continue;
		}

		for (const child of layerRoot.getChildMeshes(false)) {
			(child as AbstractMesh & { color?: Color3 }).color = color3;
		}
	}
}

/**
 * 设置 CAD 地面贴图透明度。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 * @param alpha 定义 0 到 1 的透明度。
 */
export function setCadGroundAlpha(root: TransformNode, alpha: number): void {
	const clampedAlpha = Math.min(1, Math.max(0, alpha));
	for (const mesh of getCadGroundMeshes(root)) {
		if (mesh.material instanceof StandardMaterial) {
			mesh.material.alpha = clampedAlpha;
			mesh.material.transparencyMode = Material.MATERIAL_ALPHABLEND;
			mesh.material.markAsDirty(Material.MiscDirtyFlag);
		}
	}
}

/**
 * 设置 CAD 地面贴图显示状态。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 * @param enabled 定义是否显示地面贴图。
 */
export function setCadGroundEnabled(root: TransformNode, enabled: boolean): void {
	for (const mesh of getCadGroundMeshes(root)) {
		mesh.setEnabled(enabled);
	}
}

/**
 * 锁定 CAD 贴地对象，不参与场景拾取。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 */
export function lockCadGroundPicking(root: TransformNode): void {
	for (const mesh of root.getChildMeshes(false)) {
		mesh.isPickable = false;
	}
}

/**
 * 查找 CAD 根节点下的地面网格。
 * @param root 定义 CAD_GROUND_ROOT 根节点。
 */
function getCadGroundMeshes(root: TransformNode): AbstractMesh[] {
	return root.getChildMeshes(false).filter(isCadGroundMesh);
}

/**
 * 判断节点是否是 CAD 地面网格。
 * @param node 定义待检查节点。
 */
function isCadGroundMesh(node: Node): node is AbstractMesh {
	return Boolean((node as AbstractMesh).material && node.metadata?.cadGround);
}
