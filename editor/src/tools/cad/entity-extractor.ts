import DxfParser, {
	IArcEntity,
	IBlock,
	ICircleEntity,
	IDxf,
	IEntity,
	IInsertEntity,
	ILineEntity,
	ILwpolylineEntity,
	IPoint,
	IPolylineEntity,
	ISplineEntity,
} from "dxf-parser";

import { isRenderableCadPoint } from "./coordinate";
import { ICadExtractResult, ICadInsert, ICadLayerSummary, ICadPoint3, ICadPolyline } from "./types";

const DEFAULT_LAYER_NAME = "0";
const CAD_INSERT_RECURSION_LIMIT = 24;
const CAD_INSERT_ARRAY_INSTANCE_LIMIT = 20000;
const CAD_RENDERABLE_ENTITY_TYPES = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "SPLINE"]);

interface ICadTransform2D {
	a: number;
	b: number;
	c: number;
	d: number;
	tx: number;
	ty: number;
}

interface ICadExpandedEntity {
	entity: IEntity;
	transform: ICadTransform2D;
	inheritedLayer?: string;
}

interface ICadExpandedInsert {
	entity: IInsertEntity;
	transform: ICadTransform2D;
	inheritedLayer?: string;
}

interface ICadEntityExpansionContext {
	blocks: Record<string, IBlock>;
	parentTransform: ICadTransform2D;
	inheritedLayer?: string;
	stack: string[];
	depth: number;
	result: ICadEntityExpansionResult;
}

interface ICadEntityExpansionResult {
	entities: ICadExpandedEntity[];
	inserts: ICadExpandedInsert[];
	skippedInsertCount: number;
}

const CAD_IDENTITY_TRANSFORM_2D: ICadTransform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/**
 * 使用 dxf-parser 解析 DXF 文本，并提取当前版本支持的二维实体。
 * @param dxfText 定义 DXF 原始文本。
 */
export function extractCadDxfEntities(dxfText: string): ICadExtractResult {
	const dxf = parseDxfText(dxfText);
	const layerMap = collectLayers(dxf);
	const polylines: ICadPolyline[] = [];
	const inserts: ICadInsert[] = [];
	const expansion = getRenderableEntityExpansion(dxf);
	let skippedEntityCount = expansion.skippedInsertCount;

	for (const expanded of expansion.entities) {
		const extracted = extractEntity(expanded, polylines.length);
		if (extracted.polylines.length) {
			polylines.push(...extracted.polylines);
		} else if (extracted.skipped) {
			skippedEntityCount++;
		}
	}

	inserts.push(...expansion.inserts.map(createInsertMetadata));
	const layers = summarizeLayers(layerMap, polylines);
	return {
		header: {
			insunits: readInsunits(dxf),
		},
		polylines,
		inserts,
		layers,
		skippedEntityCount,
	};
}

/**
 * 解析 DXF 文本并把解析失败统一转成中文错误。
 * @param dxfText 定义 DXF 原始文本。
 */
function parseDxfText(dxfText: string): IDxf {
	if (!dxfText.trim()) {
		throw new Error("DXF 文件为空，无法导入 CAD 图纸。");
	}

	const parser = new DxfParser();
	let dxf: IDxf | null = null;
	try {
		dxf = parser.parseSync(normalizeDxfTextForParser(dxfText));
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		throw new Error(`DXF 文件解析失败：${message}`);
	}

	if (!dxf) {
		throw new Error("DXF 文件解析失败，未得到有效图纸数据。");
	}

	return dxf;
}

/**
 * 归一化 DXF 文本给 dxf-parser 读取；部分 dwg2dxf 输出会缺少最终 EOF 组。
 * @param dxfText 定义 DXF 原始文本。
 */
function normalizeDxfTextForParser(dxfText: string): string {
	const lines = dxfText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	while (lines.length && !lines[lines.length - 1].trim()) {
		lines.pop();
	}

	if (lines.length % 2 === 1 && isPotentialDxfGroupCode(lines[lines.length - 1])) {
		lines.pop();
	}

	const lastCode = lines[lines.length - 2]?.trim();
	const lastValue = lines[lines.length - 1]?.trim().toUpperCase();
	if (lastCode !== "0" || lastValue !== "EOF") {
		lines.push("  0", "EOF");
	}

	return `${lines.join("\n")}\n`;
}

/**
 * 判断尾部孤行是否像 DXF group code，避免转换器截断导致解析器读到半个 group。
 * @param line 定义待检查的尾部行。
 */
function isPotentialDxfGroupCode(line: string | undefined): boolean {
	return Boolean(line?.trim().match(/^-?\d+$/));
}

/**
 * 读取模型空间实体；若转换器只输出 BLOCKS，则展开孤立块定义中的 INSERT。
 * @param dxf 定义 dxf-parser 输出对象。
 */
function getRenderableEntityExpansion(dxf: IDxf): ICadEntityExpansionResult {
	const blocks = dxf.blocks ?? {};
	if (dxf.entities?.length) {
		const result = createCadEntityExpansionResult();
		for (const entity of dxf.entities) {
			pushExpandedEntityOrInsert(entity, { blocks, parentTransform: CAD_IDENTITY_TRANSFORM_2D, stack: [], depth: 0, result });
		}
		if (result.entities.some((expanded) => CAD_RENDERABLE_ENTITY_TYPES.has(expanded.entity.type))) {
			return result;
		}
	}

	return expandVisibleBlockDefinitions(blocks);
}

/**
 * 展开可见孤立块定义；部分转换器会把模型空间内容只写入 BLOCKS。
 * @param blocks 定义 DXF 块表。
 */
function expandVisibleBlockDefinitions(blocks: Record<string, IBlock>): ICadEntityExpansionResult {
	const result = createCadEntityExpansionResult();
	const referencedBlockNames = getReferencedBlockNames(blocks);
	for (const block of Object.values(blocks)) {
		if (!isVisibleBlockDefinitionCandidate(block, referencedBlockNames)) {
			continue;
		}

		for (const entity of getBlockEntities(block)) {
			pushExpandedEntityOrInsert(entity, { blocks, parentTransform: CAD_IDENTITY_TRANSFORM_2D, stack: [block.name], depth: 1, result });
		}
	}

	return result;
}

/**
 * 安全读取单个 BLOCK 定义中的实体列表。
 * @param block 定义 dxf-parser 输出的块定义。
 */
function getBlockEntities(block: IBlock): IEntity[] {
	return block.entities ?? [];
}

/**
 * 创建块展开结果容器。
 */
function createCadEntityExpansionResult(): ICadEntityExpansionResult {
	return {
		entities: [],
		inserts: [],
		skippedInsertCount: 0,
	};
}

/**
 * 展开普通实体或 INSERT 引用，INSERT 会按块基点、缩放、旋转和平移递归展开。
 * @param entity 定义当前实体。
 * @param context 定义块表、父级变换、递归状态和累计输出。
 */
function pushExpandedEntityOrInsert(entity: IEntity, context: ICadEntityExpansionContext): void {
	const { blocks, parentTransform, inheritedLayer, stack, depth, result } = context;
	if (entity.visible === false) {
		return;
	}

	if (entity.type !== "INSERT") {
		result.entities.push({ entity, transform: parentTransform, inheritedLayer });
		return;
	}

	const insert = entity as IInsertEntity;
	result.inserts.push({ entity: insert, transform: parentTransform, inheritedLayer });
	const block = blocks[insert.name];
	if (!block || depth > CAD_INSERT_RECURSION_LIMIT || stack.includes(insert.name)) {
		result.skippedInsertCount++;
		return;
	}

	const columns = getInsertColumnCount(insert);
	const rows = getInsertRowCount(insert);
	const instanceCount = columns * rows;
	if (!Number.isFinite(instanceCount) || instanceCount > CAD_INSERT_ARRAY_INSTANCE_LIMIT) {
		result.skippedInsertCount++;
		return;
	}

	const insertLayer = resolveInheritedLayer(insert.layer, inheritedLayer);
	for (let column = 0; column < columns; column++) {
		for (let row = 0; row < rows; row++) {
			const transform = multiplyCadTransform2D(parentTransform, createInsertTransform(insert, block.position, column, row));
			for (const childEntity of getBlockEntities(block)) {
				pushExpandedEntityOrInsert(childEntity, { blocks, parentTransform: transform, inheritedLayer: insertLayer, stack: [...stack, insert.name], depth: depth + 1, result });
			}
		}
	}
}

/**
 * 收集所有被 INSERT 引用的块名，未被引用的块才可能是转换器导出的可见根块。
 * @param blocks 定义 DXF 块表。
 */
function getReferencedBlockNames(blocks: Record<string, IBlock>): Set<string> {
	const referenced = new Set<string>();
	for (const block of Object.values(blocks)) {
		for (const entity of getBlockEntities(block)) {
			if (entity.type === "INSERT") {
				referenced.add((entity as IInsertEntity).name);
			}
		}
	}

	return referenced;
}

/**
 * 判断孤立块定义是否适合作为可见模型空间内容渲染。
 * @param block 定义候选块。
 * @param referencedBlockNames 定义已经被其他 INSERT 引用的块名集合。
 */
function isVisibleBlockDefinitionCandidate(block: IBlock, referencedBlockNames: Set<string>): boolean {
	if (referencedBlockNames.has(block.name)) {
		return false;
	}

	const normalizedName = block.name.toLowerCase();
	if (normalizedName === "*model_space" || normalizedName === "*paper_space" || normalizedName.startsWith("*paper_space")) {
		return false;
	}

	return Boolean(getBlockEntities(block).length);
}

/**
 * 根据 DXF 实体类型提取折线或 INSERT 元数据。
 * @param expanded 定义已经展开到图纸坐标系的 DXF 实体。
 * @param startIndex 定义生成折线 id 的起始索引。
 */
function extractEntity(expanded: ICadExpandedEntity, startIndex: number): { polylines: ICadPolyline[]; skipped: boolean } {
	const { entity } = expanded;
	if (entity.visible === false) {
		return { polylines: [], skipped: false };
	}

	switch (entity.type) {
		case "LINE":
			return createLinePolyline(expanded, startIndex);
		case "LWPOLYLINE":
			return createVertexPolyline(expanded as ICadExpandedEntity & { entity: ILwpolylineEntity }, startIndex);
		case "POLYLINE":
			return createVertexPolyline(expanded as ICadExpandedEntity & { entity: IPolylineEntity }, startIndex);
		case "CIRCLE":
			return createCirclePolyline(expanded as ICadExpandedEntity & { entity: ICircleEntity }, startIndex);
		case "ARC":
			return createArcPolyline(expanded as ICadExpandedEntity & { entity: IArcEntity }, startIndex);
		case "SPLINE":
			return createSplinePolyline(expanded as ICadExpandedEntity & { entity: ISplineEntity }, startIndex);
		default:
			return { polylines: [], skipped: true };
	}
}

/**
 * 将 LINE 实体转换成两点折线。
 * @param entity 定义 DXF LINE 实体。
 * @param index 定义折线序号。
 */
function createLinePolyline(expanded: ICadExpandedEntity, index: number): { polylines: ICadPolyline[]; skipped: boolean } {
	return createPolyline(expanded, (expanded.entity as ILineEntity).vertices ?? [], false, index);
}

/**
 * 将 POLYLINE/LWPOLYLINE 顶点实体转换成折线。
 * @param entity 定义 DXF 折线实体。
 * @param index 定义折线序号。
 */
function createVertexPolyline(expanded: ICadExpandedEntity & { entity: ILwpolylineEntity | IPolylineEntity }, index: number): { polylines: ICadPolyline[]; skipped: boolean } {
	return createPolyline(expanded, expanded.entity.vertices ?? [], Boolean(expanded.entity.shape), index);
}

/**
 * 将 CIRCLE 实体离散为闭合折线。
 * @param entity 定义 DXF CIRCLE 实体。
 * @param index 定义折线序号。
 */
function createCirclePolyline(expanded: ICadExpandedEntity & { entity: ICircleEntity }, index: number): { polylines: ICadPolyline[]; skipped: boolean } {
	return createPolyline(expanded, createArcPoints(expanded.entity.center, expanded.entity.radius, 0, Math.PI * 2, 96), true, index);
}

/**
 * 将 ARC 实体离散为开放折线。
 * @param entity 定义 DXF ARC 实体。
 * @param index 定义折线序号。
 */
function createArcPolyline(expanded: ICadExpandedEntity & { entity: IArcEntity }, index: number): { polylines: ICadPolyline[]; skipped: boolean } {
	const endAngle = normalizeEndAngle(expanded.entity.startAngle, expanded.entity.endAngle);
	return createPolyline(
		expanded,
		createArcPoints(expanded.entity.center, expanded.entity.radius, expanded.entity.startAngle, endAngle, getArcSegmentCount(expanded.entity.radius, endAngle - expanded.entity.startAngle)),
		false,
		index
	);
}

/**
 * 将 SPLINE 实体的拟合点或控制点作为 v1 近似折线。
 * @param entity 定义 DXF SPLINE 实体。
 * @param index 定义折线序号。
 */
function createSplinePolyline(expanded: ICadExpandedEntity & { entity: ISplineEntity }, index: number): { polylines: ICadPolyline[]; skipped: boolean } {
	return createPolyline(expanded, expanded.entity.fitPoints?.length ? expanded.entity.fitPoints : expanded.entity.controlPoints ?? [], Boolean(expanded.entity.closed), index);
}

/**
 * 创建 INSERT 元数据，位置会按父级块变换映射到最终图纸坐标。
 * @param expanded 定义已经展开到图纸坐标系的 INSERT。
 */
function createInsertMetadata(expanded: ICadExpandedInsert): ICadInsert {
	const entity = expanded.entity;
	const effectiveTransform = multiplyCadTransform2D(expanded.transform, createInsertTransform(entity, undefined, 0, 0));
	return {
		name: entity.name,
		layer: resolveLayerName(entity.layer, expanded.inheritedLayer),
		position: transformCadPoint(toCadPoint(entity.position), expanded.transform),
		rotation: radiansToDegrees(Math.atan2(effectiveTransform.b, effectiveTransform.a)),
		xScale: Math.hypot(effectiveTransform.a, effectiveTransform.b),
		yScale: Math.hypot(effectiveTransform.c, effectiveTransform.d),
		zScale: readFiniteNumber(entity.zScale, 1),
	};
}

/**
 * 解析实体最终图层，块内 0/ByBlock 图层会继承 INSERT 所在图层。
 * @param layer 定义实体自身图层。
 * @param inheritedLayer 定义父级 INSERT 传入的图层。
 */
function resolveLayerName(layer: string | undefined, inheritedLayer: string | undefined): string {
	const normalizedLayer = normalizeLayerName(layer);
	if (isInheritedBlockLayer(normalizedLayer)) {
		return normalizeLayerName(inheritedLayer);
	}

	return normalizedLayer;
}

/**
 * 解析继续传给子块的继承图层，保持 AutoCAD 块内 0 图层随插入图层显示的语义。
 * @param insertLayer 定义当前 INSERT 自身图层。
 * @param parentLayer 定义父级块引用继承图层。
 */
function resolveInheritedLayer(insertLayer: string | undefined, parentLayer: string | undefined): string {
	return resolveLayerName(insertLayer, parentLayer);
}

/**
 * 把点集封装为有效 CAD 折线。
 * @param entity 定义原始 DXF 实体。
 * @param rawPoints 定义实体点集。
 * @param closed 定义折线是否闭合。
 * @param index 定义折线序号。
 */
function createPolyline(expanded: ICadExpandedEntity, rawPoints: IPoint[], closed: boolean, index: number): { polylines: ICadPolyline[]; skipped: boolean } {
	const points = rawPoints
		.map(toCadPoint)
		.map((point) => transformCadPoint(point, expanded.transform))
		.filter(isRenderableCadPoint);
	if (points.length < 2) {
		return { polylines: [], skipped: true };
	}

	return {
		polylines: [
			{
				id: `${expanded.entity.type}_${index}`,
				entityType: expanded.entity.type,
				layer: resolveLayerName(expanded.entity.layer, expanded.inheritedLayer),
				points,
				closed,
				color: getEntityColor(expanded.entity),
			},
		],
		skipped: false,
	};
}

/**
 * 将 dxf-parser 的点对象转换为稳定三维点。
 * @param point 定义 dxf-parser 输出点。
 */
function toCadPoint(point: Partial<IPoint> | undefined): ICadPoint3 {
	return {
		x: readFiniteNumber(point?.x, 0),
		y: readFiniteNumber(point?.y, 0),
		z: readFiniteNumber(point?.z, 0),
	};
}

/**
 * 创建 INSERT 到父坐标系的二维仿射变换，包含块基点、缩放、旋转和阵列偏移。
 * @param insert 定义块引用。
 * @param blockBasePoint 定义被引用块的基点。
 * @param column 定义当前阵列列号。
 * @param row 定义当前阵列行号。
 */
function createInsertTransform(insert: IInsertEntity, blockBasePoint: Partial<IPoint> | undefined, column: number, row: number): ICadTransform2D {
	const offsetX = column * readFiniteNumber(insert.columnSpacing, 0);
	const offsetY = row * readFiniteNumber(insert.rowSpacing, 0);
	const rotation = degreesToRadians(readFiniteNumber(insert.rotation, 0));
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const scaleX = readFiniteNumber(insert.xScale, 1);
	const scaleY = readFiniteNumber(insert.yScale, 1);
	const a = cos * scaleX;
	const b = sin * scaleX;
	const c = -sin * scaleY;
	const d = cos * scaleY;
	const basePoint = toCadPoint(blockBasePoint);
	const position = toCadPoint(insert.position);

	return {
		a,
		b,
		c,
		d,
		tx: position.x + a * (offsetX - basePoint.x) + c * (offsetY - basePoint.y),
		ty: position.y + b * (offsetX - basePoint.x) + d * (offsetY - basePoint.y),
	};
}

/**
 * 组合两个二维仿射变换，返回先应用 right 再应用 left 的结果。
 * @param left 定义父级变换。
 * @param right 定义子级变换。
 */
function multiplyCadTransform2D(left: ICadTransform2D, right: ICadTransform2D): ICadTransform2D {
	return {
		a: left.a * right.a + left.c * right.b,
		b: left.b * right.a + left.d * right.b,
		c: left.a * right.c + left.c * right.d,
		d: left.b * right.c + left.d * right.d,
		tx: left.a * right.tx + left.c * right.ty + left.tx,
		ty: left.b * right.tx + left.d * right.ty + left.ty,
	};
}

/**
 * 对 CAD 点应用二维仿射矩阵，Z 坐标保留用于后续过滤。
 * @param point 定义原始 CAD 点。
 * @param transform 定义二维仿射变换。
 */
function transformCadPoint(point: ICadPoint3, transform: ICadTransform2D): ICadPoint3 {
	return {
		x: transform.a * point.x + transform.c * point.y + transform.tx,
		y: transform.b * point.x + transform.d * point.y + transform.ty,
		z: point.z,
	};
}

/**
 * 将角度转换为弧度。
 * @param degrees 定义 DXF INSERT 角度。
 */
function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * 将弧度转换为角度。
 * @param radians 定义弧度值。
 */
function radiansToDegrees(radians: number): number {
	return (radians * 180) / Math.PI;
}

/**
 * 获取 INSERT 阵列列数。
 * @param insert 定义块引用。
 */
function getInsertColumnCount(insert: IInsertEntity): number {
	return Math.max(1, Math.floor(readFiniteNumber(insert.columnCount, 1)));
}

/**
 * 获取 INSERT 阵列行数。
 * @param insert 定义块引用。
 */
function getInsertRowCount(insert: IInsertEntity): number {
	return Math.max(1, Math.floor(readFiniteNumber(insert.rowCount, 1)));
}

/**
 * 读取有限数字，转换器输出异常值时使用安全默认值。
 * @param value 定义可能来自 dxf-parser 的数值。
 * @param fallback 定义异常时使用的默认值。
 */
function readFiniteNumber(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 采样圆弧点集。
 * @param center 定义圆心。
 * @param radius 定义半径。
 * @param startAngle 定义起始弧度。
 * @param endAngle 定义结束弧度。
 * @param segmentCount 定义采样段数。
 */
function createArcPoints(center: IPoint, radius: number, startAngle: number, endAngle: number, segmentCount: number): ICadPoint3[] {
	if (!center || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
		return [];
	}

	const points: ICadPoint3[] = [];
	for (let index = 0; index <= segmentCount; index++) {
		const angle = startAngle + ((endAngle - startAngle) * index) / segmentCount;
		points.push({
			x: center.x + radius * Math.cos(angle),
			y: center.y + radius * Math.sin(angle),
			z: center.z ?? 0,
		});
	}

	return points;
}

/**
 * 规范化圆弧结束角，处理 DXF 中跨越 0 度的圆弧。
 * @param startAngle 定义起始弧度。
 * @param endAngle 定义结束弧度。
 */
function normalizeEndAngle(startAngle: number, endAngle: number): number {
	if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
		return startAngle;
	}

	let normalized = endAngle;
	const twoPi = Math.PI * 2;
	while (normalized <= startAngle) {
		normalized += twoPi;
	}

	return normalized;
}

/**
 * 根据圆弧角度和半径估算采样段数。
 * @param radius 定义圆弧半径。
 * @param angle 定义圆弧跨度。
 */
function getArcSegmentCount(radius: number, angle: number): number {
	const byAngle = Math.ceil(Math.abs(angle) / (Math.PI / 24));
	const byRadius = Math.ceil(Math.sqrt(Math.max(1, radius)) * 2);
	return Math.max(8, Math.min(128, Math.max(byAngle, byRadius)));
}

/**
 * 收集 DXF 图层表定义，用于后续输出图层摘要。
 * @param dxf 定义 dxf-parser 输出对象。
 */
function collectLayers(dxf: IDxf): Map<string, ICadLayerSummary> {
	const layers = new Map<string, ICadLayerSummary>();
	const tableLayers = dxf.tables?.layer?.layers ?? {};
	for (const layer of Object.values(tableLayers)) {
		const name = normalizeLayerName(layer.name);
		layers.set(name, {
			name,
			visible: layer.visible !== false,
			color: colorNumberToHex(layer.color),
			polylineCount: 0,
			segmentCount: 0,
		});
	}

	layers.set(DEFAULT_LAYER_NAME, layers.get(DEFAULT_LAYER_NAME) ?? createLayerSummary(DEFAULT_LAYER_NAME));
	return layers;
}

/**
 * 汇总每个图层的折线和线段数量。
 * @param layerMap 定义图层表初始数据。
 * @param polylines 定义已经提取出的折线集合。
 */
function summarizeLayers(layerMap: Map<string, ICadLayerSummary>, polylines: ICadPolyline[]): ICadLayerSummary[] {
	for (const polyline of polylines) {
		const layer = layerMap.get(polyline.layer) ?? createLayerSummary(polyline.layer);
		layer.polylineCount++;
		layer.segmentCount += Math.max(0, polyline.points.length - 1) + (polyline.closed ? 1 : 0);
		layerMap.set(layer.name, layer);
	}

	return Array.from(layerMap.values()).filter((layer) => layer.polylineCount > 0 || layer.name === DEFAULT_LAYER_NAME);
}

/**
 * 创建默认图层摘要。
 * @param name 定义图层名称。
 */
function createLayerSummary(name: string): ICadLayerSummary {
	return {
		name,
		visible: true,
		polylineCount: 0,
		segmentCount: 0,
	};
}

/**
 * 读取 DXF 头部 $INSUNITS。
 * @param dxf 定义 dxf-parser 输出对象。
 */
function readInsunits(dxf: IDxf): number | undefined {
	const value = dxf.header?.["$INSUNITS"] ?? dxf.header?.["INSUNITS"];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * 规范化空图层名。
 * @param layer 定义实体图层名。
 */
function normalizeLayerName(layer: string | undefined): string {
	return layer?.trim() || DEFAULT_LAYER_NAME;
}

/**
 * 判断图层名是否需要继承块引用图层。
 * @param layer 定义已经规范化的图层名。
 */
function isInheritedBlockLayer(layer: string): boolean {
	const normalized = layer.toLowerCase();
	return normalized === DEFAULT_LAYER_NAME || normalized === "byblock";
}

/**
 * 将实体颜色转换为 CSS 十六进制颜色。
 * @param entity 定义 DXF 实体。
 */
function getEntityColor(entity: IEntity): string | undefined {
	if (typeof entity.color === "number") {
		return colorNumberToHex(entity.color);
	}

	return undefined;
}

/**
 * 将 dxf-parser 的整数颜色转换成十六进制字符串。
 * @param color 定义整数颜色。
 */
function colorNumberToHex(color: number | undefined): string | undefined {
	if (typeof color !== "number" || !Number.isFinite(color) || color <= 0) {
		return undefined;
	}

	return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}
