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
}
