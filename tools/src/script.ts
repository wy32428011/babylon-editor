/**
 * MQTT 驱动脚本接收外部值时使用的上下文信息。
 */
export interface IMqttDriverContext {
	/**
	 * 当前脚本绑定的 Babylon 对象。
	 */
	object: any;

	/**
	 * 当前脚本运行所在的 Babylon 场景。
	 */
	scene: any;

	/**
	 * 当前被调用的脚本 key。
	 */
	scriptKey: string;

	/**
	 * MQTT 消息来源 topic，未接入真实 MQTT 时可以为空。
	 */
	topic?: string;

	/**
	 * MQTT 原始消息负载，调用方可按需传入。
	 */
	payload?: unknown;

	/**
	 * 当前驱动值分发的时间戳。
	 */
	timestamp: number;
}

export type ModelSidecarParametersApplyReason = "editor" | "runtime";

export interface IModelSidecarParameterValue {
	type?: string;
	description?: string;
	value: unknown;
}

/**
 * 模型参数脚本实时应用时使用的上下文信息。
 */
export interface IModelSidecarParametersContext {
	/**
	 * 当前脚本绑定的模型根对象。
	 */
	object: any;

	/**
	 * 当前脚本运行所在的 Babylon 场景。
	 */
	scene: any;

	/**
	 * 当前被调用的参数脚本 key。
	 */
	scriptKey: string;

	/**
	 * Inspector 中保存的参数字段值。
	 */
	values: Record<string, IModelSidecarParameterValue>;

	/**
	 * 定义本次应用来自编辑器实时预览还是运行时加载。
	 */
	reason: ModelSidecarParametersApplyReason;

	/**
	 * 按节点名称查找模型根节点下的所有匹配后代。
	 * @param name 定义待查找的节点名称。
	 */
	findDescendantsByName(name: string): any[];

	/**
	 * 按节点名称查找模型根节点下的第一个匹配后代。
	 * @param name 定义待查找的节点名称。
	 */
	findDescendantByName(name: string): any | null;

	/**
	 * 读取节点初次参与参数应用时的原始缩放。
	 * @param node 定义待读取的节点。
	 */
	getOriginalScaling(node: any): any;

	/**
	 * 按原始缩放设置节点缩放，避免多次参数编辑造成累乘。
	 * @param node 定义待缩放的节点。
	 * @param scaling 定义相对原始缩放的倍率。
	 */
	setNodeScaling(node: any, scaling: any): void;

	/**
	 * 按名称查找后代并按原始缩放设置缩放。
	 * @param name 定义待缩放的节点名称。
	 * @param scaling 定义相对原始缩放的倍率。
	 */
	setDescendantScaling(name: string, scaling: any): void;
}

/**
 * Defines the interface that can be implemented by scripts attached to nodes in the editor.
 */
export interface IScript {
	/**
	 * Method called when the script starts. This method is called only once.
	 */
	onStart?(object: any): void;

	/**
	 * Method called on each frame.
	 */
	onUpdate?(object: any): void;

	/**
	 * Method called on the script is stopped or the object is disposed.
	 */
	onStop?(object: any): void;

	/**
	 * 接收 MQTT 或外部实时数据，用于驱动当前脚本控制的动画。
	 */
	onMqttValue?(value: unknown, context: IMqttDriverContext): void;

	/**
	 * 参数脚本字段变化或场景加载时调用，用于把模型参数实时应用到内部部件。
	 */
	onApplyParameters?(context: IModelSidecarParametersContext): void;
}
