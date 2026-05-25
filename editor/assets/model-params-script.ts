import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { visibleAsNumber, visibleAsString } from "babylonjs-editor-tools";

export default class ModelParamsComponent {
	@visibleAsString("设备编号")
	public deviceId: string = "";

	@visibleAsNumber("最小值", { step: 0.01 })
	public minValue: number = 0;

	@visibleAsNumber("最大值", { step: 0.01 })
	public maxValue: number = 1;

	/**
	 * 创建模型参数脚本实例。
	 * @param mesh 定义当前脚本绑定的模型根节点或网格。
	 */
	public constructor(public node: TransformNode) {}

	/**
	 * 参数脚本默认不执行逻辑，仅用于在属性面板中维护模型参数。
	 */
	public onStart(): void {
		// 参数脚本仅暴露配置字段，业务逻辑由动画驱动脚本实现。
	}
}
