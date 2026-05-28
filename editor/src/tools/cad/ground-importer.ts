import { Color3, DynamicTexture, Material, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Node, type Scene } from "babylonjs";

import { calculateCadBounds, createCadCoordinateConverter, resolveCadUnit, sanitizeCadNodeName } from "./coordinate";
import { extractCadDxfEntities } from "./entity-extractor";
import { CadImportUnit, ICadCoordinateConverter, ICadExtractResult, ICadGroundImportOptions, ICadGroundImportResult, ICadGroundMetadata, ICadLayerSummary, ICadPolyline } from "./types";

const DEFAULT_TEXTURE_LONG_SIDE = 4096;
const MIN_TEXTURE_LONG_SIDE = 512;
const MAX_TEXTURE_LONG_SIDE = 8192;
const DEFAULT_GROUND_ALPHA = 0.85;
const CAD_GROUND_RENDERING_GROUP_ID = 1;
const DEFAULT_GROUND_Y_OFFSET = 0.005;
const CAD_VECTOR_LINE_Y_OFFSET = 0.007;
const VECTOR_LINE_CHUNK_SIZE = 1200;

interface ICadGroundMeshCreateOptions {
	scene: Scene;
	cadId: string;
	converter: ICadCoordinateConverter;
	textureSize: { width: number; height: number };
	polylines: ICadPolyline[];
	alpha: number;
	yOffset: number;
}

interface ICadPolylineDrawOptions {
	context: CanvasRenderingContext2D;
	converter: ICadCoordinateConverter;
	polyline: ICadPolyline;
	scale: number;
	offsetX: number;
	offsetY: number;
	textureHeight: number;
}

interface ICadGroundBuildArtifacts {
	extractResult: ICadExtractResult;
	converter: ICadCoordinateConverter;
	textureSize: { width: number; height: number };
	metadata: ICadGroundMetadata;
	safeCadId: string;
	alpha: number;
	yOffset: number;
}

/**
 * 将 DXF 文本导入为贴地 CAD 根节点、透明地面贴图和可选矢量图层。
 * @param scene 定义目标 Babylon 场景。
 * @param dxfText 定义已经准备好的 DXF 文本。
 * @param options 定义 CAD 导入配置弹窗收集到的选项。
 */
export function importCadGround(scene: Scene, dxfText: string, options: ICadGroundImportOptions): ICadGroundImportResult {
	return buildCadGroundReference(scene, dxfText, options);
}

/**
 * 根据已保存的 CAD 根节点 metadata 和 DXF 文本重建派生贴地内容。
 * @param scene 定义目标 Babylon 场景。
 * @param root 定义项目保存后重新加载出的 CAD 根节点。
 * @param dxfText 定义项目内可恢复的 DXF 文本。
 */
export function rebuildCadGroundFromMetadata(scene: Scene, root: TransformNode, dxfText: string): ICadGroundImportResult {
	const metadata = getCadGroundMetadata(root);
	if (!metadata) {
		throw new Error(`CAD 根节点缺少 metadata.cad，无法重建参考层：${root.name}`);
	}

	return buildCadGroundReference(scene, dxfText, {
		cadId: metadata.cadId,
		sourceFileName: metadata.sourceFileName,
		sourcePath: metadata.sourcePath,
		projectSourcePath: metadata.projectSourcePath,
		projectRelativeSourcePath: metadata.projectRelativeSourcePath,
		importablePath: metadata.importablePath,
		projectRelativeImportablePath: metadata.projectRelativeImportablePath,
		unit: getCadImportUnitFromMetadata(metadata),
		textureLongSide: Math.max(metadata.ground.textureWidth, metadata.ground.textureHeight),
		alpha: metadata.ground.alpha,
		drawVectorLines: metadata.ground.vectorLines,
		yOffset: metadata.ground.yOffset,
	}, root);
}

/**
 * 判断节点是否是需要保存 metadata 的 CAD 根节点。
 * @param node 定义待检查的 Babylon 节点。
 */
export function isCadGroundRootNode(node: Pick<Node, "name" | "metadata">): boolean {
	return Boolean(node.metadata?.cad?.cadId || (node.metadata?.cadDrawing?.placedOnGround && node.name?.startsWith("CAD_GROUND_ROOT_")));
}

/**
 * 判断节点是否是由 CAD 根 metadata 派生出来的可重建对象，保存项目时应跳过。
 * @param node 定义待检查的 Babylon 节点。
 */
export function isCadGeneratedNode(node: Pick<Node, "name" | "metadata">): boolean {
	if (isCadGroundRootNode(node)) {
		return false;
	}

	return Boolean(node.metadata?.cadGenerated || node.metadata?.cadGround || node.metadata?.cadLayer?.generated);
}

/**
 * 保存项目期间临时移除 CAD 派生 TransformNode，避免把可重建图层根节点写成项目文件。
 * @param scene 定义当前编辑器场景。
 * @param action 定义需要在移除期间执行的保存逻辑。
 */
export async function runWithoutCadGeneratedTransformNodes<T>(scene: Scene, action: () => Promise<T>): Promise<T> {
	const generatedTransformNodes = scene.transformNodes.filter((node) => isCadGeneratedNode(node));
	for (const node of generatedTransformNodes) {
		scene.removeTransformNode(node);
	}

	try {
		return await action();
	} finally {
		for (const node of generatedTransformNodes) {
			if (!node.isDisposed()) {
				scene.addTransformNode(node);
			}
		}
	}
}

/**
 * 执行首次导入或恢复导入的共同构建逻辑。
 * @param scene 定义目标 Babylon 场景。
 * @param dxfText 定义 DXF 文本。
 * @param options 定义 CAD 导入或恢复配置。
 * @param existingRoot 定义可选的已保存 CAD 根节点。
 */
function buildCadGroundReference(scene: Scene, dxfText: string, options: ICadGroundImportOptions, existingRoot?: TransformNode): ICadGroundImportResult {
	const artifacts = createCadGroundBuildArtifacts(dxfText, options);
	const root = existingRoot ?? new TransformNode(`CAD_GROUND_ROOT_${artifacts.safeCadId}`, scene);
	disposeCadGeneratedChildren(root);
	scene.setRenderingAutoClearDepthStencil(CAD_GROUND_RENDERING_GROUP_ID, false, false, false);

	const ground = createCadGroundMesh({
		scene,
		cadId: artifacts.safeCadId,
		converter: artifacts.converter,
		textureSize: artifacts.textureSize,
		polylines: artifacts.extractResult.polylines,
		alpha: artifacts.alpha,
		yOffset: artifacts.yOffset,
	});
	ground.parent = root;

	const layerRoots = options.drawVectorLines ? createVectorLayerRoots(scene, root, artifacts.safeCadId, artifacts.converter, artifacts.extractResult.polylines, artifacts.extractResult.layers) : [];
	configureCadGroundRootMetadata(root, artifacts.metadata);
	configureCadGeneratedMesh(ground, artifacts.safeCadId, {
		cadGround: {
			cadId: artifacts.safeCadId,
			generated: true,
		},
	});

	return {
		root,
		ground,
		layerRoots,
		metadata: artifacts.metadata,
	};
}

/**
 * 从 DXF 文本和导入选项生成可复用的构建上下文。
 * @param dxfText 定义 DXF 原始文本。
 * @param options 定义 CAD 导入配置。
 */
function createCadGroundBuildArtifacts(dxfText: string, options: ICadGroundImportOptions): ICadGroundBuildArtifacts {
	const extractResult = extractCadDxfEntities(dxfText);
	if (!extractResult.polylines.length) {
		throw new Error("DXF 中没有可导入的 LINE、POLYLINE、CIRCLE、ARC 或 SPLINE 线框实体。");
	}

	const unitInfo = resolveCadUnit(options.unit, extractResult.header.insunits);
	const bounds = calculateCadBounds(extractResult.polylines);
	const converter = createCadCoordinateConverter(bounds, unitInfo.unitScaleToMeter);
	const safeCadId = sanitizeCadNodeName(options.cadId);
	const yOffset = options.yOffset ?? DEFAULT_GROUND_Y_OFFSET;
	const alpha = clampNumber(options.alpha, 0.05, 1, DEFAULT_GROUND_ALPHA);
	const textureSize = calculateTextureSize(bounds.size.x * unitInfo.unitScaleToMeter, bounds.size.y * unitInfo.unitScaleToMeter, options.textureLongSide);
	const lineSegmentCount = countLineSegments(extractResult.polylines);

	const metadata: ICadGroundMetadata = {
		version: 1,
		cadId: safeCadId,
		sourceFileName: options.sourceFileName,
		sourcePath: options.sourcePath,
		projectSourcePath: options.projectSourcePath,
		projectRelativeSourcePath: options.projectRelativeSourcePath,
		importablePath: options.importablePath,
		projectRelativeImportablePath: options.projectRelativeImportablePath,
		unit: unitInfo.unit,
		selectedUnit: unitInfo.selectedUnit,
		unitScaleToMeter: unitInfo.unitScaleToMeter,
		bbox: bounds,
		origin: converter.origin,
		ground: {
			width: bounds.size.x * unitInfo.unitScaleToMeter,
			height: bounds.size.y * unitInfo.unitScaleToMeter,
			textureWidth: textureSize.width,
			textureHeight: textureSize.height,
			alpha,
			yOffset,
			vectorLines: options.drawVectorLines,
			lineSegmentCount,
		},
		axis: {
			x: "CAD X -> Babylon X",
			y: "CAD Y -> Babylon -Z",
			z: "CAD Z -> Babylon Y",
		},
		layers: extractResult.layers,
		inserts: extractResult.inserts,
	};

	return {
		extractResult,
		converter,
		textureSize,
		metadata,
		safeCadId,
		alpha,
		yOffset,
	};
}

/**
 * 把 CAD 根节点标记为编辑器辅助参考层，同时保留保存项目所需的 metadata。
 * @param root 定义 CAD 根节点。
 * @param metadata 定义最新 CAD 贴地元数据。
 */
function configureCadGroundRootMetadata(root: TransformNode, metadata: ICadGroundMetadata): void {
	root.doNotSerialize = true;
	root.metadata = {
		...(root.metadata ?? {}),
		doNotSerialize: true,
		cad: metadata,
		cadDrawing: {
			...(root.metadata?.cadDrawing ?? {}),
			displayMode: "ground-dynamic-texture",
			unit: metadata.unit,
			scale: metadata.unitScaleToMeter,
			placedOnGround: true,
			projectRelativeSourcePath: metadata.projectRelativeSourcePath,
			projectRelativeImportablePath: metadata.projectRelativeImportablePath,
		},
	};
}

/**
 * 读取 CAD 根节点上的新版 metadata。
 * @param root 定义 CAD 根节点。
 */
function getCadGroundMetadata(root: TransformNode): ICadGroundMetadata | null {
	return root.metadata?.cad ?? null;
}

/**
 * 从历史 metadata 中恢复导入单位选择。
 * @param metadata 定义 CAD 根节点保存的 metadata。
 */
function getCadImportUnitFromMetadata(metadata: ICadGroundMetadata): CadImportUnit {
	if (metadata.selectedUnit) {
		return metadata.selectedUnit;
	}

	if (metadata.unit === "mm" || metadata.unit === "cm" || metadata.unit === "m") {
		return metadata.unit;
	}

	return "auto";
}

/**
 * 删除 CAD 根节点下所有可重建派生对象，避免恢复时重复生成。
 * @param root 定义 CAD 根节点。
 */
function disposeCadGeneratedChildren(root: TransformNode): void {
	for (const child of root.getChildren().slice()) {
		if (isCadGeneratedNode(child)) {
			child.dispose(false, true);
		}
	}
}

/**
 * 标记 CAD 派生节点，使其不进入 Graph、保存和运行时导出。
 * @param node 定义待标记的派生节点。
 * @param cadId 定义所属 CAD 根节点 id。
 * @param metadata 定义额外 CAD metadata。
 */
function configureCadGeneratedNode(node: Node, cadId: string, metadata: Record<string, unknown>): void {
	node.doNotSerialize = true;
	node.metadata = {
		...(node.metadata ?? {}),
		doNotSerialize: true,
		notVisibleInGraph: true,
		cadGenerated: true,
		cadId,
		renderLayer: "cad-ground-reference",
		...metadata,
	};
}

/**
 * 标记 CAD 派生网格，同时确保网格不可拾取。
 * @param mesh 定义待标记的网格。
 * @param cadId 定义所属 CAD 根节点 id。
 * @param metadata 定义额外 CAD metadata。
 */
function configureCadGeneratedMesh(mesh: Mesh, cadId: string, metadata: Record<string, unknown>): void {
	configureCadGeneratedNode(mesh, cadId, metadata);
	mesh.isPickable = false;
}

/**
 * 创建承载 CAD 栅格线图的地面网格。
 * @param options 定义地面网格创建参数。
 */
function createCadGroundMesh(options: ICadGroundMeshCreateOptions): Mesh {
	const { scene, cadId, converter, textureSize, polylines, alpha, yOffset } = options;
	const width = converter.bounds.size.x * converter.unitScaleToMeter;
	const height = converter.bounds.size.y * converter.unitScaleToMeter;
	const ground = MeshBuilder.CreateGround(`CAD_GROUND_MESH_${cadId}`, { width, height, subdivisions: 1 }, scene);
	ground.position.y = yOffset;
	ground.isPickable = false;
	ground.renderingGroupId = CAD_GROUND_RENDERING_GROUP_ID;

	const texture = createCadDynamicTexture(scene, `CAD_GROUND_TEXTURE_${cadId}`, converter, textureSize, polylines);
	const material = new StandardMaterial(`CAD_GROUND_MATERIAL_${cadId}`, scene);
	material.diffuseTexture = texture;
	material.emissiveTexture = texture;
	material.diffuseColor = Color3.White();
	material.emissiveColor = Color3.White();
	material.specularColor = Color3.Black();
	material.alpha = alpha;
	material.useAlphaFromDiffuseTexture = true;
	material.transparencyMode = Material.MATERIAL_ALPHABLEND;
	material.backFaceCulling = false;
	material.disableLighting = true;
	material.disableDepthWrite = true;
	material.doNotSerialize = true;
	material.metadata = {
		doNotSerialize: true,
		cadGenerated: true,
		cadId,
		renderLayer: "cad-ground-reference",
	};
	ground.material = material;

	return ground;
}

/**
 * 创建透明背景的动态 CAD 贴图。
 * @param scene 定义目标 Babylon 场景。
 * @param name 定义贴图名称。
 * @param converter 定义 CAD 到世界坐标转换器。
 * @param textureSize 定义贴图像素尺寸。
 * @param polylines 定义 CAD 折线集合。
 */
function createCadDynamicTexture(scene: Scene, name: string, converter: ICadCoordinateConverter, textureSize: { width: number; height: number }, polylines: ICadPolyline[]): DynamicTexture {
	const texture = new DynamicTexture(name, textureSize, scene, false);
	const context = texture.getContext() as unknown as CanvasRenderingContext2D;
	const scale = Math.min(textureSize.width / converter.bounds.size.x, textureSize.height / converter.bounds.size.y);
	const offsetX = (textureSize.width - converter.bounds.size.x * scale) * 0.5;
	const offsetY = (textureSize.height - converter.bounds.size.y * scale) * 0.5;

	context.clearRect(0, 0, textureSize.width, textureSize.height);
	context.lineCap = "round";
	context.lineJoin = "round";
	context.strokeStyle = "#111111";
	context.lineWidth = Math.max(1, Math.round(Math.min(textureSize.width, textureSize.height) / 2048));

	for (const polyline of polylines) {
		drawPolyline({
			context,
			converter,
			polyline,
			scale,
			offsetX,
			offsetY,
			textureHeight: textureSize.height,
		});
	}

	texture.hasAlpha = true;
	(texture as DynamicTexture & { doNotSerialize: boolean }).doNotSerialize = true;
	texture.metadata = {
		doNotSerialize: true,
		cadGenerated: true,
		renderLayer: "cad-ground-reference",
	};
	texture.update(false);
	return texture;
}

/**
 * 将单条 CAD 折线绘制到 Canvas 上。
 * @param options 定义绘制单条折线所需的上下文和转换参数。
 */
function drawPolyline(options: ICadPolylineDrawOptions): void {
	const { context, converter, polyline, scale, offsetX, offsetY, textureHeight } = options;
	const [firstPoint, ...restPoints] = polyline.points;
	if (!firstPoint) {
		return;
	}

	context.beginPath();
	context.moveTo((firstPoint.x - converter.bounds.min.x) * scale + offsetX, textureHeight - ((firstPoint.y - converter.bounds.min.y) * scale + offsetY));
	for (const point of restPoints) {
		context.lineTo((point.x - converter.bounds.min.x) * scale + offsetX, textureHeight - ((point.y - converter.bounds.min.y) * scale + offsetY));
	}

	if (polyline.closed) {
		context.closePath();
	}

	context.stroke();
}

/**
 * 按 CAD 图层分组创建 chunked LineSystem，避免一张大图纸生成过多 mesh。
 * @param scene 定义目标 Babylon 场景。
 * @param root 定义 CAD 根节点。
 * @param cadId 定义安全 CAD id。
 * @param converter 定义 CAD 到世界坐标转换器。
 * @param polylines 定义 CAD 折线集合。
 * @param layerSummaries 定义图层摘要。
 */
function createVectorLayerRoots(
	scene: Scene,
	root: TransformNode,
	cadId: string,
	converter: ICadCoordinateConverter,
	polylines: ICadPolyline[],
	layerSummaries: ICadLayerSummary[]
): TransformNode[] {
	const byLayer = new Map<string, ICadPolyline[]>();
	for (const polyline of polylines) {
		const group = byLayer.get(polyline.layer) ?? [];
		group.push(polyline);
		byLayer.set(polyline.layer, group);
	}

	const layerRoots: TransformNode[] = [];
	for (const [layerName, layerPolylines] of byLayer) {
		const layerRoot = new TransformNode(`CAD_LAYER_${sanitizeCadNodeName(layerName)}`, scene);
		layerRoot.parent = root;
		layerRoot.position.y = CAD_VECTOR_LINE_Y_OFFSET;
		configureCadGeneratedNode(layerRoot, cadId, {
			cadLayer: {
				cadId,
				name: layerName,
				generated: true,
				...(layerSummaries.find((layer) => layer.name === layerName) ?? {}),
			},
		});

		const chunks = chunkPolylines(layerPolylines, VECTOR_LINE_CHUNK_SIZE);
		for (let index = 0; index < chunks.length; index++) {
			const lines = chunks[index].map((polyline) => toWorldPolyline(converter, polyline)).filter((line) => line.length >= 2);
			const lineMesh = MeshBuilder.CreateLineSystem(`CAD_LAYER_${sanitizeCadNodeName(layerName)}_${index + 1}`, { lines, updatable: false }, scene);
			lineMesh.parent = layerRoot;
			lineMesh.renderingGroupId = CAD_GROUND_RENDERING_GROUP_ID;
			lineMesh.color = Color3.FromHexString(layerPolylines[0]?.color ?? "#00ff66");
			configureCadGeneratedMesh(lineMesh, cadId, {
				cadLayer: {
					cadId,
					name: layerName,
					chunkIndex: index,
					generated: true,
				},
			});
		}

		layerRoots.push(layerRoot);
	}

	return layerRoots;
}

/**
 * 将 CAD 折线转换成 Babylon 世界坐标线。
 * @param converter 定义 CAD 到世界坐标转换器。
 * @param polyline 定义 CAD 折线。
 */
function toWorldPolyline(converter: ICadCoordinateConverter, polyline: ICadPolyline): Vector3[] {
	const points = polyline.points.map((point) => converter.cadToWorld(point));
	if (polyline.closed && points.length > 2) {
		points.push(points[0].clone());
	}

	return points;
}

/**
 * 按固定折线数量切分数组。
 * @param polylines 定义原始折线集合。
 * @param chunkSize 定义每个 chunk 的最大折线数量。
 */
function chunkPolylines(polylines: ICadPolyline[], chunkSize: number): ICadPolyline[][] {
	const chunks: ICadPolyline[][] = [];
	for (let index = 0; index < polylines.length; index += chunkSize) {
		chunks.push(polylines.slice(index, index + chunkSize));
	}

	return chunks;
}

/**
 * 根据图纸真实长宽和用户配置计算动态贴图尺寸。
 * @param widthMeters 定义 CAD 世界宽度。
 * @param heightMeters 定义 CAD 世界高度。
 * @param requestedLongSide 定义用户配置的最长边像素。
 */
function calculateTextureSize(widthMeters: number, heightMeters: number, requestedLongSide: number): { width: number; height: number } {
	const longSide = Math.round(clampNumber(requestedLongSide, MIN_TEXTURE_LONG_SIDE, MAX_TEXTURE_LONG_SIDE, DEFAULT_TEXTURE_LONG_SIDE));
	const aspect = widthMeters / heightMeters;
	if (!Number.isFinite(aspect) || aspect <= 0) {
		throw new Error("CAD 图纸包围盒为空，无法计算贴图尺寸。");
	}

	if (aspect >= 1) {
		return {
			width: longSide,
			height: Math.max(1, Math.round(longSide / aspect)),
		};
	}

	return {
		width: Math.max(1, Math.round(longSide * aspect)),
		height: longSide,
	};
}

/**
 * 统计 CAD 折线总线段数。
 * @param polylines 定义 CAD 折线集合。
 */
function countLineSegments(polylines: ICadPolyline[]): number {
	return polylines.reduce((sum, polyline) => sum + Math.max(0, polyline.points.length - 1) + (polyline.closed ? 1 : 0), 0);
}

/**
 * 将数值限制到合法范围，异常时使用默认值。
 * @param value 定义原始数值。
 * @param min 定义最小值。
 * @param max 定义最大值。
 * @param fallback 定义默认值。
 */
function clampNumber(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, value));
}
