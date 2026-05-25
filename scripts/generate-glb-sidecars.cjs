const fs = require("fs");
const path = require("path");

const ROOT_DIR = "E:\\公司文件\\数字孪生\\模型文件\\GLB";

const MODELS = [
	{
		name: "多穿小车",
		params: {
			primaryNodeNames: "node_0",
			secondaryNodeNames: "huocha1,cha1,cha2",
			statusNodeNames: "zaihuo,zaihuo01",
			motionAxis: "x",
			defaultSpeed: 1,
			travelDistance: 10,
			rotationSpeed: 6.28,
		},
		animations: [
			{ name: "move", label: "整体行走", kind: "translation", targetNodeNames: "", axis: "x", distance: 10, speed: 1 },
			{ name: "fork", label: "货叉伸缩", kind: "translation", targetNodeNames: "huocha1,cha1,cha2", axis: "z", distance: 2, speed: 1 },
			{ name: "load", label: "载货显隐", kind: "visibility", targetNodeNames: "zaihuo,zaihuo01", axis: "y", distance: 0, speed: 1 },
		],
	},
	{
		name: "辊道机",
		params: {
			primaryNodeNames: "GT1,GT2,GT3,GT4,GT5,GT6,GT7,GT8,GT9,GT10",
			secondaryNodeNames: "A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,A16,A17,A18,A19,A20,A21",
			statusNodeNames: "GT1,GT2,GT3,GT4,GT5,GT6,GT7,GT8,GT9,GT10",
			motionAxis: "x",
			defaultSpeed: 6.28,
			travelDistance: 1,
			rotationSpeed: 6.28,
		},
		animations: [
			{
				name: "roller",
				label: "辊筒旋转",
				kind: "rotation",
				targetNodeNames: "GT1,GT2,GT3,GT4,GT5,GT6,GT7,GT8,GT9,GT10,A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,A16,A17,A18,A19,A20,A21",
				axis: "x",
				distance: 0,
				speed: 6.28,
			},
			{ name: "motor", label: "电机状态", kind: "motor", targetNodeNames: "GT1,GT2,GT3,GT4,GT5,GT6,GT7,GT8,GT9,GT10", axis: "x", distance: 0, speed: 6.28 },
		],
	},
	{
		name: "链条机",
		params: {
			primaryNodeNames: "Rail_01_M001,Rail_02_M001,ZJ,ZJ01",
			secondaryNodeNames: "DJ,Box003,Box004",
			statusNodeNames: "DJ",
			motionAxis: "x",
			defaultSpeed: 1,
			travelDistance: 1,
			rotationSpeed: 6.28,
		},
		animations: [
			{ name: "chain", label: "链条循环", kind: "loopTranslation", targetNodeNames: "Rail_01_M001,Rail_02_M001,ZJ,ZJ01", axis: "x", distance: 1, speed: 1 },
			{ name: "motor", label: "电机状态", kind: "motor", targetNodeNames: "DJ", axis: "y", distance: 0, speed: 6.28 },
		],
	},
	{
		name: "GD_有电机_Optimized(1)",
		params: {
			primaryNodeNames: "GD_1,GD_2,GD_3,GD_4,GD_5,GD_6,GD_7,GD_8,GD_9",
			secondaryNodeNames: "对象028,对象027,对象026,对象025,对象024,对象023,对象022,对象021,对象020",
			statusNodeNames: "GD_1,GD_2,GD_3,GD_4,GD_5,GD_6,GD_7,GD_8,GD_9",
			motionAxis: "x",
			defaultSpeed: 6.28,
			travelDistance: 1,
			rotationSpeed: 6.28,
		},
		animations: [
			{ name: "roller", label: "输送辊旋转", kind: "rotation", targetNodeNames: "GD_1,GD_2,GD_3,GD_4,GD_5,GD_6,GD_7,GD_8,GD_9", axis: "x", distance: 0, speed: 6.28 },
			{ name: "motor", label: "电机状态", kind: "motor", targetNodeNames: "GD_1,GD_2,GD_3,GD_4,GD_5,GD_6,GD_7,GD_8,GD_9", axis: "x", distance: 0, speed: 6.28 },
		],
	},
	{
		name: "HCTS",
		params: {
			primaryNodeNames: "",
			secondaryNodeNames: "",
			statusNodeNames: "",
			motionAxis: "y",
			defaultSpeed: 1,
			travelDistance: 1,
			rotationSpeed: 1,
		},
		animations: [{ name: "state", label: "设备状态", kind: "state", targetNodeNames: "", axis: "y", distance: 0, speed: 1 }],
	},
	{
		name: "LED",
		params: {
			primaryNodeNames: "Box009,Box010",
			secondaryNodeNames: "",
			statusNodeNames: "Box009,Box010",
			motionAxis: "y",
			defaultSpeed: 4,
			travelDistance: 0,
			rotationSpeed: 0,
		},
		animations: [
			{ name: "blink", label: "灯光闪烁", kind: "blink", targetNodeNames: "Box009,Box010", axis: "y", distance: 0, speed: 4 },
			{ name: "status", label: "灯光状态", kind: "state", targetNodeNames: "Box009,Box010", axis: "y", distance: 0, speed: 1 },
		],
	},
	{
		name: "RGV",
		params: {
			primaryNodeNames: "main",
			secondaryNodeNames: "CSC-guidao,CSC-guidao.001",
			statusNodeNames: "main",
			motionAxis: "x",
			defaultSpeed: 1,
			travelDistance: 12,
			rotationSpeed: 1,
		},
		animations: [
			{ name: "move", label: "轨道行走", kind: "translation", targetNodeNames: "", axis: "x", distance: 12, speed: 1 },
			{ name: "state", label: "整车状态", kind: "state", targetNodeNames: "main", axis: "y", distance: 0, speed: 1 },
		],
	},
	{
		name: "Shelf",
		params: {
			primaryNodeNames: "",
			secondaryNodeNames: "Box023.1,Box021.2,Box004.3,Box001.4,Box002.5,Box003.6",
			statusNodeNames: "",
			motionAxis: "y",
			defaultSpeed: 1,
			travelDistance: 0,
			rotationSpeed: 0,
		},
		animations: [
			{ name: "state", label: "货架状态", kind: "state", targetNodeNames: "", axis: "y", distance: 0, speed: 1 },
			{ name: "slot", label: "库位占用", kind: "state", targetNodeNames: "Box023.1,Box021.2,Box004.3,Box001.4,Box002.5,Box003.6", axis: "y", distance: 0, speed: 1 },
		],
	},
	{
		name: "Stacker",
		params: {
			primaryNodeNames: "",
			secondaryNodeNames: "huocha.9,huocha2.10,xiang.13,dianji.7",
			statusNodeNames: "huocha.9,huocha2.10,xiang.13",
			motionAxis: "x",
			defaultSpeed: 1,
			travelDistance: 18,
			rotationSpeed: 1,
		},
		animations: [
			{ name: "travel", label: "堆垛机行走", kind: "translation", targetNodeNames: "", axis: "x", distance: 18, speed: 1 },
			{ name: "lift", label: "载货台升降", kind: "translation", targetNodeNames: "huocha.9,huocha2.10,xiang.13", axis: "y", distance: 8, speed: 1 },
			{ name: "fork", label: "货叉伸缩", kind: "translation", targetNodeNames: "huocha.9,huocha2.10", axis: "z", distance: 2, speed: 1 },
		],
	},
	{
		name: "WLTS",
		params: {
			primaryNodeNames: "GT,A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,A16,A17,A18,A19,A20,A21,A22",
			secondaryNodeNames: "DJ",
			statusNodeNames: "DJ",
			motionAxis: "x",
			defaultSpeed: 6.28,
			travelDistance: 1,
			rotationSpeed: 6.28,
		},
		animations: [
			{
				name: "roller",
				label: "辊筒旋转",
				kind: "rotation",
				targetNodeNames: "GT,A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,A16,A17,A18,A19,A20,A21,A22",
				axis: "x",
				distance: 0,
				speed: 6.28,
			},
			{ name: "motor", label: "电机状态", kind: "motor", targetNodeNames: "DJ", axis: "y", distance: 0, speed: 6.28 },
		],
	},
	{
		name: "YZJ",
		params: {
			primaryNodeNames: "Ban.4,GT.3",
			secondaryNodeNames: "EQ_LSDSYZ.1,ZT.2",
			statusNodeNames: "EQ_LSDSYZ.1,ZT.2,Ban.4",
			motionAxis: "x",
			defaultSpeed: 1,
			travelDistance: 3,
			rotationSpeed: 6.28,
		},
		animations: [
			{ name: "transfer", label: "移载动作", kind: "translation", targetNodeNames: "Ban.4", axis: "x", distance: 3, speed: 1 },
			{ name: "roller", label: "辊筒旋转", kind: "rotation", targetNodeNames: "GT.3", axis: "x", distance: 0, speed: 6.28 },
			{ name: "state", label: "整体状态", kind: "state", targetNodeNames: "EQ_LSDSYZ.1,ZT.2,Ban.4", axis: "y", distance: 0, speed: 1 },
		],
	},
];

/** 将普通字符串转换为 TypeScript 字符串字面量。 */
function tsString(value) {
	return JSON.stringify(value);
}

/** 返回生成文件顶部的中文说明。 */
function fileHeader(modelName, description) {
	return `// 此文件由 scripts/generate-glb-sidecars.cjs 生成，用于模型 ${modelName} 的${description}。\n// 可在编辑器 Inspector 中调整带装饰器的字段，以适配现场设备点位。\n\n`;
}

/** 生成模型参数外挂脚本。 */
function createParamsScript(model) {
	const params = model.params;

	return `${fileHeader(model.name, "参数外挂脚本")}import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { visibleAsBoolean, visibleAsNumber, visibleAsString } from "babylonjs-editor-tools";

/**
 * 管理 ${model.name} 模型在属性面板中展示的基础参数。
 */
export default class ModelSidecarParamsComponent {
\t@visibleAsString("模型名称")
\tpublic modelName: string = ${tsString(model.name)};

\t@visibleAsString("设备编号")
\tpublic deviceId: string = ${tsString(model.name)};

\t@visibleAsString("MQTT Topic")
\tpublic mqttTopic: string = ${tsString(`dt/${model.name}/value`)};

\t@visibleAsString("主驱动节点")
\tpublic primaryNodeNames: string = ${tsString(params.primaryNodeNames)};

\t@visibleAsString("辅助驱动节点")
\tpublic secondaryNodeNames: string = ${tsString(params.secondaryNodeNames)};

\t@visibleAsString("状态节点")
\tpublic statusNodeNames: string = ${tsString(params.statusNodeNames)};

\t@visibleAsString("默认轴向")
\tpublic motionAxis: string = ${tsString(params.motionAxis)};

\t@visibleAsString("数值单位")
\tpublic valueUnit: string = "";

\t@visibleAsNumber("最小值", { step: 0.01 })
\tpublic minValue: number = 0;

\t@visibleAsNumber("最大值", { step: 0.01 })
\tpublic maxValue: number = 1;

\t@visibleAsNumber("默认速度", { step: 0.01 })
\tpublic defaultSpeed: number = ${params.defaultSpeed};

\t@visibleAsNumber("默认位移距离", { step: 0.01 })
\tpublic travelDistance: number = ${params.travelDistance};

\t@visibleAsNumber("默认旋转速度", { step: 0.01 })
\tpublic rotationSpeed: number = ${params.rotationSpeed};

\t@visibleAsString("运行颜色")
\tpublic runningColor: string = "#2ecc71";

\t@visibleAsString("停止颜色")
\tpublic stoppedColor: string = "#95a5a6";

\t@visibleAsString("故障颜色")
\tpublic faultColor: string = "#e74c3c";

\t@visibleAsString("选中颜色")
\tpublic selectedColor: string = "#f1c40f";

\t@visibleAsBoolean("启用状态高亮")
\tpublic enableStatusHighlight: boolean = true;

\t/**
\t * 创建 ${model.name} 参数脚本实例。
\t * @param node 定义当前脚本绑定的模型根节点。
\t */
\tpublic constructor(public node: TransformNode) {}

\t/**
\t * 参数脚本只负责暴露可配置字段，不在启动时修改模型状态。
\t */
\tpublic onStart(): void {
\t\t// 参数配置由 Inspector 保存到脚本 metadata，动画驱动脚本负责实际运行逻辑。
\t}
}
`;
}

/** 生成模型动画驱动外挂脚本。 */
function createAnimationScript(model, animation) {
	return `${fileHeader(model.name, `${animation.label}动画驱动脚本`)}import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { IMqttDriverContext, visibleAsBoolean, visibleAsNumber, visibleAsString } from "babylonjs-editor-tools";

type AxisName = "x" | "y" | "z";

/**
 * 接收 MQTT 值并驱动 ${model.name} 的${animation.label}。
 */
export default class ModelAnimationDriverComponent {
\t@visibleAsString("驱动名称")
\tpublic driverName: string = ${tsString(animation.label)};

\t@visibleAsString("驱动节点名称")
\tpublic targetNodeNames: string = ${tsString(animation.targetNodeNames)};

\t@visibleAsString("驱动轴向")
\tpublic axis: string = ${tsString(animation.axis)};

\t@visibleAsNumber("输入最小值", { step: 0.01 })
\tpublic minValue: number = 0;

\t@visibleAsNumber("输入最大值", { step: 0.01 })
\tpublic maxValue: number = 1;

\t@visibleAsNumber("位移距离", { step: 0.01 })
\tpublic distance: number = ${animation.distance};

\t@visibleAsNumber("速度倍率", { step: 0.01 })
\tpublic speed: number = ${animation.speed};

\t@visibleAsNumber("方向", { step: 1 })
\tpublic direction: number = 1;

\t@visibleAsString("运行颜色")
\tpublic runningColor: string = "#2ecc71";

\t@visibleAsString("停止颜色")
\tpublic stoppedColor: string = "#95a5a6";

\t@visibleAsString("故障颜色")
\tpublic faultColor: string = "#e74c3c";

\t@visibleAsString("选中颜色")
\tpublic selectedColor: string = "#f1c40f";

\t@visibleAsBoolean("启用状态高亮")
\tpublic enableStatusHighlight: boolean = true;

\tprivate readonly driverKind = ${tsString(animation.kind)};
\tprivate currentSpeed = 0;
\tprivate blinkElapsed = 0;
\tprivate blinkEnabled = false;
\tprivate readonly initialVectors = new Map<any, { x: number; y: number; z: number }>();
\tprivate readonly originalMaterials = new Map<any, any>();
\tprivate readonly generatedMaterials = new Map<any, any>();

\t/**
\t * 创建 ${model.name} 的${animation.label}动画驱动脚本实例。
\t * @param node 定义当前脚本绑定的模型根节点。
\t */
\tpublic constructor(public node: TransformNode) {}

\t/**
\t * 初始化动画脚本，记录默认节点变换并应用停止状态。
\t */
\tpublic onStart(): void {
\t\tthis.getTargetNodes().forEach((target) => this.rememberInitialVector(target));
\t\tthis.applyStateColor("stopped");
\t}

\t/**
\t * 每帧推进持续类动画，例如辊筒旋转、链条循环和 LED 闪烁。
\t */
\tpublic onUpdate(): void {
\t\tconst deltaSeconds = this.getDeltaSeconds();

\t\tif (this.driverKind === "rotation" || this.driverKind === "motor") {
\t\t\tthis.rotateTargets(deltaSeconds);
\t\t\treturn;
\t\t}

\t\tif (this.driverKind === "loopTranslation") {
\t\t\tthis.translateTargetsLoop(deltaSeconds);
\t\t\treturn;
\t\t}

\t\tif (this.driverKind === "blink") {
\t\t\tthis.updateBlink(deltaSeconds);
\t\t}
\t}

\t/**
\t * 接收 MQTT 或外部实时值，并转换为当前模型动画状态。
\t * @param value 定义外部传入的驱动值，支持数字、布尔、字符串和包含 value/state/status 的对象。
\t * @param context 定义当前驱动调用的上下文信息。
\t */
\tpublic onMqttValue(value: unknown, context: IMqttDriverContext): void {
\t\tvoid context;

\t\tif (this.driverKind === "state") {
\t\t\tthis.applyStateColor(this.resolveState(value));
\t\t\treturn;
\t\t}

\t\tif (this.driverKind === "visibility") {
\t\t\tthis.applyVisibility(this.normalizeNumber(value));
\t\t\treturn;
\t\t}

\t\tif (this.driverKind === "translation") {
\t\t\tthis.translateTargetsByRatio(this.normalizeNumber(value));
\t\t\treturn;
\t\t}

\t\tif (this.driverKind === "blink") {
\t\t\tconst ratio = this.normalizeNumber(value);
\t\t\tthis.blinkEnabled = ratio > 0;
\t\t\tthis.applyStateColor(this.blinkEnabled ? "running" : "stopped");
\t\t\treturn;
\t\t}

\t\tconst ratio = this.normalizeNumber(value);
\t\tthis.currentSpeed = ratio * this.speed * this.direction;
\t\tthis.applyStateColor(Math.abs(this.currentSpeed) > 0 ? "running" : "stopped");
\t}

\t/**
\t * 停止脚本时恢复脚本接管前的材质引用。
\t */
\tpublic onStop(): void {
\t\tthis.originalMaterials.forEach((material, mesh) => {
\t\t\tmesh.material = material;
\t\t});
\t}

\t/**
\t * 将目标节点按当前速度连续旋转。
\t */
\tprivate rotateTargets(deltaSeconds: number): void {
\t\tif (!Number.isFinite(this.currentSpeed) || this.currentSpeed === 0) {
\t\t\treturn;
\t\t}

\t\tconst axis = this.getAxisName();
\t\tthis.getTargetNodes().forEach((target) => {
\t\t\tif (!target.rotation) {
\t\t\t\treturn;
\t\t\t}

\t\t\tif (target.rotationQuaternion) {
\t\t\t\ttarget.rotationQuaternion = null;
\t\t\t}

\t\t\ttarget.rotation[axis] += this.currentSpeed * deltaSeconds;
\t\t});
\t}

\t/**
\t * 根据归一化比例把目标节点移动到指定位置。
\t */
\tprivate translateTargetsByRatio(ratio: number): void {
\t\tconst axis = this.getAxisName();
\t\tthis.getTargetNodes().forEach((target) => {
\t\t\tif (!target.position) {
\t\t\t\treturn;
\t\t\t}

\t\t\tconst initial = this.rememberInitialVector(target);
\t\t\ttarget.position[axis] = initial[axis] + ratio * this.distance * this.direction;
\t\t});
\t\tthis.applyStateColor(ratio > 0 ? "running" : "stopped");
\t}

\t/**
\t * 将目标节点按当前速度做循环位移，适合链条或输送带类效果。
\t */
\tprivate translateTargetsLoop(deltaSeconds: number): void {
\t\tif (!Number.isFinite(this.currentSpeed) || this.currentSpeed === 0) {
\t\t\treturn;
\t\t}

\t\tconst axis = this.getAxisName();
\t\tconst loopDistance = Math.max(Math.abs(this.distance), 0.01);
\t\tthis.getTargetNodes().forEach((target) => {
\t\t\tif (!target.position) {
\t\t\t\treturn;
\t\t\t}

\t\t\tconst initial = this.rememberInitialVector(target);
\t\t\tconst nextOffset = target.position[axis] - initial[axis] + this.currentSpeed * deltaSeconds;
\t\t\ttarget.position[axis] = initial[axis] + (((nextOffset % loopDistance) + loopDistance) % loopDistance);
\t\t});
\t\tthis.applyStateColor("running");
\t}

\t/**
\t * 按输入比例控制目标节点显隐，并同步状态高亮。
\t */
\tprivate applyVisibility(ratio: number): void {
\t\tconst visible = ratio > 0;
\t\tthis.getTargetNodes().forEach((target) => {
\t\t\tif (typeof target.setEnabled === "function") {
\t\t\t\ttarget.setEnabled(visible);
\t\t\t}

\t\t\tif ("visibility" in target) {
\t\t\t\ttarget.visibility = visible ? 1 : 0;
\t\t\t}
\t\t});
\t\tthis.applyStateColor(visible ? "running" : "stopped");
\t}

\t/**
\t * 根据闪烁状态切换 LED 高亮颜色。
\t */
\tprivate updateBlink(deltaSeconds: number): void {
\t\tif (!this.blinkEnabled) {
\t\t\treturn;
\t\t}

\t\tthis.blinkElapsed += deltaSeconds * Math.max(Math.abs(this.speed), 0.1);
\t\tconst enabled = Math.sin(this.blinkElapsed * Math.PI * 2) >= 0;
\t\tthis.applyStateColor(enabled ? "running" : "stopped");
\t}

\t/**
\t * 根据状态字符串给目标网格应用颜色。
\t */
\tprivate applyStateColor(state: string): void {
\t\tif (!this.enableStatusHighlight) {
\t\t\treturn;
\t\t}

\t\tconst color = this.getStateColor(state);
\t\tthis.collectMeshes(this.getTargetNodes()).forEach((mesh) => this.applyColor(mesh, color));
\t}

\t/**
\t * 解析外部传入值对应的状态名称。
\t */
\tprivate resolveState(value: unknown): string {
\t\tconst rawValue = this.readPayloadValue(value);
\t\tif (typeof rawValue === "string") {
\t\t\tconst normalized = rawValue.trim().toLowerCase();
\t\t\tif (["fault", "error", "alarm", "2", "故障", "报警"].includes(normalized)) {
\t\t\t\treturn "fault";
\t\t\t}
\t\t\tif (["selected", "select", "3", "选中"].includes(normalized)) {
\t\t\t\treturn "selected";
\t\t\t}
\t\t\tif (["running", "run", "on", "true", "1", "运行", "启动"].includes(normalized)) {
\t\t\t\treturn "running";
\t\t\t}
\t\t\treturn "stopped";
\t\t}

\t\tconst numericValue = this.toFiniteNumber(rawValue);
\t\tif (numericValue >= 2) {
\t\t\treturn "fault";
\t\t}
\t\tif (numericValue > 0) {
\t\t\treturn "running";
\t\t}
\t\treturn "stopped";
\t}

\t/**
\t * 将输入值归一化到 0 到 1 区间。
\t */
\tprivate normalizeNumber(value: unknown): number {
\t\tconst numericValue = this.toFiniteNumber(this.readPayloadValue(value));
\t\tconst minValue = Number.isFinite(this.minValue) ? this.minValue : 0;
\t\tconst maxValue = Number.isFinite(this.maxValue) && this.maxValue !== minValue ? this.maxValue : minValue + 1;
\t\tconst ratio = (numericValue - minValue) / (maxValue - minValue);
\t\treturn Math.min(1, Math.max(0, ratio));
\t}

\t/**
\t * 从 MQTT payload 或普通对象中读取实际业务值。
\t */
\tprivate readPayloadValue(value: unknown): unknown {
\t\tif (!value || typeof value !== "object") {
\t\t\treturn value;
\t\t}

\t\tconst record = value as Record<string, unknown>;
\t\treturn record.value ?? record.position ?? record.speed ?? record.ratio ?? record.state ?? record.status ?? value;
\t}

\t/**
\t * 将任意值转换为有限数字，无法转换时返回 0。
\t */
\tprivate toFiniteNumber(value: unknown): number {
\t\tif (typeof value === "boolean") {
\t\t\treturn value ? 1 : 0;
\t\t}

\t\tconst numericValue = Number(value);
\t\treturn Number.isFinite(numericValue) ? numericValue : 0;
\t}

\t/**
\t * 获取当前动画使用的合法轴向。
\t */
\tprivate getAxisName(): AxisName {
\t\tconst axis = this.axis.trim().toLowerCase();
\t\treturn axis === "y" || axis === "z" ? axis : "x";
\t}

\t/**
\t * 按节点名称查找当前模型范围内的驱动目标。
\t */
\tprivate getTargetNodes(): any[] {
\t\tconst names = this.splitNames(this.targetNodeNames);
\t\tif (names.length === 0) {
\t\t\treturn [this.node];
\t\t}

\t\tconst scene = this.node.getScene?.();
\t\tconst sceneNodes = [...(scene?.transformNodes ?? []), ...(scene?.meshes ?? [])];
\t\tconst targets = sceneNodes.filter((candidate) => {
\t\t\treturn names.includes(candidate.name) && (candidate === this.node || candidate.isDescendantOf?.(this.node));
\t\t});

\t\treturn targets.length > 0 ? targets : [this.node];
\t}

\t/**
\t * 将逗号分隔的节点名称拆分为可匹配数组。
\t */
\tprivate splitNames(value: string): string[] {
\t\treturn value
\t\t\t.split(",")
\t\t\t.map((item) => item.trim())
\t\t\t.filter(Boolean);
\t}

\t/**
\t * 记录并返回目标节点的初始位置。
\t */
\tprivate rememberInitialVector(target: any): { x: number; y: number; z: number } {
\t\tconst current = target.position ?? { x: 0, y: 0, z: 0 };
\t\tif (!this.initialVectors.has(target)) {
\t\t\tthis.initialVectors.set(target, { x: current.x ?? 0, y: current.y ?? 0, z: current.z ?? 0 });
\t\t}

\t\treturn this.initialVectors.get(target) ?? { x: 0, y: 0, z: 0 };
\t}

\t/**
\t * 收集目标节点自身及其子级网格。
\t */
\tprivate collectMeshes(targets: any[]): any[] {
\t\tconst meshes: any[] = [];
\t\ttargets.forEach((target) => {
\t\t\tif (target.material) {
\t\t\t\tmeshes.push(target);
\t\t\t}

\t\t\tif (typeof target.getChildMeshes === "function") {
\t\t\t\tmeshes.push(...target.getChildMeshes(false));
\t\t\t}
\t\t});
\t\treturn [...new Set(meshes)];
\t}

\t/**
\t * 将颜色应用到网格材质，并避免修改共享原始材质。
\t */
\tprivate applyColor(mesh: any, color: Color3): void {
\t\tif (!mesh.material) {
\t\t\treturn;
\t\t}

\t\tif (!this.originalMaterials.has(mesh)) {
\t\t\tthis.originalMaterials.set(mesh, mesh.material);
\t\t}

\t\tlet material = this.generatedMaterials.get(mesh);
\t\tif (!material) {
\t\t\tmaterial = typeof mesh.material.clone === "function" ? mesh.material.clone(\`\${mesh.material.name || "material"}_sidecar\`) : mesh.material;
\t\t\tthis.generatedMaterials.set(mesh, material);
\t\t\tmesh.material = material;
\t\t}

\t\tif ("diffuseColor" in material) {
\t\t\tmaterial.diffuseColor = color;
\t\t}
\t\tif ("emissiveColor" in material) {
\t\t\tmaterial.emissiveColor = color.scale(0.35);
\t\t}
\t}

\t/**
\t * 根据状态名称返回对应颜色。
\t */
\tprivate getStateColor(state: string): Color3 {
\t\tif (state === "fault") {
\t\t\treturn this.parseColor(this.faultColor, Color3.Red());
\t\t}
\t\tif (state === "selected") {
\t\t\treturn this.parseColor(this.selectedColor, Color3.Yellow());
\t\t}
\t\tif (state === "running") {
\t\t\treturn this.parseColor(this.runningColor, Color3.Green());
\t\t}
\t\treturn this.parseColor(this.stoppedColor, Color3.Gray());
\t}

\t/**
\t * 将十六进制颜色字符串转换为 Babylon Color3。
\t */
\tprivate parseColor(value: string, fallback: Color3): Color3 {
\t\ttry {
\t\t\treturn Color3.FromHexString(value);
\t\t} catch {
\t\t\treturn fallback;
\t\t}
\t}

\t/**
\t * 获取当前帧间隔秒数，异常时使用 60 FPS 的默认值。
\t */
\tprivate getDeltaSeconds(): number {
\t\tconst deltaTime = this.node.getScene?.()?.getEngine?.()?.getDeltaTime?.();
\t\tconst seconds = Number(deltaTime) / 1000;
\t\treturn Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 0.1) : 1 / 60;
\t}
}
`;
}

/** 确保源 GLB 存在，并返回文件路径。 */
function resolveSourceGlb(modelName) {
	const sourceGlb = path.join(ROOT_DIR, `${modelName}.glb`);
	if (!fs.existsSync(sourceGlb)) {
		throw new Error(`未找到模型文件：${sourceGlb}`);
	}

	return sourceGlb;
}

/** 写入文件，并统一使用 UTF-8 编码。 */
function writeTextFile(filePath, content) {
	fs.writeFileSync(filePath, content, "utf8");
}

/** 为单个模型创建目录、复制 GLB 并生成外挂脚本。 */
function generateModelPackage(model) {
	const sourceGlb = resolveSourceGlb(model.name);
	const targetDir = path.join(ROOT_DIR, model.name);
	const targetGlb = path.join(targetDir, `${model.name}.glb`);

	fs.mkdirSync(targetDir, { recursive: true });
	fs.copyFileSync(sourceGlb, targetGlb);
	writeTextFile(path.join(targetDir, `${model.name}.params.ts`), createParamsScript(model));

	model.animations.forEach((animation) => {
		writeTextFile(path.join(targetDir, `${model.name}.anim.${animation.name}.ts`), createAnimationScript(model, animation));
	});

	return {
		model: model.name,
		directory: targetDir,
		scriptCount: model.animations.length + 1,
	};
}

/** 生成所有 GLB 模型的同名目录和 sidecar 脚本。 */
function main() {
	if (!fs.existsSync(ROOT_DIR)) {
		throw new Error(`目标目录不存在：${ROOT_DIR}`);
	}

	const results = MODELS.map(generateModelPackage);
	const lines = results.map((result) => `${result.model}: ${result.scriptCount} scripts -> ${result.directory}`);
	process.stdout.write(`${lines.join("\n")}\n`);
}

main();
