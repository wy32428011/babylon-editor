import { join, dirname, basename } from "path/posix";

import { Node, AnimationGroup, Tags } from "babylonjs";

import { Editor } from "../../editor/main";
import { SceneLinkNode } from "../../editor/nodes/scene-link";

import { isSceneLinkNode } from "../../tools/guards/scene";

import { projectConfiguration } from "../../project/configuration";

export type CreateSceneLinkOptions = {
	/**
	 * 定义场景链接是否继承本次场景加载的低硬件占用模式。
	 */
	safeMode?: boolean;
};

export async function createSceneLink(editor: Editor, absolutePath: string, options?: CreateSceneLinkOptions) {
	if (!projectConfiguration.path) {
		return;
	}

	const node = new SceneLinkNode(basename(absolutePath), editor.layout.preview.scene, editor, options);

	const relativePath = absolutePath.replace(join(dirname(projectConfiguration.path!), "/"), "");
	await node.setRelativePath(relativePath);

	editor.layout.graph.refresh();
	editor.layout.inspector.setEditedObject(node);

	return node;
}

/**
 * Returns wether or not the given node is a descendant of a SceneLinkNode instance.
 */
export function isFromSceneLink(node: Node) {
	let parent: Node | null = node;
	while (parent) {
		if (isSceneLinkNode(parent)) {
			return true;
		}

		parent = parent.parent;
	}

	return false;
}

/**
 * Returns whether or not the given animation group comes from a SceneLinkNode instance.
 */
export function isAnimationGroupFromSceneLink(animationGroup: AnimationGroup) {
	return Tags.MatchesQuery(animationGroup, "from-scene-link");
}

/**
 * Returns the firt root SceneLinkNode found for the given node.
 * In case the node is not from a scene link, "null" is returned.
 */
export function getRootSceneLink(node: Node) {
	let parent: Node | null = node;
	while (parent) {
		if (isSceneLinkNode(parent)) {
			return parent;
		}

		parent = parent.parent;
	}

	return null;
}
