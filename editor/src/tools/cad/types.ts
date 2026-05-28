import type { Mesh, TransformNode, Vector3 } from "babylonjs";

export type CadImportUnit = "auto" | "mm" | "cm" | "m";
export type CadResolvedUnit = "mm" | "cm" | "m" | "inch" | "foot";

export interface ICadPoint3 {
	x: number;
	y: number;
	z: number;
}

export interface ICadBounds {
	min: ICadPoint3;
	max: ICadPoint3;
	size: ICadPoint3;
	center: ICadPoint3;
}

export interface ICadPolyline {
	id: string;
	entityType: string;
	layer: string;
	points: ICadPoint3[];
	closed: boolean;
	color?: string;
}

export interface ICadInsert {
	name: string;
	layer: string;
	position: ICadPoint3;
	rotation: number;
	xScale: number;
	yScale: number;
	zScale: number;
}

export interface ICadLayerSummary {
	name: string;
	visible: boolean;
	color?: string;
	polylineCount: number;
	segmentCount: number;
}

export interface ICadExtractResult {
	header: {
		insunits?: number;
	};
	polylines: ICadPolyline[];
	inserts: ICadInsert[];
	layers: ICadLayerSummary[];
	skippedEntityCount: number;
}

export interface ICadResolvedUnitInfo {
	selectedUnit: CadImportUnit;
	unit: CadResolvedUnit;
	unitScaleToMeter: number;
	insunits?: number;
}

export interface ICadCoordinateConverter {
	bounds: ICadBounds;
	origin: ICadPoint3;
	unitScaleToMeter: number;
	cadToWorld(point: ICadPoint3): Vector3;
	worldToCad(point: Vector3): ICadPoint3;
}

export interface ICadGroundImportOptions {
	cadId: string;
	sourceFileName: string;
	sourcePath?: string;
	projectSourcePath?: string;
	projectRelativeSourcePath?: string;
	importablePath?: string;
	projectRelativeImportablePath?: string;
	unit: CadImportUnit;
	textureLongSide: number;
	alpha: number;
	drawVectorLines: boolean;
	yOffset?: number;
}

export interface ICadGroundMetadata {
	version: 1;
	cadId: string;
	sourceFileName: string;
	sourcePath?: string;
	projectSourcePath?: string;
	projectRelativeSourcePath?: string;
	importablePath?: string;
	projectRelativeImportablePath?: string;
	unit: CadResolvedUnit;
	selectedUnit: CadImportUnit;
	unitScaleToMeter: number;
	bbox: ICadBounds;
	origin: ICadPoint3;
	ground: {
		width: number;
		height: number;
		textureWidth: number;
		textureHeight: number;
		alpha: number;
		yOffset: number;
		vectorLines: boolean;
		lineSegmentCount: number;
	};
	axis: {
		x: "CAD X -> Babylon X";
		y: "CAD Y -> Babylon -Z";
		z: "CAD Z -> Babylon Y";
	};
	layers: ICadLayerSummary[];
	inserts: ICadInsert[];
}

export interface ICadGroundImportResult {
	root: TransformNode;
	ground: Mesh;
	layerRoots: TransformNode[];
	metadata: ICadGroundMetadata;
}

export interface ICadDwgConversionRequest {
	inputPath: string;
	outputPath: string;
	/**
	 * 定义用户手动指定的 DWG 转换器路径；可以是 ODAFileConverter.exe、dwg2dxf.exe 或包含转换器的目录。
	 */
	converterPath?: string;
}

export interface ICadDwgConversionResponse {
	ok: boolean;
	outputPath?: string;
	message?: string;
	code?: string;
	log?: string;
}
