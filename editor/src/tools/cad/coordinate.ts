import { Vector3 } from "babylonjs";

import { CadImportUnit, CadResolvedUnit, ICadBounds, ICadCoordinateConverter, ICadPoint3, ICadPolyline, ICadResolvedUnitInfo } from "./types";

const CAD_INSUNITS_TO_UNIT: Partial<Record<number, { unit: CadResolvedUnit; scale: number }>> = {
	1: { unit: "inch", scale: 0.0254 },
	2: { unit: "foot", scale: 0.3048 },
	4: { unit: "mm", scale: 0.001 },
	5: { unit: "cm", scale: 0.01 },
	6: { unit: "m", scale: 1 },
};

const MANUAL_UNIT_TO_METER: Record<Exclude<CadImportUnit, "auto">, number> = {
	mm: 0.001,
	cm: 0.01,
	m: 1,
};

/**
 * 根据用户选择和 DXF $INSUNITS 解析 CAD 图纸单位，返回换算到米的比例。
 * @param selectedUnit 定义用户在导入弹窗中选择的单位。
 * @param insunits 定义 DXF 头部的 $INSUNITS 数值。
 */
export function resolveCadUnit(selectedUnit: CadImportUnit, insunits?: number): ICadResolvedUnitInfo {
	if (selectedUnit !== "auto") {
		return {
			selectedUnit,
			unit: selectedUnit,
			unitScaleToMeter: MANUAL_UNIT_TO_METER[selectedUnit],
			insunits,
		};
	}

	const unitInfo = insunits === undefined ? undefined : CAD_INSUNITS_TO_UNIT[insunits];
	if (!unitInfo) {
		throw new Error("无法自动识别 CAD 单位，请手动选择 mm / cm / m。");
	}

	return {
		selectedUnit,
		unit: unitInfo.unit,
		unitScaleToMeter: unitInfo.scale,
		insunits,
	};
}

/**
 * 计算 CAD 折线集合的有效包围盒，空图纸或异常坐标会抛出中文错误。
 * @param polylines 定义从 DXF 实体中提取出的折线集合。
 */
export function calculateCadBounds(polylines: ICadPolyline[]): ICadBounds {
	const bounds = createEmptyBounds();

	for (const polyline of polylines) {
		for (const point of polyline.points) {
			expandBounds(bounds, point);
		}
	}

	if (!isCadBoundsValid(bounds)) {
		throw new Error("CAD 图纸没有可用的二维线框，无法计算有效包围盒。");
	}

	return finalizeBounds(bounds);
}

/**
 * 创建 CAD 到 Babylon 世界坐标的转换器；CAD 中心作为本次导入原点。
 * @param bounds 定义 CAD 原始坐标包围盒。
 * @param unitScaleToMeter 定义 CAD 图纸单位换算到米的比例。
 */
export function createCadCoordinateConverter(bounds: ICadBounds, unitScaleToMeter: number): ICadCoordinateConverter {
	if (!Number.isFinite(unitScaleToMeter) || unitScaleToMeter <= 0) {
		throw new Error("CAD 单位换算比例无效，无法贴地导入。");
	}

	const origin = { ...bounds.center };
	return {
		bounds,
		origin,
		unitScaleToMeter,
		cadToWorld: (point) => cadToWorld(point, origin, unitScaleToMeter),
		worldToCad: (point) => worldToCad(point, origin, unitScaleToMeter),
	};
}

/**
 * 判断 CAD 原始点是否适合参与计算，过滤转换器输出的极端异常坐标。
 * @param point 定义待检查的 CAD 点。
 */
export function isRenderableCadPoint(point: ICadPoint3): boolean {
	const maxCoordinate = 1e12;
	return (
		Number.isFinite(point.x) &&
		Number.isFinite(point.y) &&
		Number.isFinite(point.z) &&
		Math.abs(point.x) <= maxCoordinate &&
		Math.abs(point.y) <= maxCoordinate &&
		Math.abs(point.z) <= maxCoordinate
	);
}

/**
 * 将任意字符串裁剪为可用于 Babylon 节点名的稳定片段。
 * @param value 定义原始 id 或图层名称。
 */
export function sanitizeCadNodeName(value: string): string {
	const safe = value.trim().replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").replace(/^_+|_+$/g, "");
	return safe || "default";
}

/**
 * 将 CAD 点映射为 Babylon 世界点：X -> X、Y -> -Z、Z -> Y。
 */
function cadToWorld(point: ICadPoint3, origin: ICadPoint3, unitScaleToMeter: number): Vector3 {
	return new Vector3((point.x - origin.x) * unitScaleToMeter, (point.z - origin.z) * unitScaleToMeter, -(point.y - origin.y) * unitScaleToMeter);
}

/**
 * 将 Babylon 世界点反向映射回 CAD 坐标。
 */
function worldToCad(point: Vector3, origin: ICadPoint3, unitScaleToMeter: number): ICadPoint3 {
	return {
		x: point.x / unitScaleToMeter + origin.x,
		y: -point.z / unitScaleToMeter + origin.y,
		z: point.y / unitScaleToMeter + origin.z,
	};
}

/**
 * 创建尚未填充的包围盒。
 */
function createEmptyBounds(): ICadBounds {
	return {
		min: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY },
		max: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
		size: { x: 0, y: 0, z: 0 },
		center: { x: 0, y: 0, z: 0 },
	};
}

/**
 * 使用单个有效点扩展包围盒。
 * @param bounds 定义正在累计的包围盒。
 * @param point 定义 CAD 原始点。
 */
function expandBounds(bounds: ICadBounds, point: ICadPoint3): void {
	if (!isRenderableCadPoint(point)) {
		return;
	}

	bounds.min.x = Math.min(bounds.min.x, point.x);
	bounds.min.y = Math.min(bounds.min.y, point.y);
	bounds.min.z = Math.min(bounds.min.z, point.z);
	bounds.max.x = Math.max(bounds.max.x, point.x);
	bounds.max.y = Math.max(bounds.max.y, point.y);
	bounds.max.z = Math.max(bounds.max.z, point.z);
}

/**
 * 判断累计包围盒是否包含真实尺寸。
 * @param bounds 定义待检查的包围盒。
 */
function isCadBoundsValid(bounds: ICadBounds): boolean {
	return isRenderableCadPoint(bounds.min) && isRenderableCadPoint(bounds.max) && bounds.max.x >= bounds.min.x && bounds.max.y >= bounds.min.y;
}

/**
 * 补齐包围盒尺寸和中心点。
 * @param bounds 定义已经包含最小最大点的包围盒。
 */
function finalizeBounds(bounds: ICadBounds): ICadBounds {
	const size = {
		x: bounds.max.x - bounds.min.x,
		y: bounds.max.y - bounds.min.y,
		z: bounds.max.z - bounds.min.z,
	};
	const center = {
		x: (bounds.min.x + bounds.max.x) * 0.5,
		y: (bounds.min.y + bounds.max.y) * 0.5,
		z: (bounds.min.z + bounds.max.z) * 0.5,
	};

	if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) {
		throw new Error("CAD 图纸包围盒为空，无法生成 1:1 地面参照。");
	}

	return {
		min: { ...bounds.min },
		max: { ...bounds.max },
		size,
		center,
	};
}
