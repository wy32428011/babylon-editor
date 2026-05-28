import { AbstractMesh, Node, TransformNode, Vector3 } from "babylonjs";

export type EditorImportedModelNodeRole = "root" | "child";

export interface IEditorImportedModelMetadata {
	/**
	 * 定义导入模型根节点的 id，用于在 Graph 和拾取逻辑中把内部节点归并到整体模型。
	 */
	rootId: string;
	/**
	 * 定义导入模型根节点的 uniqueId，用于辅助识别运行时生成或重命名后的模型根节点。
	 */
	rootUniqueId: number;
	/**
	 * 定义模型文件路径，优先使用项目相对路径，便于后续排查导入来源。
	 */
	modelPath: string;
	/**
	 * 定义当前节点在导入模型中的角色。
	 */
	role: EditorImportedModelNodeRole;
	/**
	 * 定义是否在 Graph 中隐藏内部子节点。
	 */
	hideChildrenInGraph: boolean;
	/**
	 * 记录节点原始缩放，参数脚本按原始缩放应用尺寸时不会重复累乘。
	 */
	originalScaling?: [number, number, number];
}

type ImportedModelRoot = AbstractMesh | TransformNode;

/**
 * 读取节点上的导入模型元数据。
 * @param node 定义待读取的 Babylon 节点。
 */
export function getEditorImportedModelMetadata(node: Node): IEditorImportedModelMetadata | null {
	return (node.metadata?.editorImportedModel as IEditorImportedModelMetadata | undefined) ?? null;
}

/**
 * 判断节点是否是导入模型根节点。
 * @param node 定义待判断的 Babylon 节点。
 */
export function isEditorImportedModelRoot(node: Node): boolean {
	return getEditorImportedModelMetadata(node)?.role === "root";
}

/**
 * 判断节点是否是需要在 Graph 中隐藏的导入模型内部节点。
 * @param node 定义待判断的 Babylon 节点。
 */
export function shouldHideEditorImportedModelNodeInGraph(node: Node): boolean {
	const metadata = getEditorImportedModelMetadata(node);
	return metadata?.role === "child" && metadata.hideChildrenInGraph;
}

/**
 * 标记导入模型根节点和所有后代，Graph 与拾取逻辑会据此只暴露整体根节点。
 * @param root 定义本次导入模型的整体根节点。
 * @param modelPath 定义模型来源路径。
 */
export function markEditorImportedModel(root: ImportedModelRoot, modelPath: string): void {
	if (!root.id) {
		root.id = root.name || `imported-model-${root.uniqueId}`;
	}

	const rootMetadata = createEditorImportedModelMetadata(root, root, modelPath, "root");
	root.metadata = {
		...root.metadata,
		editorImportedModel: rootMetadata,
	};

	getNodeDescendants(root).forEach((node) => {
		node.metadata = {
			...node.metadata,
			editorImportedModel: createEditorImportedModelMetadata(root, node, modelPath, "child"),
		};
	});
}

/**
 * 从任意导入模型内部节点向上查找整体根节点。
 * @param node 定义当前拾取或解析到的节点。
 */
export function findEditorImportedModelRoot(node: Node): Node | null {
	const metadata = getEditorImportedModelMetadata(node);
	if (!metadata) {
		return null;
	}

	let current: Node | null = node;
	while (current) {
		const currentMetadata = getEditorImportedModelMetadata(current);
		if (currentMetadata?.role === "root" && (currentMetadata.rootId === metadata.rootId || currentMetadata.rootUniqueId === metadata.rootUniqueId)) {
			return current;
		}

		current = current.parent;
	}

	return null;
}

/**
 * 创建导入模型元数据，并保留节点原始缩放。
 * @param root 定义导入模型根节点。
 * @param node 定义当前需要标记的节点。
 * @param modelPath 定义模型来源路径。
 * @param role 定义当前节点角色。
 */
function createEditorImportedModelMetadata(root: ImportedModelRoot, node: Node, modelPath: string, role: EditorImportedModelNodeRole): IEditorImportedModelMetadata {
	const existing = getEditorImportedModelMetadata(node);
	return {
		rootId: root.id,
		rootUniqueId: root.uniqueId,
		modelPath,
		role,
		hideChildrenInGraph: true,
		originalScaling: existing?.originalScaling ?? getNodeScalingTuple(node),
	};
}

/**
 * 返回节点后代，兼容 Babylon Node 上的可选 getDescendants API。
 * @param root 定义导入模型根节点。
 */
function getNodeDescendants(root: ImportedModelRoot): Node[] {
	const getDescendants = (root as { getDescendants?: (directDescendantsOnly?: boolean) => Node[] }).getDescendants;
	return getDescendants?.call(root, false) ?? [];
}

/**
 * 读取节点缩放三元组，不支持缩放的节点返回单位缩放。
 * @param node 定义待读取的 Babylon 节点。
 */
function getNodeScalingTuple(node: Node): [number, number, number] {
	const scaling = (node as { scaling?: Vector3 }).scaling;
	return scaling ? [scaling.x, scaling.y, scaling.z] : [1, 1, 1];
}
