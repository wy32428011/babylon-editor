import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { IMqttDriverContext, visibleAsNumber } from "babylonjs-editor-tools";

export default class ModelAnimationDriverComponent {
	@visibleAsNumber("旋转倍率", { step: 0.01 })
	public rotationMultiplier: number = 1;

	/**
	 * 创建模型动画驱动脚本实例。
	 * @param mesh 定义当前脚本绑定的模型根节点或网格。
	 */
	public constructor(public node: TransformNode) {}

	/**
	 * 接收 MQTT 或外部实时值，并把该值转换为模型动画状态。
	 * @param value 定义外部传入的驱动值。
	 * @param context 定义当前驱动调用的上下文信息。
	 */
	public onMqttValue(value: unknown, context: IMqttDriverContext): void {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) {
			return;
		}

		this.node.rotation.y = numericValue * this.rotationMultiplier;
	}
}
