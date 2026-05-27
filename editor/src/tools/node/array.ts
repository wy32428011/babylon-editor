import { AbstractMesh, InstancedMesh, Mesh, Node, TransformNode, Vector3 } from "babylonjs";

import { Editor } from "../../editor/main";

import { isCollisionInstancedMesh, isCollisionMesh } from "../guards/nodes";
import { isNodeVisibleInGraph } from "./metadata";
import { cloneNode, ICloneNodeOptions } from "./clone";

export type NodeArrayMode = "instance" | "clone";
export type NodeArrayShape = "linear" | "grid";

export interface INodeArrayOptions {
	mode: NodeArrayMode;
	shape: NodeArrayShape;
	count: number;
	countX: number;
	countY: number;
	countZ: number;
	spacing: Vector3;
	createGroupRoot: boolean;
	cloneOptions: ICloneNodeOptions;
}

export interface ICreatedNodeArray {
	root: TransformNode | null;
	nodes: Node[];
}

export const MAX_NODE_ARRAY_ITEMS = 1000;

export function validateNodeArrayOptions(options: INodeArrayOptions): void {
	const counts = options.shape === "linear" ? [options.count] : [options.countX, options.countY, options.countZ];
	counts.forEach((count) => normalizeNodeArrayCount(count));

	const totalCount = getNodeArrayTotalCount(options);
	if (totalCount > MAX_NODE_ARRAY_ITEMS) {
		throw new Error(`阵列数量不能超过 ${MAX_NODE_ARRAY_ITEMS} 个。`);
	}
}

interface INodeArrayItem {
	index: number;
	offset: Vector3;
}

/**
 * 基于源模型节点创建一次性的线性或网格阵列。
 */
export function createNodeArray(editor: Editor, source: TransformNode | AbstractMesh, options: INodeArrayOptions): ICreatedNodeArray {
	validateNodeArrayOptions(options);
	const items = getNodeArrayItems(options);
	const createdNodes: Node[] = [];
	const groupRoot = options.createGroupRoot && items.length ? createArrayGroupRoot(source) : null;

	items.forEach((item) => {
		const nodes = options.mode === "clone" ? createCloneArrayItem(editor, source, options, item, groupRoot) : createInstanceArrayItem(source, item, groupRoot);
		createdNodes.push(...nodes);
	});

	return {
		root: groupRoot,
		nodes: createdNodes,
	};
}

/**
 * 计算阵列中除源对象以外每个元素的索引和偏移量。
 */
function getNodeArrayItems(options: INodeArrayOptions): INodeArrayItem[] {
	const items: INodeArrayItem[] = [];
	const totalCount = getNodeArrayTotalCount(options);

	if (options.shape === "linear") {
		for (let index = 1; index < totalCount; index++) {
			items.push({
				index,
				offset: options.spacing.scale(index),
			});
		}
		return items;
	}

	const countX = normalizeNodeArrayCount(options.countX);
	const countY = normalizeNodeArrayCount(options.countY);
	const countZ = normalizeNodeArrayCount(options.countZ);

	let index = 0;
	for (let z = 0; z < countZ; z++) {
		for (let y = 0; y < countY; y++) {
			for (let x = 0; x < countX; x++) {
				if (x === 0 && y === 0 && z === 0) {
					continue;
				}

				index++;
				items.push({
					index,
					offset: new Vector3(options.spacing.x * x, options.spacing.y * y, options.spacing.z * z),
				});
			}
		}
	}

	return items;
}

/**
 * 计算包含源对象在内的阵列元素总数。
 */
function getNodeArrayTotalCount(options: INodeArrayOptions): number {
	if (options.shape === "linear") {
		return normalizeNodeArrayCount(options.count);
	}

	return normalizeNodeArrayCount(options.countX) * normalizeNodeArrayCount(options.countY) * normalizeNodeArrayCount(options.countZ);
}

/**
 * 规范化用户输入的阵列数量，避免小数或无效数量进入生成循环。
 */
function normalizeNodeArrayCount(count: number): number {
	if (!Number.isFinite(count)) {
		throw new Error("阵列数量必须是有效数字。");
	}

	return Math.max(1, Math.floor(count));
}

/**
 * 创建用于整体移动阵列副本的分组根节点。
 */
function createArrayGroupRoot(source: TransformNode | AbstractMesh): TransformNode {
	const root = new TransformNode(`${source.name} 阵列`, source.getScene());
	root.parent = source.parent;
	root.position.copyFrom(source.position);
	return root;
}

/**
 * 根据是否存在分组根节点计算阵列元素的局部坐标。
 */
function getArrayItemPosition(source: TransformNode | AbstractMesh, item: INodeArrayItem, groupRoot: TransformNode | null): Vector3 {
	return groupRoot ? item.offset.clone() : source.position.add(item.offset);
}

/**
 * 创建一个克隆模式的阵列元素。
 */
function createCloneArrayItem(editor: Editor, source: TransformNode | AbstractMesh, options: INodeArrayOptions, item: INodeArrayItem, groupRoot: TransformNode | null): Node[] {
	const clone = cloneNode(editor, source, options.cloneOptions) as Node | null;
	if (!(clone instanceof TransformNode)) {
		clone?.dispose(false, false);
		return [];
	}

	clone.name = `${source.name} 阵列 ${item.index}`;
	clone.parent = groupRoot ?? source.parent;
	clone.position.copyFrom(getArrayItemPosition(source, item, groupRoot));
	return [clone];
}

function createInstanceArrayItem(source: TransformNode | AbstractMesh, item: INodeArrayItem, groupRoot: TransformNode | null): Node[] {
	const sourceMesh = getInstanceSourceMesh(source);
	if (sourceMesh) {
		const instance = createMeshInstance(sourceMesh, `${source.name} 阵列 ${item.index}`);
		copyTransform(source, instance);
		instance.parent = groupRoot ?? source.parent;
		instance.position.copyFrom(getArrayItemPosition(source, item, groupRoot));
		return [instance];
	}

	return createHierarchyInstanceArrayItem(source, item, groupRoot);
}

function createHierarchyInstanceArrayItem(source: TransformNode | AbstractMesh, item: INodeArrayItem, groupRoot: TransformNode | null): Node[] {
	const container = new TransformNode(`${source.name} 阵列 ${item.index}`, source.getScene());
	container.parent = groupRoot ?? source.parent;
	container.position.copyFrom(getArrayItemPosition(source, item, groupRoot));
	container.rotation.copyFrom(source.rotation);
	container.rotationQuaternion = source.rotationQuaternion?.clone() ?? null;
	container.scaling.copyFrom(source.scaling);

	const createdNodes: Node[] = [container];
	const sourceMeshes = getSourceMeshes(source);
	const transformNodeMap = new Map<Node | null, TransformNode>([[source, container]]);

	getSourceTransformNodes(source).forEach((node) => {
		const transform = new TransformNode(node.name, source.getScene());
		copyTransform(node, transform);
		transform.parent = transformNodeMap.get(node.parent) ?? container;
		transformNodeMap.set(node, transform);
		createdNodes.push(transform);
	});

	sourceMeshes.forEach((mesh) => {
		const instance = createMeshInstance(mesh, `${mesh.name} 阵列 ${item.index}`);
		copyTransform(mesh, instance);
		instance.parent = transformNodeMap.get(mesh.parent) ?? container;
		createdNodes.push(instance);
	});

	return createdNodes;
}

function createMeshInstance(mesh: Mesh, name: string): InstancedMesh {
	const instance = mesh.createInstance(name);
	instance.id = `${mesh.id || mesh.name}-array-${instance.uniqueId}`;
	instance.isPickable = mesh.isPickable;
	return instance;
}

function getInstanceSourceMesh(source: TransformNode | AbstractMesh): Mesh | null {
	if (source instanceof InstancedMesh) {
		return source.sourceMesh;
	}

	if (source instanceof Mesh && !source._masterMesh && source.geometry && isNodeVisibleInGraph(source) && !isCollisionMesh(source) && !isCollisionInstancedMesh(source)) {
		return source;
	}

	return null;
}

function getSourceMeshes(source: TransformNode | AbstractMesh): Mesh[] {
	const meshes = source instanceof Mesh ? [source, ...source.getChildMeshes(false)] : source.getChildMeshes(false);
	return meshes.filter((mesh): mesh is Mesh => {
		if (!(mesh instanceof Mesh) || mesh._masterMesh || !mesh.geometry) {
			return false;
		}

		if (!isNodeVisibleInGraph(mesh) || isCollisionMesh(mesh) || isCollisionInstancedMesh(mesh)) {
			return false;
		}

		return true;
	});
}

function getSourceTransformNodes(source: TransformNode | AbstractMesh): TransformNode[] {
	return source
		.getDescendants(false)
		.filter((node): node is TransformNode => node instanceof TransformNode && !(node instanceof AbstractMesh) && isNodeVisibleInGraph(node));
}

function copyTransform(source: TransformNode | AbstractMesh, target: TransformNode | AbstractMesh): void {
	target.position.copyFrom(source.position);
	target.rotation.copyFrom(source.rotation);
	target.rotationQuaternion = source.rotationQuaternion?.clone() ?? null;
	target.scaling.copyFrom(source.scaling);
}
