/**
 * 定义编辑器使用的真实世界空间单位约定。
 */
export interface IEditorProjectSpace {
	/**
	 * 世界坐标单位。当前编辑器统一使用米。
	 */
	worldUnit: "m";

	/**
	 * 每 1 个 Babylon 世界单位对应的米数。
	 */
	metersPerUnit: 1;
}

/**
 * 编辑器默认空间单位：1 Babylon 世界单位 = 1 m。
 */
export const defaultEditorProjectSpace: IEditorProjectSpace = {
	worldUnit: "m",
	metersPerUnit: 1,
};

/**
 * 读取并规范化项目空间单位，旧项目缺失字段时按米处理。
 * @param space 定义项目或场景中保存的空间单位配置。
 */
export function getEditorProjectSpace(space?: Partial<IEditorProjectSpace> | null): IEditorProjectSpace {
	const metersPerUnit = space?.metersPerUnit === defaultEditorProjectSpace.metersPerUnit ? space.metersPerUnit : defaultEditorProjectSpace.metersPerUnit;

	return {
		worldUnit: defaultEditorProjectSpace.worldUnit,
		metersPerUnit,
	};
}

/**
 * 确保场景 metadata 带有空间单位配置，同时保留已有 metadata 内容。
 * @param metadata 定义场景原始 metadata。
 */
export function ensureSceneMetadataSpace(metadata?: Record<string, unknown> | null): Record<string, unknown> & { space: IEditorProjectSpace } {
	return {
		...(metadata ?? {}),
		space: getEditorProjectSpace((metadata as { space?: Partial<IEditorProjectSpace> } | null | undefined)?.space),
	};
}
