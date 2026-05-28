import { ensureDir, readFile, writeFile } from "fs-extra";
import { basename, dirname, extname, join } from "path/posix";

import { Color3, ISceneLoaderAsyncResult, LinesMesh, MeshBuilder, Scene, TransformNode, Vector3 } from "babylonjs";
import { PNG } from "pngjs";

interface IDxfGroup {
	code: number;
	value: string;
}

interface IDxfPoint2 {
	x: number;
	y: number;
	z: number;
	bulge?: number;
}

interface IDxfLineSegment {
	color: number;
	points: Vector3[];
}

interface IDxfInsertReference {
	blockName: string;
	position: Vector3;
	scale: Vector3;
	rotationRadians: number;
	columns: number;
	rows: number;
	columnSpacing: number;
	rowSpacing: number;
}

interface IDxfBlockDefinition {
	name: string;
	basePoint: Vector3;
	segments: IDxfLineSegment[];
	inserts: IDxfInsertReference[];
}

interface IDxfVectorParseResult {
	entityCounts: Record<string, number>;
	lineSegmentCount: number;
	rawLineSegmentCount: number;
	skippedEntityCount: number;
	skippedLineSegmentCount: number;
	expandedInsertCount: number;
	skippedInsertCount: number;
	visibleBlockDefinitionCount: number;
	segments: IDxfLineSegment[];
	blocks: Map<string, IDxfBlockDefinition>;
	topLevelInserts: IDxfInsertReference[];
}

interface IDxfVectorBounds {
	minimum: Vector3;
	maximum: Vector3;
	size: Vector3;
}

interface IDxfTransform2D {
	a: number;
	b: number;
	c: number;
	d: number;
	tx: number;
	ty: number;
}

export type CadDrawingSheetCandidateSource = "block" | "cluster" | "model";

export const CAD_MODEL_FULL_SHEET_CANDIDATE_ID = "model-full";

export interface ICadDrawingSheetCandidate {
	id: string;
	name: string;
	source: CadDrawingSheetCandidateSource;
	bounds: {
		minimum: [number, number, number];
		maximum: [number, number, number];
		size: [number, number, number];
	};
	entityCount: number;
	thumbnailPath: string;
}

interface ICadDxfSheetCandidateDraft extends Omit<ICadDrawingSheetCandidate, "thumbnailPath"> {
	segments: IDxfLineSegment[];
}

export interface ICadDxfReferenceImageResult {
	imagePath: string;
	widthMeters: number;
	heightMeters: number;
	pixelWidth: number;
	pixelHeight: number;
	lineSegmentCount: number;
	rawLineSegmentCount: number;
	skippedEntityCount: number;
	skippedLineSegmentCount: number;
	expandedInsertCount: number;
	skippedInsertCount: number;
	visibleBlockDefinitionCount: number;
	croppedLineSegmentCount: number;
	usedRobustBounds: boolean;
	coordinateLimit: number;
	bounds: {
		minimum: [number, number, number];
		maximum: [number, number, number];
		size: [number, number, number];
	};
	sourceBounds: {
		minimum: [number, number, number];
		maximum: [number, number, number];
		size: [number, number, number];
	};
	selectedSheet?: ICadDrawingSheetCandidate;
}

export interface ICadDxfReferenceImageOptions {
	sheetCandidate?: ICadDrawingSheetCandidate;
	sheetCandidateId?: string;
	maxImageSize?: number;
	thumbnail?: boolean;
}

const DXF_VECTOR_MESH_LINE_LIMIT = 5000;
const DXF_DEFAULT_COLOR_INDEX = 7;
const DXF_RENDERABLE_COORDINATE_LIMIT = 1000000000;
const DXF_RENDERABLE_SEGMENT_LENGTH_LIMIT = 1000000000;
const DXF_MIN_BULGE = 0.000001;
const DXF_REFERENCE_IMAGE_MAX_SIZE = 4096;
const DXF_REFERENCE_IMAGE_MIN_SIZE = 64;
const DXF_REFERENCE_IMAGE_BACKGROUND_RGBA: [number, number, number, number] = [255, 255, 255, 48];
const DXF_REFERENCE_BOUNDS_TRIM_RATIO = 0.05;
const DXF_REFERENCE_BOUNDS_EXPAND_RATIO = 0.05;
const DXF_REFERENCE_BOUNDS_MIN_AREA_RATIO = 2;
const DXF_SHEET_CLUSTER_EXPAND_RATIO = 0.03;
const DXF_SHEET_CLUSTER_MIN_GAP = 10;
const DXF_SHEET_MIN_SEGMENT_COUNT = 3;
const DXF_SHEET_MAX_CANDIDATE_COUNT = 24;
const DXF_SHEET_THUMBNAIL_MAX_SIZE = 512;
const DXF_SHEET_THUMBNAIL_MIN_SIZE = 96;
const DXF_INSERT_RECURSION_LIMIT = 24;
const DXF_INSERT_ARRAY_INSTANCE_LIMIT = 10000;
const DXF_SUPPORTED_SECTIONS = new Set(["TABLES", "BLOCKS", "ENTITIES"]);
const DXF_SUPPORTED_ENTITY_TYPES = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "SPLINE", "ELLIPSE", "INSERT"]);
const DXF_IDENTITY_TRANSFORM_2D: IDxfTransform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/**
 * 直接解析 DXF 中的二维线框实体并生成 Babylon 线段，用于 Assimp 不支持某些 DXF 时兜底导入。
 * @param scene 定义需要添加 CAD 线框的 Babylon 场景。
 * @param absolutePath 定义需要读取的 DXF 文件路径。
 */
export async function loadCadDxfVectorDrawing(scene: Scene, absolutePath: string): Promise<ISceneLoaderAsyncResult> {
	const buffer = await readFile(absolutePath);
	const parsed = parseCadDxfVectorDrawing(buffer.toString("utf-8"));
	if (!parsed.lineSegmentCount) {
		throw new Error("DXF 文件中未解析出可显示的线框实体。");
	}

	const root = new TransformNode(basename(absolutePath), scene);
	root.metadata = {
		cadDxfVectorFallback: {
			entityCounts: parsed.entityCounts,
			lineSegmentCount: parsed.lineSegmentCount,
			rawLineSegmentCount: parsed.rawLineSegmentCount,
			skippedEntityCount: parsed.skippedEntityCount,
			skippedLineSegmentCount: parsed.skippedLineSegmentCount,
			expandedInsertCount: parsed.expandedInsertCount,
			skippedInsertCount: parsed.skippedInsertCount,
			visibleBlockDefinitionCount: parsed.visibleBlockDefinitionCount,
			coordinateLimit: DXF_RENDERABLE_COORDINATE_LIMIT,
		},
	};

	const meshes = createCadDxfLineMeshes(scene, root, parsed.segments);
	return {
		meshes,
		particleSystems: [],
		skeletons: [],
		animationGroups: [],
		transformNodes: [root],
		geometries: [],
		lights: [],
		spriteManagers: [],
	};
}

/**
 * 将 DXF 线框栅格化为 PNG 图片，后续作为地面参照图贴到水平面。
 * @param absolutePath 定义需要读取的 DXF 文件路径。
 * @param outputPath 定义可选输出 PNG 路径，缺省时写到 DXF 同目录。
 * @param options 定义可选图纸候选和图片尺寸参数。
 */
export async function createCadDxfReferenceImage(absolutePath: string, outputPath?: string, options?: ICadDxfReferenceImageOptions): Promise<ICadDxfReferenceImageResult> {
	const buffer = await readFile(absolutePath);
	const parsed = parseCadDxfVectorDrawing(buffer.toString("utf-8"));
	if (!parsed.lineSegmentCount) {
		throw new Error("DXF 文件中未解析出可转换为参照图片的线框实体。");
	}

	const requestedSheetCandidateId = options?.sheetCandidate?.id ?? options?.sheetCandidateId;
	const selectedDraft = requestedSheetCandidateId ? findCadDxfSheetCandidateDraft(parsed, requestedSheetCandidateId) : null;
	if (requestedSheetCandidateId && !selectedDraft) {
		throw new Error(`未找到 CAD 图纸候选：${requestedSheetCandidateId}`);
	}

	const selectedSegments = selectedDraft?.segments ?? parsed.segments;
	const sourceBounds = getDxfVectorBounds(selectedSegments);
	if (!sourceBounds || sourceBounds.size.x <= 0 || sourceBounds.size.y <= 0) {
		throw new Error("DXF 图纸包围盒无效，无法生成地面参照图片。");
	}

	const renderBounds = getDxfReferenceRenderBounds(selectedSegments, sourceBounds);
	const renderSegments = selectedSegments.filter((segment) => isDxfSegmentInsideBounds(segment, renderBounds));
	if (!renderSegments.length) {
		throw new Error("DXF 图纸裁剪后没有可显示线段，无法生成地面参照图片。");
	}

	const imageSize = getCadDxfReferenceImageSize(
		renderBounds.size.x,
		renderBounds.size.y,
		options?.maxImageSize ?? (options?.thumbnail ? DXF_SHEET_THUMBNAIL_MAX_SIZE : DXF_REFERENCE_IMAGE_MAX_SIZE),
		options?.thumbnail ? DXF_SHEET_THUMBNAIL_MIN_SIZE : DXF_REFERENCE_IMAGE_MIN_SIZE
	);
	const png = rasterizeDxfSegmentsToPng(renderSegments, renderBounds, imageSize.width, imageSize.height);
	const suffix = selectedDraft ? `.sheet-${selectedDraft.id}` : "";
	const imagePath = outputPath ?? join(dirname(absolutePath), `${basename(absolutePath, extname(absolutePath))}${suffix}.reference.png`);

	await ensureDir(dirname(imagePath));
	await writeFile(imagePath, PNG.sync.write(png));

	return {
		imagePath,
		widthMeters: renderBounds.size.x,
		heightMeters: renderBounds.size.y,
		pixelWidth: imageSize.width,
		pixelHeight: imageSize.height,
		lineSegmentCount: renderSegments.length,
		rawLineSegmentCount: parsed.rawLineSegmentCount,
		skippedEntityCount: parsed.skippedEntityCount,
		skippedLineSegmentCount: parsed.skippedLineSegmentCount,
		expandedInsertCount: parsed.expandedInsertCount,
		skippedInsertCount: parsed.skippedInsertCount,
		visibleBlockDefinitionCount: parsed.visibleBlockDefinitionCount,
		croppedLineSegmentCount: selectedSegments.length - renderSegments.length,
		usedRobustBounds: renderBounds !== sourceBounds,
		coordinateLimit: DXF_RENDERABLE_COORDINATE_LIMIT,
		bounds: {
			minimum: renderBounds.minimum.asArray() as [number, number, number],
			maximum: renderBounds.maximum.asArray() as [number, number, number],
			size: renderBounds.size.asArray() as [number, number, number],
		},
		sourceBounds: {
			minimum: sourceBounds.minimum.asArray() as [number, number, number],
			maximum: sourceBounds.maximum.asArray() as [number, number, number],
			size: sourceBounds.size.asArray() as [number, number, number],
		},
		selectedSheet: selectedDraft ? createCadDxfSheetCandidate(selectedDraft, options?.sheetCandidate?.thumbnailPath ?? "") : undefined,
	};
}

/**
 * 分析 DXF 中可独立导入的图纸候选，并为每个候选生成小尺寸缩略图。
 * @param absolutePath 定义需要分析的 DXF 文件路径。
 */
export async function analyzeCadDxfDrawingSheets(absolutePath: string): Promise<ICadDrawingSheetCandidate[]> {
	const buffer = await readFile(absolutePath);
	const parsed = parseCadDxfVectorDrawing(buffer.toString("utf-8"));
	if (!parsed.lineSegmentCount) {
		throw new Error("DXF 文件中未解析出可显示的线框实体，无法分析图纸候选。");
	}

	const drafts = createCadDxfSheetCandidateDrafts(parsed).slice(0, DXF_SHEET_MAX_CANDIDATE_COUNT);
	if (!drafts.length) {
		throw new Error("DXF 文件中未识别出可用图纸候选。");
	}

	const candidates: ICadDrawingSheetCandidate[] = [];
	for (const draft of drafts) {
		const thumbnailPath = join(dirname(absolutePath), `${basename(absolutePath, extname(absolutePath))}.sheet-${draft.id}.thumbnail.png`);
		const bounds = toDxfVectorBounds(draft.bounds);
		const imageSize = getCadDxfReferenceImageSize(bounds.size.x, bounds.size.y, DXF_SHEET_THUMBNAIL_MAX_SIZE, DXF_SHEET_THUMBNAIL_MIN_SIZE);
		const png = rasterizeDxfSegmentsToPng(draft.segments, bounds, imageSize.width, imageSize.height);
		await ensureDir(dirname(thumbnailPath));
		await writeFile(thumbnailPath, PNG.sync.write(png));
		candidates.push(createCadDxfSheetCandidate(draft, thumbnailPath));
	}

	return candidates;
}

/**
 * 按候选 id 查找可渲染图纸草稿，生成最终贴地图时复用同一套识别规则。
 * @param parsed 定义已经解析出的 DXF 线段和块定义。
 * @param candidateId 定义候选图纸 id。
 */
function findCadDxfSheetCandidateDraft(parsed: IDxfVectorParseResult, candidateId?: string): ICadDxfSheetCandidateDraft | null {
	if (!candidateId) {
		return null;
	}

	return createCadDxfSheetCandidateDrafts(parsed).find((candidate) => candidate.id === candidateId) ?? null;
}

/**
 * 创建 DXF 图纸候选草稿，优先按可见块切分，缺失时再按空间区域切分，并保留完整图纸兜底。
 * @param parsed 定义已经解析出的 DXF 线段和块定义。
 */
function createCadDxfSheetCandidateDrafts(parsed: IDxfVectorParseResult): ICadDxfSheetCandidateDraft[] {
	const blockDrafts = createCadDxfBlockSheetCandidateDrafts(parsed);
	const clusterDrafts = blockDrafts.length >= 2 ? [] : createCadDxfClusterSheetCandidateDrafts(parsed);
	const modelDraft = createCadDxfModelSheetCandidateDraft(parsed);
	const drafts = [...(modelDraft ? [modelDraft] : []), ...sortCadDxfSheetCandidateDrafts(blockDrafts), ...sortCadDxfSheetCandidateDrafts(clusterDrafts)];

	return drafts.slice(0, DXF_SHEET_MAX_CANDIDATE_COUNT);
}

/**
 * 从未被其他块引用的可见 BLOCKS 中提取候选图纸。
 * @param parsed 定义已经解析出的 DXF 线段和块定义。
 */
function createCadDxfBlockSheetCandidateDrafts(parsed: IDxfVectorParseResult): ICadDxfSheetCandidateDraft[] {
	const referencedBlockNames = getReferencedDxfBlockNames(parsed.blocks, parsed.topLevelInserts);
	const drafts: ICadDxfSheetCandidateDraft[] = [];
	let index = 1;

	parsed.blocks.forEach((block) => {
		if (!isDxfSheetBlockCandidate(block, referencedBlockNames)) {
			return;
		}

		const expanded = expandDxfBlockDefinitionSegments(block, parsed.blocks);
		const filtered = filterRenderableDxfLineSegments(expanded.segments).segments;
		const candidate = createCadDxfSheetCandidateDraft({
			id: `block-${index}-${createStableCadDxfCandidateId(block.name)}`,
			name: block.name || `块图纸 ${index}`,
			source: "block",
			segments: filtered,
		});
		if (candidate) {
			drafts.push(candidate);
			index++;
		}
	});

	return drafts;
}

/**
 * 把模型空间中的线段按大间隔自动拆成多个空间区域候选。
 * @param parsed 定义已经解析出的 DXF 线段集合。
 */
function createCadDxfClusterSheetCandidateDrafts(parsed: IDxfVectorParseResult): ICadDxfSheetCandidateDraft[] {
	const segmentBounds = parsed.segments
		.map((segment) => ({ segment, bounds: getDxfVectorBounds([segment]) }))
		.filter((item): item is { segment: IDxfLineSegment; bounds: IDxfVectorBounds } => Boolean(item.bounds));
	const clusters = splitCadDxfSegmentClusters(segmentBounds, 0).filter((cluster) => cluster.length >= DXF_SHEET_MIN_SEGMENT_COUNT);
	if (clusters.length <= 1) {
		return [];
	}

	return clusters
		.map((cluster, index) =>
			createCadDxfSheetCandidateDraft({
				id: `cluster-${index + 1}`,
				name: `空间区域 ${index + 1}`,
				source: "cluster",
				segments: cluster.map((item) => item.segment),
			})
		)
		.filter((candidate): candidate is ICadDxfSheetCandidateDraft => Boolean(candidate));
}

/**
 * 创建完整模型空间候选，用作自动识别失败或用户需要全图时的兜底。
 * @param parsed 定义已经解析出的 DXF 线段集合。
 */
function createCadDxfModelSheetCandidateDraft(parsed: IDxfVectorParseResult): ICadDxfSheetCandidateDraft | null {
	return createCadDxfSheetCandidateDraft({
		id: CAD_MODEL_FULL_SHEET_CANDIDATE_ID,
		name: "完整图纸",
		source: "model",
		segments: parsed.segments,
	});
}

/**
 * 创建单个候选草稿并完成包围盒裁剪、尺寸和实体数量校验。
 * @param options 定义候选基础信息和线段集合。
 */
function createCadDxfSheetCandidateDraft(options: { id: string; name: string; source: CadDrawingSheetCandidateSource; segments: IDxfLineSegment[] }): ICadDxfSheetCandidateDraft | null {
	const sourceSegments = options.segments.filter(isDxfLineSegmentRenderable);
	if (sourceSegments.length < DXF_SHEET_MIN_SEGMENT_COUNT) {
		return null;
	}

	const sourceBounds = getDxfVectorBounds(sourceSegments);
	if (!sourceBounds || sourceBounds.size.x <= 0 || sourceBounds.size.y <= 0) {
		return null;
	}

	const renderBounds = getDxfReferenceRenderBounds(sourceSegments, sourceBounds);
	const renderSegments = sourceSegments.filter((segment) => isDxfSegmentInsideBounds(segment, renderBounds));
	if (renderSegments.length < DXF_SHEET_MIN_SEGMENT_COUNT || renderBounds.size.x <= 0 || renderBounds.size.y <= 0) {
		return null;
	}

	return {
		id: options.id,
		name: options.name,
		source: options.source,
		bounds: createCadDxfBoundsDto(renderBounds),
		entityCount: renderSegments.length,
		segments: renderSegments,
	};
}

/**
 * 将候选草稿转换为可传给预览 UI 的候选对象。
 * @param draft 定义候选草稿。
 * @param thumbnailPath 定义缩略图路径。
 */
function createCadDxfSheetCandidate(draft: ICadDxfSheetCandidateDraft, thumbnailPath: string): ICadDrawingSheetCandidate {
	return {
		id: draft.id,
		name: draft.name,
		source: draft.source,
		bounds: draft.bounds,
		entityCount: draft.entityCount,
		thumbnailPath,
	};
}

/**
 * 根据候选面积和线段数量排序，较大的图纸优先显示。
 * @param drafts 定义候选草稿集合。
 */
function sortCadDxfSheetCandidateDrafts(drafts: ICadDxfSheetCandidateDraft[]): ICadDxfSheetCandidateDraft[] {
	return drafts.sort((a, b) => {
		const areaDelta = getCadDxfSheetCandidateArea(b) - getCadDxfSheetCandidateArea(a);
		return Math.abs(areaDelta) > Number.EPSILON ? areaDelta : b.entityCount - a.entityCount;
	});
}

/**
 * 判断块定义是否适合作为独立图纸候选。
 * @param block 定义块定义。
 * @param referencedBlockNames 定义已经被其他块或顶层 INSERT 使用的块名。
 */
function isDxfSheetBlockCandidate(block: IDxfBlockDefinition, referencedBlockNames: Set<string>): boolean {
	if (!isVisibleDxfBlockDefinitionCandidate(block, referencedBlockNames)) {
		return false;
	}

	const normalizedName = block.name.toLowerCase();
	if (normalizedName.startsWith("*")) {
		return false;
	}

	return true;
}

/**
 * 展开块定义内部线段和嵌套 INSERT，得到该块作为独立图纸时的完整几何。
 * @param block 定义块定义。
 * @param blocks 定义所有块定义。
 */
function expandDxfBlockDefinitionSegments(block: IDxfBlockDefinition, blocks: Map<string, IDxfBlockDefinition>): { segments: IDxfLineSegment[]; expandedInsertCount: number; skippedInsertCount: number } {
	const result = {
		segments: [...block.segments],
		expandedInsertCount: 0,
		skippedInsertCount: 0,
	};
	block.inserts.forEach((insert) => {
		expandDxfInsertReference(insert, blocks, DXF_IDENTITY_TRANSFORM_2D, [block.name], 1, result);
	});
	return result;
}

/**
 * 递归按 X/Y 方向的大间隔拆分线段集合。
 * @param items 定义带包围盒的线段集合。
 * @param depth 定义递归深度。
 */
function splitCadDxfSegmentClusters(items: { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[], depth: number): { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[][] {
	if (depth >= 3 || items.length < DXF_SHEET_MIN_SEGMENT_COUNT * 2) {
		return [items];
	}

	const bounds = getDxfVectorBounds(items.map((item) => item.segment));
	if (!bounds) {
		return [items];
	}

	const xGroups = groupCadDxfClusterItemsByAxis(items, "x", getCadDxfClusterGap(bounds.size.x));
	const yGroups = groupCadDxfClusterItemsByAxis(items, "y", getCadDxfClusterGap(bounds.size.y));
	const groups = chooseCadDxfClusterSplit(xGroups, yGroups);
	if (!groups || groups.length <= 1) {
		return [items];
	}

	return groups.flatMap((group) => splitCadDxfSegmentClusters(group, depth + 1));
}

/**
 * 按单个坐标轴把相邻投影间隔足够大的线段拆成组。
 * @param items 定义带包围盒的线段集合。
 * @param axis 定义拆分坐标轴。
 * @param gap 定义允许留在同一组的最大间隔。
 */
function groupCadDxfClusterItemsByAxis(items: { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[], axis: "x" | "y", gap: number): { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[][] {
	const sorted = [...items].sort((a, b) => readCadDxfVectorAxis(a.bounds.minimum, axis) - readCadDxfVectorAxis(b.bounds.minimum, axis));
	const groups: { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[][] = [];
	let group: { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[] = [];
	let maximum = -Infinity;

	sorted.forEach((item) => {
		const itemMinimum = readCadDxfVectorAxis(item.bounds.minimum, axis);
		if (group.length && itemMinimum > maximum + gap) {
			groups.push(group);
			group = [];
		}

		group.push(item);
		maximum = Math.max(maximum, readCadDxfVectorAxis(item.bounds.maximum, axis));
	});

	if (group.length) {
		groups.push(group);
	}

	return groups.filter((candidate) => candidate.length >= DXF_SHEET_MIN_SEGMENT_COUNT);
}

/**
 * 读取二维聚类所需的向量轴值。
 * @param vector 定义待读取向量。
 * @param axis 定义坐标轴。
 */
function readCadDxfVectorAxis(vector: Vector3, axis: "x" | "y"): number {
	return axis === "x" ? vector.x : vector.y;
}

/**
 * 选择更有意义的空间拆分结果。
 * @param xGroups 定义 X 方向拆分结果。
 * @param yGroups 定义 Y 方向拆分结果。
 */
function chooseCadDxfClusterSplit(
	xGroups: { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[][],
	yGroups: { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[][]
): { segment: IDxfLineSegment; bounds: IDxfVectorBounds }[][] | null {
	if (xGroups.length <= 1 && yGroups.length <= 1) {
		return null;
	}

	if (xGroups.length === yGroups.length) {
		return xGroups.reduce((sum, group) => sum + group.length, 0) >= yGroups.reduce((sum, group) => sum + group.length, 0) ? xGroups : yGroups;
	}

	return xGroups.length > yGroups.length ? xGroups : yGroups;
}

/**
 * 根据当前图纸跨度估算空间聚类允许间隔。
 * @param dimension 定义当前轴向尺寸。
 */
function getCadDxfClusterGap(dimension: number): number {
	return Math.max(DXF_SHEET_CLUSTER_MIN_GAP, dimension * DXF_SHEET_CLUSTER_EXPAND_RATIO);
}

/**
 * 计算候选图纸面积。
 * @param candidate 定义候选草稿。
 */
function getCadDxfSheetCandidateArea(candidate: ICadDxfSheetCandidateDraft): number {
	const size = candidate.bounds.size;
	return size[0] * size[1];
}

/**
 * 为块名生成稳定且适合文件名的候选 id 片段。
 * @param value 定义候选源名称。
 */
function createStableCadDxfCandidateId(value: string): string {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}

	return hash.toString(36);
}

/**
 * 将内部包围盒转换为可序列化数组。
 * @param bounds 定义内部包围盒。
 */
function createCadDxfBoundsDto(bounds: IDxfVectorBounds): ICadDrawingSheetCandidate["bounds"] {
	return {
		minimum: bounds.minimum.asArray() as [number, number, number],
		maximum: bounds.maximum.asArray() as [number, number, number],
		size: bounds.size.asArray() as [number, number, number],
	};
}

/**
 * 将可序列化包围盒还原为内部渲染包围盒。
 * @param bounds 定义候选包围盒。
 */
function toDxfVectorBounds(bounds: ICadDrawingSheetCandidate["bounds"]): IDxfVectorBounds {
	const minimum = Vector3.FromArray(bounds.minimum);
	const maximum = Vector3.FromArray(bounds.maximum);
	return {
		minimum,
		maximum,
		size: maximum.subtract(minimum),
	};
}

/**
 * 将 DXF 文本解析为可渲染线段集合。
 * @param content 定义 DXF 文件文本。
 */
function parseCadDxfVectorDrawing(content: string): IDxfVectorParseResult {
	const groups = readDxfGroups(content);
	const segments: IDxfLineSegment[] = [];
	const topLevelInserts: IDxfInsertReference[] = [];
	const blocks = new Map<string, IDxfBlockDefinition>();
	const entityCounts: Record<string, number> = {};
	let section: string | null = null;
	let skippedEntityCount = 0;

	for (let i = 0; i < groups.length; i++) {
		const group = groups[i];
		if (group.code !== 0) {
			continue;
		}

		if (group.value === "SECTION") {
			section = readSectionName(groups, i + 1);
			continue;
		}

		if (group.value === "ENDSEC") {
			section = null;
			continue;
		}

		if (!section || !DXF_SUPPORTED_SECTIONS.has(section)) {
			continue;
		}

		if (section === "BLOCKS" && group.value === "BLOCK") {
			const parsedBlock = parseDxfBlockDefinition(groups, i, entityCounts);
			if (parsedBlock.block) {
				blocks.set(parsedBlock.block.name, parsedBlock.block);
			} else {
				skippedEntityCount++;
			}
			i = parsedBlock.nextIndex - 1;
			continue;
		}

		if (section !== "ENTITIES") {
			continue;
		}

		const parsedEntity = parseDxfDrawableEntity(groups, i);
		if (parsedEntity.type) {
			entityCounts[parsedEntity.type] = (entityCounts[parsedEntity.type] ?? 0) + 1;
		}
		if (!parsedEntity.segments.length && !parsedEntity.inserts.length && parsedEntity.skipped) {
			skippedEntityCount++;
		}
		segments.push(...parsedEntity.segments);
		topLevelInserts.push(...parsedEntity.inserts);
		i = parsedEntity.nextIndex - 1;
	}

	const expandedInserts = expandDxfInsertReferences(topLevelInserts, blocks);
	segments.push(...expandedInserts.segments);
	const visibleBlocks = segments.length ? { segments: [] as IDxfLineSegment[], expandedInsertCount: 0, skippedInsertCount: 0, visibleBlockDefinitionCount: 0 } : expandVisibleDxfBlockDefinitions(blocks, topLevelInserts);
	segments.push(...visibleBlocks.segments);

	const filtered = filterRenderableDxfLineSegments(segments);
	return {
		entityCounts,
		lineSegmentCount: filtered.segments.length,
		rawLineSegmentCount: segments.length,
		skippedEntityCount,
		skippedLineSegmentCount: filtered.skippedLineSegmentCount,
		expandedInsertCount: expandedInserts.expandedInsertCount + visibleBlocks.expandedInsertCount,
		skippedInsertCount: expandedInserts.skippedInsertCount + visibleBlocks.skippedInsertCount,
		visibleBlockDefinitionCount: visibleBlocks.visibleBlockDefinitionCount,
		segments: filtered.segments,
		blocks,
		topLevelInserts,
	};
}

/**
 * 读取 DXF group code/value 对；LibreDWG 生成的 CRCRLF 会产生空行，这里统一跳过。
 * @param content 定义 DXF 原始文本。
 */
function readDxfGroups(content: string): IDxfGroup[] {
	const lines = content
		.split(/\r\n|\n|\r/g)
		.map((line) => line.trimEnd());
	const groups: IDxfGroup[] = [];

	for (let i = 0; i < lines.length - 1; i += 2) {
		const code = Number.parseInt(lines[i].trim(), 10);
		if (!Number.isFinite(code)) {
			continue;
		}

		groups.push({
			code,
			value: lines[i + 1].trim(),
		});
	}

	return groups;
}

/**
 * 从 SECTION 标记后读取当前 section 名称。
 * @param groups 定义 DXF group 集合。
 * @param startIndex 定义 SECTION 后的起始索引。
 */
function readSectionName(groups: IDxfGroup[], startIndex: number): string | null {
	for (let i = startIndex; i < Math.min(groups.length, startIndex + 4); i++) {
		if (groups[i].code === 2) {
			return groups[i].value;
		}
	}

	return null;
}

/**
 * 收集普通 DXF 实体的 group 数据直到下一个实体标记。
 * @param groups 定义 DXF group 集合。
 * @param startIndex 定义实体内容起始索引。
 */
function collectDxfEntityGroups(groups: IDxfGroup[], startIndex: number): { groups: IDxfGroup[]; nextIndex: number } {
	const entityGroups: IDxfGroup[] = [];
	let index = startIndex;
	for (; index < groups.length; index++) {
		if (groups[index].code === 0) {
			break;
		}

		entityGroups.push(groups[index]);
	}

	return { groups: entityGroups, nextIndex: index };
}

/**
 * 解析 BLOCKS section 中的块定义；块定义本身不可见，需要由 INSERT 引用展开后才绘制。
 * @param groups 定义 DXF group 集合。
 * @param startIndex 定义 BLOCK 标记位置。
 * @param entityCounts 定义全局实体计数器。
 */
function parseDxfBlockDefinition(
	groups: IDxfGroup[],
	startIndex: number,
	entityCounts: Record<string, number>
): { block: IDxfBlockDefinition | null; nextIndex: number } {
	const header = collectDxfEntityGroups(groups, startIndex + 1);
	const blockName = readDxfString(header.groups, 2) ?? readDxfString(header.groups, 3);
	const basePoint = readDxfPoint(header.groups, 10, 20, 30);
	const block: IDxfBlockDefinition | null = blockName
		? {
				name: blockName,
				basePoint: basePoint ? toVector3(basePoint) : Vector3.Zero(),
				segments: [],
				inserts: [],
			}
		: null;

	let index = header.nextIndex;
	for (; index < groups.length; index++) {
		const group = groups[index];
		if (group.code !== 0) {
			continue;
		}

		if (group.value === "ENDBLK") {
			const endBlock = collectDxfEntityGroups(groups, index + 1);
			return { block, nextIndex: endBlock.nextIndex };
		}

		const parsedEntity = parseDxfDrawableEntity(groups, index);
		if (parsedEntity.type) {
			entityCounts[parsedEntity.type] = (entityCounts[parsedEntity.type] ?? 0) + 1;
		}
		block?.segments.push(...parsedEntity.segments);
		block?.inserts.push(...parsedEntity.inserts);
		index = parsedEntity.nextIndex - 1;
	}

	return { block, nextIndex: index };
}

/**
 * 解析可显示 DXF 实体，INSERT 会先保存为块引用，稍后递归展开。
 * @param groups 定义 DXF group 集合。
 * @param startIndex 定义实体标记位置。
 */
function parseDxfDrawableEntity(groups: IDxfGroup[], startIndex: number): { type: string | null; segments: IDxfLineSegment[]; inserts: IDxfInsertReference[]; nextIndex: number; skipped: boolean } {
	const type = groups[startIndex]?.value ?? null;
	if (!type) {
		return { type: null, segments: [], inserts: [], nextIndex: startIndex + 1, skipped: true };
	}

	if (type === "POLYLINE") {
		const parsedPolyline = parseDxfPolylineEntity(groups, startIndex);
		return {
			type,
			segments: parsedPolyline.segments,
			inserts: [],
			nextIndex: parsedPolyline.nextIndex,
			skipped: !parsedPolyline.segments.length,
		};
	}

	const entity = collectDxfEntityGroups(groups, startIndex + 1);
	if (!DXF_SUPPORTED_ENTITY_TYPES.has(type)) {
		return { type, segments: [], inserts: [], nextIndex: entity.nextIndex, skipped: false };
	}

	if (type === "INSERT") {
		const insert = parseDxfInsert(entity.groups);
		return {
			type,
			segments: [],
			inserts: insert ? [insert] : [],
			nextIndex: entity.nextIndex,
			skipped: !insert,
		};
	}

	const entitySegments = parseDxfEntity(type, entity.groups);
	return {
		type,
		segments: entitySegments,
		inserts: [],
		nextIndex: entity.nextIndex,
		skipped: !entitySegments.length,
	};
}

/**
 * 按实体类型解析为线段。
 * @param type 定义 DXF 实体类型。
 * @param groups 定义当前实体的 group 数据。
 */
function parseDxfEntity(type: string, groups: IDxfGroup[]): IDxfLineSegment[] {
	switch (type) {
		case "LINE":
			return parseDxfLine(groups);
		case "LWPOLYLINE":
			return parseDxfPointSegments(readDxfRepeatedPoints(groups), isClosedDxfPolyline(groups), readDxfColor(groups));
		case "CIRCLE":
			return parseDxfCircle(groups);
		case "ARC":
			return parseDxfArc(groups);
		case "SPLINE":
			return parseDxfPointSegments(readDxfRepeatedPoints(groups), false, readDxfColor(groups));
		case "ELLIPSE":
			return parseDxfEllipse(groups);
		default:
			return [];
	}
}

/**
 * 解析 DXF LINE 实体。
 * @param groups 定义当前实体的 group 数据。
 */
function parseDxfLine(groups: IDxfGroup[]): IDxfLineSegment[] {
	const start = readDxfPoint(groups, 10, 20, 30);
	const end = readDxfPoint(groups, 11, 21, 31);
	if (!start || !end) {
		return [];
	}

	return [createDxfLineSegment(readDxfColor(groups), [toVector3(start), toVector3(end)])];
}

/**
 * 解析 DXF POLYLINE/VERTEX 实体序列。
 * @param groups 定义完整 DXF group 集合。
 * @param startIndex 定义 POLYLINE 标记位置。
 */
function parseDxfPolylineEntity(groups: IDxfGroup[], startIndex: number): { segments: IDxfLineSegment[]; nextIndex: number } {
	const header = collectDxfEntityGroups(groups, startIndex + 1);
	const points: IDxfPoint2[] = [];
	const color = readDxfColor(header.groups);
	let index = header.nextIndex;
	let closed = isClosedDxfPolyline(header.groups);

	for (; index < groups.length; index++) {
		const group = groups[index];
		if (group.code !== 0) {
			continue;
		}

		if (group.value === "SEQEND") {
			const sequenceEnd = collectDxfEntityGroups(groups, index + 1);
			return {
				segments: parseDxfPointSegments(points, closed, color),
				nextIndex: sequenceEnd.nextIndex,
			};
		}

		if (group.value !== "VERTEX") {
			continue;
		}

		const vertex = collectDxfEntityGroups(groups, index + 1);
		const point = readDxfPoint(vertex.groups, 10, 20, 30);
		if (point) {
			points.push(point);
		}

		index = vertex.nextIndex - 1;
	}

	return {
		segments: parseDxfPointSegments(points, closed, color),
		nextIndex: index,
	};
}

/**
 * 解析 DXF CIRCLE 实体。
 * @param groups 定义当前实体的 group 数据。
 */
function parseDxfCircle(groups: IDxfGroup[]): IDxfLineSegment[] {
	const center = readDxfPoint(groups, 10, 20, 30);
	const radius = readDxfNumber(groups, 40);
	if (!center || !radius || radius <= 0 || !isDxfRenderableDistance(radius)) {
		return [];
	}

	return [createDxfLineSegment(readDxfColor(groups), createDxfArcPoints(center, radius, 0, Math.PI * 2, 64))];
}

/**
 * 解析 DXF ARC 实体。
 * @param groups 定义当前实体的 group 数据。
 */
function parseDxfArc(groups: IDxfGroup[]): IDxfLineSegment[] {
	const center = readDxfPoint(groups, 10, 20, 30);
	const radius = readDxfNumber(groups, 40);
	const startAngle = degreesToRadians(readDxfNumber(groups, 50) ?? 0);
	let endAngle = degreesToRadians(readDxfNumber(groups, 51) ?? 0);
	if (!center || !radius || radius <= 0 || !isDxfRenderableDistance(radius)) {
		return [];
	}

	const normalizedEndAngle = normalizeDxfEndAngle(startAngle, endAngle);
	if (normalizedEndAngle === null) {
		return [];
	}
	endAngle = normalizedEndAngle;

	return [createDxfLineSegment(readDxfColor(groups), createDxfArcPoints(center, radius, startAngle, endAngle, getDxfArcSegmentCount(radius, endAngle - startAngle)))];
}

/**
 * 解析 DXF ELLIPSE 实体。
 * @param groups 定义当前实体的 group 数据。
 */
function parseDxfEllipse(groups: IDxfGroup[]): IDxfLineSegment[] {
	const center = readDxfPoint(groups, 10, 20, 30);
	const major = readDxfPoint(groups, 11, 21, 31);
	const ratio = readDxfNumber(groups, 40) ?? 1;
	const start = readDxfNumber(groups, 41) ?? 0;
	let end = readDxfNumber(groups, 42) ?? Math.PI * 2;
	if (!center || !major || ratio <= 0 || !Number.isFinite(ratio) || ratio > 1000) {
		return [];
	}

	const normalizedEnd = normalizeDxfEndAngle(start, end);
	if (normalizedEnd === null) {
		return [];
	}
	end = normalizedEnd;

	const majorVector = new Vector3(major.x, major.y, major.z);
	const minorVector = new Vector3(-major.y * ratio, major.x * ratio, major.z * ratio);
	const majorLength = majorVector.length();
	const minorLength = minorVector.length();
	if (!isDxfRenderableDistance(majorLength) || !isDxfRenderableDistance(minorLength) || majorLength <= 0) {
		return [];
	}

	const segmentCount = getDxfArcSegmentCount(majorLength, end - start);
	const points: Vector3[] = [];

	for (let i = 0; i <= segmentCount; i++) {
		const t = start + ((end - start) * i) / segmentCount;
		points.push(new Vector3(center.x + majorVector.x * Math.cos(t) + minorVector.x * Math.sin(t), center.y + majorVector.y * Math.cos(t) + minorVector.y * Math.sin(t), center.z));
	}

	return [createDxfLineSegment(readDxfColor(groups), points)];
}

/**
 * 读取重复出现的 10/20/30 坐标组。
 * @param groups 定义当前实体的 group 数据。
 */
function readDxfRepeatedPoints(groups: IDxfGroup[]): IDxfPoint2[] {
	const points: IDxfPoint2[] = [];
	let point: Partial<IDxfPoint2> | null = null;

	groups.forEach((group) => {
		if (group.code === 10) {
			pushDxfRepeatedPoint(points, point);
			const x = parseDxfNumber(group.value);
			point = x !== null && isDxfRenderableCoordinate(x) ? { x, z: 0 } : null;
		} else if (point && group.code === 20) {
			const y = parseDxfNumber(group.value);
			point = y !== null && isDxfRenderableCoordinate(y) ? { ...point, y } : null;
		} else if (point && group.code === 30) {
			const z = parseDxfNumber(group.value);
			point = z !== null && isDxfRenderableCoordinate(z) ? { ...point, z } : null;
		} else if (point && group.code === 42) {
			const bulge = parseDxfNumber(group.value);
			point = bulge !== null && Number.isFinite(bulge) ? { ...point, bulge } : point;
		}
	});

	pushDxfRepeatedPoint(points, point);

	return points;
}

/**
 * 将点列表转换为线段集合。
 * @param points 定义实体点序列。
 * @param closed 定义是否闭合最后一段。
 * @param color 定义 AutoCAD ACI 颜色索引。
 */
function parseDxfPointSegments(points: IDxfPoint2[], closed: boolean, color: number): IDxfLineSegment[] {
	const segments: IDxfLineSegment[] = [];
	const count = closed ? points.length : points.length - 1;
	for (let i = 0; i < count; i++) {
		const start = points[i];
		const end = points[(i + 1) % points.length];
		if (!start || !end) {
			continue;
		}

		const bulge = start.bulge ?? 0;
		if (Math.abs(bulge) > DXF_MIN_BULGE) {
			const arcPoints = createDxfBulgeArcPoints(start, end, bulge);
			if (arcPoints.length > 1) {
				segments.push(createDxfLineSegment(color, arcPoints));
			}
		} else {
			segments.push(createDxfLineSegment(color, [toVector3(start), toVector3(end)]));
		}
	}

	return segments;
}

/**
 * 读取指定坐标 group code 的点。
 * @param groups 定义当前实体的 group 数据。
 * @param xCode 定义 X 坐标 group code。
 * @param yCode 定义 Y 坐标 group code。
 * @param zCode 定义 Z 坐标 group code。
 */
function readDxfPoint(groups: IDxfGroup[], xCode: number, yCode: number, zCode: number): IDxfPoint2 | null {
	const x = readDxfNumber(groups, xCode);
	const y = readDxfNumber(groups, yCode);
	const z = readDxfNumber(groups, zCode) ?? 0;
	return x === null || y === null || !isDxfRenderableCoordinate(x) || !isDxfRenderableCoordinate(y) || !isDxfRenderableCoordinate(z) ? null : { x, y, z };
}

/**
 * 读取第一个匹配 group code 的数值。
 * @param groups 定义当前实体的 group 数据。
 * @param code 定义需要查找的 group code。
 */
function readDxfNumber(groups: IDxfGroup[], code: number): number | null {
	const group = groups.find((item) => item.code === code);
	return group ? parseDxfNumber(group.value) : null;
}

/**
 * 读取第一个匹配 group code 的字符串。
 * @param groups 定义当前实体的 group 数据。
 * @param code 定义需要查找的 group code。
 */
function readDxfString(groups: IDxfGroup[], code: number): string | null {
	const group = groups.find((item) => item.code === code);
	return group?.value || null;
}

/**
 * 解析 DXF 数字字符串。
 * @param value 定义待解析文本。
 */
function parseDxfNumber(value: string): number | null {
	const number = Number.parseFloat(value);
	return Number.isFinite(number) ? number : null;
}

/**
 * 解析 INSERT 块引用参数，后续按块定义递归展开成真实线段。
 * @param groups 定义 INSERT 实体的 group 数据。
 */
function parseDxfInsert(groups: IDxfGroup[]): IDxfInsertReference | null {
	const blockName = readDxfString(groups, 2);
	const position = readDxfPoint(groups, 10, 20, 30);
	if (!blockName || !position) {
		return null;
	}

	const scaleX = readDxfNumber(groups, 41) ?? 1;
	const scaleY = readDxfNumber(groups, 42) ?? 1;
	const scaleZ = readDxfNumber(groups, 43) ?? 1;
	const columns = Math.max(1, Math.floor(readDxfNumber(groups, 70) ?? 1));
	const rows = Math.max(1, Math.floor(readDxfNumber(groups, 71) ?? 1));
	const columnSpacing = readDxfNumber(groups, 44) ?? 0;
	const rowSpacing = readDxfNumber(groups, 45) ?? 0;
	const rotationRadians = degreesToRadians(readDxfNumber(groups, 50) ?? 0);

	if (![scaleX, scaleY, scaleZ, columnSpacing, rowSpacing, rotationRadians].every(Number.isFinite)) {
		return null;
	}

	return {
		blockName,
		position: toVector3(position),
		scale: new Vector3(scaleX, scaleY, scaleZ),
		rotationRadians,
		columns,
		rows,
		columnSpacing,
		rowSpacing,
	};
}

/**
 * 将角度转换为弧度。
 * @param degrees 定义角度值。
 */
function degreesToRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * 判断 DXF 多段线是否闭合。
 * @param groups 定义当前实体的 group 数据。
 */
function isClosedDxfPolyline(groups: IDxfGroup[]): boolean {
	const flags = readDxfNumber(groups, 70) ?? 0;
	return (flags & 1) === 1;
}

/**
 * 读取实体颜色，未设置或随层颜色时使用默认浅色。
 * @param groups 定义当前实体的 group 数据。
 */
function readDxfColor(groups: IDxfGroup[]): number {
	const color = readDxfNumber(groups, 62);
	return color && color > 0 ? color : DXF_DEFAULT_COLOR_INDEX;
}

/**
 * 创建带颜色的线段。
 * @param color 定义 AutoCAD ACI 颜色索引。
 * @param points 定义折线点。
 */
function createDxfLineSegment(color: number, points: Vector3[]): IDxfLineSegment {
	return { color, points };
}

/**
 * 将 DXF 点转换为 Babylon Vector3，保持 XY 平面，后续由 CAD 放置逻辑旋转到 XZ 地面。
 * @param point 定义 DXF 点。
 */
function toVector3(point: IDxfPoint2): Vector3 {
	return new Vector3(point.x, point.y, point.z);
}

/**
 * 创建圆弧采样点。
 * @param center 定义圆心。
 * @param radius 定义半径。
 * @param startAngle 定义起始弧度。
 * @param endAngle 定义结束弧度。
 * @param segmentCount 定义采样段数。
 */
function createDxfArcPoints(center: IDxfPoint2, radius: number, startAngle: number, endAngle: number, segmentCount: number): Vector3[] {
	if (!isDxfRenderablePoint(center) || !isDxfRenderableDistance(radius) || !Number.isFinite(startAngle) || !Number.isFinite(endAngle) || !Number.isFinite(segmentCount) || segmentCount <= 0) {
		return [];
	}

	const points: Vector3[] = [];
	for (let i = 0; i <= segmentCount; i++) {
		const angle = startAngle + ((endAngle - startAngle) * i) / segmentCount;
		points.push(new Vector3(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle), center.z));
	}

	return points;
}

/**
 * 根据多段线 bulge 值创建圆弧采样点。
 * @param start 定义起点。
 * @param end 定义终点。
 * @param bulge 定义 DXF bulge 值。
 */
function createDxfBulgeArcPoints(start: IDxfPoint2, end: IDxfPoint2, bulge: number): Vector3[] {
	if (!isDxfRenderablePoint(start) || !isDxfRenderablePoint(end) || !Number.isFinite(bulge)) {
		return [];
	}

	const startVector = toVector3(start);
	const endVector = toVector3(end);
	const chord = endVector.subtract(startVector);
	const chordLength = Math.hypot(chord.x, chord.y);
	if (chordLength <= 0 || !isDxfRenderableDistance(chordLength)) {
		return [];
	}

	const theta = 4 * Math.atan(bulge);
	if (!Number.isFinite(theta) || Math.abs(theta) <= DXF_MIN_BULGE) {
		return [];
	}

	const halfThetaTangent = Math.tan(theta / 2);
	if (!Number.isFinite(halfThetaTangent) || Math.abs(halfThetaTangent) <= Number.EPSILON) {
		return [];
	}

	const distanceToCenter = chordLength / (2 * halfThetaTangent);
	const midpoint = startVector.add(endVector).scaleInPlace(0.5);
	const perpendicular = new Vector3(-chord.y / chordLength, chord.x / chordLength, 0);
	const center = midpoint.add(perpendicular.scale(distanceToCenter));
	const radius = center.subtract(startVector).length();
	if (!isDxfRenderableVector(center) || !isDxfRenderableDistance(radius) || radius <= 0) {
		return [];
	}

	const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
	const segmentCount = getDxfArcSegmentCount(radius, Math.abs(theta));
	const points: Vector3[] = [];

	for (let i = 0; i <= segmentCount; i++) {
		const angle = startAngle + (theta * i) / segmentCount;
		points.push(new Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, start.z));
	}

	return points;
}

/**
 * 根据半径和角度估算圆弧采样段数，避免小圆过密或大圆过粗。
 * @param radius 定义圆弧半径。
 * @param angle 定义圆弧角度。
 */
function getDxfArcSegmentCount(radius: number, angle: number): number {
	if (!Number.isFinite(radius) || !Number.isFinite(angle)) {
		return 8;
	}

	const byAngle = Math.ceil(Math.abs(angle) / (Math.PI / 16));
	const byRadius = Math.ceil(Math.sqrt(Math.max(radius, 1)) / 4);
	return Math.min(96, Math.max(8, byAngle, byRadius));
}

/**
 * 根据颜色分组创建 Babylon LineSystem 网格，避免单个网格过大导致编辑器卡顿。
 * @param scene 定义目标场景。
 * @param root 定义 CAD 根节点。
 * @param segments 定义解析得到的线段。
 */
function createCadDxfLineMeshes(scene: Scene, root: TransformNode, segments: IDxfLineSegment[]): LinesMesh[] {
	const meshes: LinesMesh[] = [];
	const groupedLines = new Map<number, Vector3[][]>();

	segments.forEach((segment) => {
		if (!isDxfLineSegmentRenderable(segment)) {
			return;
		}

		const lines = groupedLines.get(segment.color) ?? [];
		lines.push(segment.points);
		groupedLines.set(segment.color, lines);
	});

	groupedLines.forEach((lines, color) => {
		for (let i = 0; i < lines.length; i += DXF_VECTOR_MESH_LINE_LIMIT) {
			const chunk = lines.slice(i, i + DXF_VECTOR_MESH_LINE_LIMIT);
			const mesh = MeshBuilder.CreateLineSystem(`${root.name}_${color}_${Math.floor(i / DXF_VECTOR_MESH_LINE_LIMIT)}`, { lines: chunk }, scene);
			mesh.parent = root;
			mesh.color = getDxfAciColor(color);
			mesh.isPickable = true;
			mesh.metadata = {
				cadDxfVectorLineMesh: true,
				color,
				lineCount: chunk.length,
			};
			meshes.push(mesh);
		}
	});

	return meshes;
}

/**
 * 提交一个重复坐标点，只有 X/Y 坐标完整且在可渲染范围内才保留。
 * @param points 定义输出点集合。
 * @param point 定义正在收集的临时点。
 */
function pushDxfRepeatedPoint(points: IDxfPoint2[], point: Partial<IDxfPoint2> | null): void {
	if (point?.x === undefined || point.y === undefined) {
		return;
	}

	const completePoint = { x: point.x, y: point.y, z: point.z ?? 0, bulge: point.bulge };
	if (isDxfRenderablePoint(completePoint)) {
		points.push(completePoint);
	}
}

/**
 * 过滤 DXF 解析出的异常线段，避免转换器输出的极端坐标污染 Babylon 包围盒。
 * @param segments 定义原始线段集合。
 */
function filterRenderableDxfLineSegments(segments: IDxfLineSegment[]): { segments: IDxfLineSegment[]; skippedLineSegmentCount: number } {
	const filteredSegments = segments.filter(isDxfLineSegmentRenderable);
	return {
		segments: filteredSegments,
		skippedLineSegmentCount: segments.length - filteredSegments.length,
	};
}

/**
 * 将顶层 INSERT 引用展开成真实世界坐标线段，支持嵌套块和矩形阵列。
 * @param inserts 定义顶层块引用集合。
 * @param blocks 定义已经解析出的块定义。
 */
function expandDxfInsertReferences(
	inserts: IDxfInsertReference[],
	blocks: Map<string, IDxfBlockDefinition>
): { segments: IDxfLineSegment[]; expandedInsertCount: number; skippedInsertCount: number } {
	const result = {
		segments: [] as IDxfLineSegment[],
		expandedInsertCount: 0,
		skippedInsertCount: 0,
	};

	inserts.forEach((insert) => {
		expandDxfInsertReference(insert, blocks, DXF_IDENTITY_TRANSFORM_2D, [], 0, result);
	});

	return result;
}

/**
 * 兼容部分 DWG 转换器把模型空间内容写成孤立块定义、ENTITIES 只剩 HATCH 的 DXF 输出。
 * @param blocks 定义已经解析出的块定义。
 * @param topLevelInserts 定义顶层 INSERT 引用，用于排除常规引用块。
 */
function expandVisibleDxfBlockDefinitions(
	blocks: Map<string, IDxfBlockDefinition>,
	topLevelInserts: IDxfInsertReference[]
): { segments: IDxfLineSegment[]; expandedInsertCount: number; skippedInsertCount: number; visibleBlockDefinitionCount: number } {
	const referencedBlockNames = getReferencedDxfBlockNames(blocks, topLevelInserts);
	const result = {
		segments: [] as IDxfLineSegment[],
		expandedInsertCount: 0,
		skippedInsertCount: 0,
		visibleBlockDefinitionCount: 0,
	};

	blocks.forEach((block) => {
		if (!isVisibleDxfBlockDefinitionCandidate(block, referencedBlockNames)) {
			return;
		}

		result.visibleBlockDefinitionCount++;
		result.segments.push(...block.segments);
		block.inserts.forEach((insert) => {
			expandDxfInsertReference(insert, blocks, DXF_IDENTITY_TRANSFORM_2D, [block.name], 1, result);
		});
	});

	return result;
}

/**
 * 收集所有被 INSERT 使用的块名，未被引用的块才可能是转换器导出的可见根块。
 * @param blocks 定义块定义表。
 * @param topLevelInserts 定义顶层块引用集合。
 */
function getReferencedDxfBlockNames(blocks: Map<string, IDxfBlockDefinition>, topLevelInserts: IDxfInsertReference[]): Set<string> {
	const referenced = new Set<string>();
	topLevelInserts.forEach((insert) => referenced.add(insert.blockName));
	blocks.forEach((block) => {
		block.inserts.forEach((insert) => referenced.add(insert.blockName));
	});
	return referenced;
}

/**
 * 判断孤立块定义是否适合作为可见模型空间内容渲染。
 * @param block 定义候选块。
 * @param referencedBlockNames 定义已经被其他 INSERT 引用的块名集合。
 */
function isVisibleDxfBlockDefinitionCandidate(block: IDxfBlockDefinition, referencedBlockNames: Set<string>): boolean {
	if (referencedBlockNames.has(block.name)) {
		return false;
	}

	const normalizedName = block.name.toLowerCase();
	if (normalizedName === "*model_space" || normalizedName === "*paper_space" || normalizedName.startsWith("*paper_space")) {
		return false;
	}

	return Boolean(block.segments.length || block.inserts.length);
}

/**
 * 递归展开单个 INSERT，遇到缺失块、循环引用或过大阵列时跳过并计数。
 * @param insert 定义当前块引用。
 * @param blocks 定义块定义表。
 * @param parentTransform 定义父级块坐标到世界坐标的二维变换。
 * @param stack 定义递归块名栈，用于检测循环引用。
 * @param depth 定义当前递归深度。
 * @param result 定义累计输出。
 */
function expandDxfInsertReference(
	insert: IDxfInsertReference,
	blocks: Map<string, IDxfBlockDefinition>,
	parentTransform: IDxfTransform2D,
	stack: string[],
	depth: number,
	result: { segments: IDxfLineSegment[]; expandedInsertCount: number; skippedInsertCount: number }
): void {
	const block = blocks.get(insert.blockName);
	if (!block || depth > DXF_INSERT_RECURSION_LIMIT || stack.includes(insert.blockName)) {
		result.skippedInsertCount++;
		return;
	}

	const instanceCount = insert.columns * insert.rows;
	if (!Number.isFinite(instanceCount) || instanceCount > DXF_INSERT_ARRAY_INSTANCE_LIMIT) {
		result.skippedInsertCount++;
		return;
	}

	for (let column = 0; column < insert.columns; column++) {
		for (let row = 0; row < insert.rows; row++) {
			const localTransform = createDxfInsertTransform(insert, block.basePoint, column, row);
			const transform = multiplyDxfTransform2D(parentTransform, localTransform);
			result.expandedInsertCount++;
			block.segments.forEach((segment) => result.segments.push(transformDxfLineSegment(segment, transform)));
			block.inserts.forEach((childInsert) => {
				expandDxfInsertReference(childInsert, blocks, transform, [...stack, insert.blockName], depth + 1, result);
			});
		}
	}
}

/**
 * 创建 INSERT 到父坐标系的二维仿射变换，包含块基点、缩放、旋转和阵列偏移。
 * @param insert 定义块引用。
 * @param blockBasePoint 定义被引用块的基点。
 * @param column 定义当前阵列列号。
 * @param row 定义当前阵列行号。
 */
function createDxfInsertTransform(insert: IDxfInsertReference, blockBasePoint: Vector3, column: number, row: number): IDxfTransform2D {
	const offsetX = column * insert.columnSpacing;
	const offsetY = row * insert.rowSpacing;
	const cos = Math.cos(insert.rotationRadians);
	const sin = Math.sin(insert.rotationRadians);
	const a = cos * insert.scale.x;
	const b = sin * insert.scale.x;
	const c = -sin * insert.scale.y;
	const d = cos * insert.scale.y;

	return {
		a,
		b,
		c,
		d,
		tx: insert.position.x + a * (offsetX - blockBasePoint.x) + c * (offsetY - blockBasePoint.y),
		ty: insert.position.y + b * (offsetX - blockBasePoint.x) + d * (offsetY - blockBasePoint.y),
	};
}

/**
 * 组合两个二维仿射变换，返回先应用 right 再应用 left 的结果。
 * @param left 定义父级变换。
 * @param right 定义子级变换。
 */
function multiplyDxfTransform2D(left: IDxfTransform2D, right: IDxfTransform2D): IDxfTransform2D {
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
 * 将块内线段通过二维仿射矩阵转换到最终图纸坐标。
 * @param segment 定义块内原始线段。
 * @param transform 定义坐标变换。
 */
function transformDxfLineSegment(segment: IDxfLineSegment, transform: IDxfTransform2D): IDxfLineSegment {
	return {
		color: segment.color,
		points: segment.points.map((point) => transformDxfPoint(point, transform)),
	};
}

/**
 * 对 DXF 点应用二维仿射矩阵，Z 坐标保留用于异常过滤。
 * @param point 定义原始点。
 * @param transform 定义坐标变换。
 */
function transformDxfPoint(point: Vector3, transform: IDxfTransform2D): Vector3 {
	return new Vector3(transform.a * point.x + transform.c * point.y + transform.tx, transform.b * point.x + transform.d * point.y + transform.ty, point.z);
}

/**
 * 计算所有可渲染 DXF 线段的二维包围盒。
 * @param segments 定义可渲染线段集合。
 */
function getDxfVectorBounds(segments: IDxfLineSegment[]): IDxfVectorBounds | null {
	let minimum: Vector3 | null = null;
	let maximum: Vector3 | null = null;

	for (const segment of segments) {
		for (const point of segment.points) {
			minimum = minimum ? Vector3.Minimize(minimum, point) : point.clone();
			maximum = maximum ? Vector3.Maximize(maximum, point) : point.clone();
		}
	}

	if (!minimum || !maximum) {
		return null;
	}

	const boundsMinimum = minimum as Vector3;
	const boundsMaximum = maximum as Vector3;
	const size = boundsMaximum.subtract(boundsMinimum);
	return isDxfRenderableVector(size)
		? {
				minimum: boundsMinimum,
				maximum: boundsMaximum,
				size,
			}
		: null;
}

/**
 * 为地面参照图计算更适合观看的渲染边界，少量远端块定义不会拉空整张图。
 * @param segments 定义可渲染线段集合。
 * @param sourceBounds 定义原始完整包围盒。
 */
function getDxfReferenceRenderBounds(segments: IDxfLineSegment[], sourceBounds: IDxfVectorBounds): IDxfVectorBounds {
	const robustBounds = getDxfRobustVectorBounds(segments);
	if (!robustBounds) {
		return sourceBounds;
	}

	const sourceArea = sourceBounds.size.x * sourceBounds.size.y;
	const robustArea = robustBounds.size.x * robustBounds.size.y;
	if (!Number.isFinite(sourceArea) || !Number.isFinite(robustArea) || robustArea <= 0 || sourceArea / robustArea < DXF_REFERENCE_BOUNDS_MIN_AREA_RATIO) {
		return sourceBounds;
	}

	const expandedBounds = expandDxfBounds(robustBounds, DXF_REFERENCE_BOUNDS_EXPAND_RATIO);
	return expandedBounds.size.x > 0 && expandedBounds.size.y > 0 ? expandedBounds : sourceBounds;
}

/**
 * 基于点坐标分位数计算鲁棒包围盒，用于过滤极少数远端异常参照元素。
 * @param segments 定义可渲染线段集合。
 */
function getDxfRobustVectorBounds(segments: IDxfLineSegment[]): IDxfVectorBounds | null {
	const xs: number[] = [];
	const ys: number[] = [];

	segments.forEach((segment) => {
		segment.points.forEach((point) => {
			xs.push(point.x);
			ys.push(point.y);
		});
	});

	if (xs.length < 20 || ys.length < 20) {
		return null;
	}

	xs.sort((a, b) => a - b);
	ys.sort((a, b) => a - b);

	const minX = readSortedQuantile(xs, DXF_REFERENCE_BOUNDS_TRIM_RATIO);
	const maxX = readSortedQuantile(xs, 1 - DXF_REFERENCE_BOUNDS_TRIM_RATIO);
	const minY = readSortedQuantile(ys, DXF_REFERENCE_BOUNDS_TRIM_RATIO);
	const maxY = readSortedQuantile(ys, 1 - DXF_REFERENCE_BOUNDS_TRIM_RATIO);
	if (minX === null || maxX === null || minY === null || maxY === null || maxX <= minX || maxY <= minY) {
		return null;
	}

	const minimum = new Vector3(minX, minY, 0);
	const maximum = new Vector3(maxX, maxY, 0);
	return {
		minimum,
		maximum,
		size: maximum.subtract(minimum),
	};
}

/**
 * 读取已排序数组的分位数。
 * @param values 定义已升序排序的数字数组。
 * @param ratio 定义 0 到 1 的分位比例。
 */
function readSortedQuantile(values: number[], ratio: number): number | null {
	if (!values.length) {
		return null;
	}

	const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * ratio)));
	const value = values[index];
	return Number.isFinite(value) ? value : null;
}

/**
 * 按比例扩展包围盒，避免鲁棒裁剪贴住图纸边线。
 * @param bounds 定义原始包围盒。
 * @param ratio 定义扩展比例。
 */
function expandDxfBounds(bounds: IDxfVectorBounds, ratio: number): IDxfVectorBounds {
	const paddingX = bounds.size.x * ratio;
	const paddingY = bounds.size.y * ratio;
	const minimum = new Vector3(bounds.minimum.x - paddingX, bounds.minimum.y - paddingY, 0);
	const maximum = new Vector3(bounds.maximum.x + paddingX, bounds.maximum.y + paddingY, 0);
	return {
		minimum,
		maximum,
		size: maximum.subtract(minimum),
	};
}

/**
 * 判断整条线段是否落在参照图渲染边界内。
 * @param segment 定义待检查线段。
 * @param bounds 定义参照图渲染边界。
 */
function isDxfSegmentInsideBounds(segment: IDxfLineSegment, bounds: IDxfVectorBounds): boolean {
	return segment.points.every((point) => point.x >= bounds.minimum.x && point.x <= bounds.maximum.x && point.y >= bounds.minimum.y && point.y <= bounds.maximum.y);
}

/**
 * 根据 CAD 真实长宽计算参照图片像素尺寸，图片分辨率独立于 1:1 世界尺寸。
 * @param widthMeters 定义 CAD 图纸宽度。
 * @param heightMeters 定义 CAD 图纸高度。
 * @param maxSize 定义图片最大边像素。
 * @param minSize 定义图片最小边像素。
 */
function getCadDxfReferenceImageSize(
	widthMeters: number,
	heightMeters: number,
	maxSize: number = DXF_REFERENCE_IMAGE_MAX_SIZE,
	minSize: number = DXF_REFERENCE_IMAGE_MIN_SIZE
): { width: number; height: number } {
	const aspect = widthMeters / heightMeters;
	if (aspect >= 1) {
		return {
			width: maxSize,
			height: Math.max(minSize, Math.round(maxSize / aspect)),
		};
	}

	return {
		width: Math.max(minSize, Math.round(maxSize * aspect)),
		height: maxSize,
	};
}

/**
 * 将 DXF 线段绘制到 PNG 像素缓冲，使用透明纸底和深色/图层色线条。
 * @param segments 定义可渲染线段集合。
 * @param bounds 定义 CAD 图纸包围盒。
 * @param width 定义输出图片像素宽度。
 * @param height 定义输出图片像素高度。
 */
function rasterizeDxfSegmentsToPng(segments: IDxfLineSegment[], bounds: IDxfVectorBounds, width: number, height: number): PNG {
	const png = new PNG({ width, height });
	fillPng(png, DXF_REFERENCE_IMAGE_BACKGROUND_RGBA);

	const scaleX = width > 1 ? (width - 1) / bounds.size.x : 1;
	const scaleY = height > 1 ? (height - 1) / bounds.size.y : 1;
	const thickness = Math.max(3, Math.min(6, Math.round(Math.max(width, height) / 1024)));

	segments.forEach((segment) => {
		const color = getDxfAciRgbaColor(segment.color);
		for (let i = 1; i < segment.points.length; i++) {
			const start = segment.points[i - 1];
			const end = segment.points[i];
			drawPngLine(
				png,
				Math.round((start.x - bounds.minimum.x) * scaleX),
				Math.round(height - 1 - (start.y - bounds.minimum.y) * scaleY),
				Math.round((end.x - bounds.minimum.x) * scaleX),
				Math.round(height - 1 - (end.y - bounds.minimum.y) * scaleY),
				color,
				thickness
			);
		}
	});

	return png;
}

/**
 * 用指定颜色填充整张 PNG。
 * @param png 定义目标 PNG。
 * @param color 定义 RGBA 颜色。
 */
function fillPng(png: PNG, color: [number, number, number, number]): void {
	for (let y = 0; y < png.height; y++) {
		for (let x = 0; x < png.width; x++) {
			writePngPixel(png, x, y, color);
		}
	}
}

/**
 * 使用 Bresenham 算法绘制线段。
 * @param png 定义目标 PNG。
 * @param x0 定义起点 X 像素。
 * @param y0 定义起点 Y 像素。
 * @param x1 定义终点 X 像素。
 * @param y1 定义终点 Y 像素。
 * @param color 定义 RGBA 颜色。
 * @param thickness 定义线宽像素。
 */
function drawPngLine(png: PNG, x0: number, y0: number, x1: number, y1: number, color: [number, number, number, number], thickness: number): void {
	let currentX = x0;
	let currentY = y0;
	const dx = Math.abs(x1 - x0);
	const sx = x0 < x1 ? 1 : -1;
	const dy = -Math.abs(y1 - y0);
	const sy = y0 < y1 ? 1 : -1;
	let error = dx + dy;

	while (true) {
		drawPngThickPixel(png, currentX, currentY, color, thickness);
		if (currentX === x1 && currentY === y1) {
			break;
		}

		const doubledError = error * 2;
		if (doubledError >= dy) {
			error += dy;
			currentX += sx;
		}

		if (doubledError <= dx) {
			error += dx;
			currentY += sy;
		}
	}
}

/**
 * 绘制指定线宽的像素点。
 * @param png 定义目标 PNG。
 * @param x 定义中心 X 像素。
 * @param y 定义中心 Y 像素。
 * @param color 定义 RGBA 颜色。
 * @param thickness 定义线宽像素。
 */
function drawPngThickPixel(png: PNG, x: number, y: number, color: [number, number, number, number], thickness: number): void {
	const radius = Math.floor(thickness / 2);
	for (let yy = y - radius; yy <= y + radius; yy++) {
		for (let xx = x - radius; xx <= x + radius; xx++) {
			writePngPixel(png, xx, yy, color);
		}
	}
}

/**
 * 写入单个 PNG 像素，越界时静默忽略。
 * @param png 定义目标 PNG。
 * @param x 定义 X 像素。
 * @param y 定义 Y 像素。
 * @param color 定义 RGBA 颜色。
 */
function writePngPixel(png: PNG, x: number, y: number, color: [number, number, number, number]): void {
	if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
		return;
	}

	const index = (png.width * y + x) << 2;
	png.data[index] = color[0];
	png.data[index + 1] = color[1];
	png.data[index + 2] = color[2];
	png.data[index + 3] = color[3];
}

/**
 * 将 ACI 颜色转换为适合地面参照图的 RGBA 线条颜色。
 * @param color 定义 ACI 颜色索引。
 */
function getDxfAciRgbaColor(color: number): [number, number, number, number] {
	switch (color) {
		case 1:
			return [210, 32, 32, 235];
		case 2:
			return [180, 135, 0, 235];
		case 3:
			return [36, 150, 50, 235];
		case 4:
			return [20, 145, 180, 235];
		case 5:
			return [50, 82, 205, 235];
		case 6:
			return [170, 48, 170, 235];
		default:
			return [18, 22, 26, 235];
	}
}

/**
 * 判断线段是否适合进入 Babylon LineSystem，保持合法图纸 1:1，仅丢弃异常坏段。
 * @param segment 定义待检查线段。
 */
function isDxfLineSegmentRenderable(segment: IDxfLineSegment): boolean {
	if (segment.points.length < 2 || !segment.points.every(isDxfRenderableVector)) {
		return false;
	}

	for (let i = 1; i < segment.points.length; i++) {
		if (!isDxfRenderableDistance(Vector3.Distance(segment.points[i - 1], segment.points[i]))) {
			return false;
		}
	}

	return true;
}

/**
 * 判断 DXF 点坐标是否在编辑器可渲染范围内。
 * @param point 定义待检查 DXF 点。
 */
function isDxfRenderablePoint(point: IDxfPoint2): boolean {
	return isDxfRenderableCoordinate(point.x) && isDxfRenderableCoordinate(point.y) && isDxfRenderableCoordinate(point.z);
}

/**
 * 判断 Babylon 向量坐标是否在编辑器可渲染范围内。
 * @param point 定义待检查向量。
 */
function isDxfRenderableVector(point: Vector3): boolean {
	return isDxfRenderableCoordinate(point.x) && isDxfRenderableCoordinate(point.y) && isDxfRenderableCoordinate(point.z);
}

/**
 * 判断单个 CAD 坐标是否可渲染；不缩放合法坐标，只拒绝转换器异常值。
 * @param value 定义待检查坐标。
 */
function isDxfRenderableCoordinate(value: number): boolean {
	return Number.isFinite(value) && Math.abs(value) <= DXF_RENDERABLE_COORDINATE_LIMIT;
}

/**
 * 判断派生距离、半径或线段长度是否可渲染。
 * @param value 定义待检查距离。
 */
function isDxfRenderableDistance(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= DXF_RENDERABLE_SEGMENT_LENGTH_LIMIT;
}

/**
 * 将 DXF 起止角归一到一个正向圆周内，避免异常负角度触发大量循环。
 * @param startAngle 定义起始弧度。
 * @param endAngle 定义结束弧度。
 */
function normalizeDxfEndAngle(startAngle: number, endAngle: number): number | null {
	if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
		return null;
	}

	const twoPi = Math.PI * 2;
	let normalizedEndAngle = endAngle;
	if (normalizedEndAngle <= startAngle) {
		normalizedEndAngle += Math.max(1, Math.ceil((startAngle - normalizedEndAngle) / twoPi)) * twoPi;
	}

	const span = normalizedEndAngle - startAngle;
	return Number.isFinite(span) && span > 0 && span <= twoPi * 2 ? normalizedEndAngle : null;
}

/**
 * 将常用 AutoCAD ACI 颜色映射到 Babylon 颜色。
 * @param color 定义 ACI 颜色索引。
 */
function getDxfAciColor(color: number): Color3 {
	switch (color) {
		case 1:
			return new Color3(1, 0.2, 0.2);
		case 2:
			return new Color3(1, 0.9, 0.2);
		case 3:
			return new Color3(0.25, 0.9, 0.25);
		case 4:
			return new Color3(0.2, 0.85, 1);
		case 5:
			return new Color3(0.25, 0.45, 1);
		case 6:
			return new Color3(1, 0.35, 1);
		default:
			return new Color3(0.92, 0.92, 0.88);
	}
}
