import { ipcRenderer, webUtils } from "electron";
import { extname, basename, join } from "path/posix";

import { toast } from "sonner";
import { Component, MouseEvent, ReactNode } from "react";

import { Grid } from "react-loader-spinner";

import { FaCheck } from "react-icons/fa6";
import { IoIosStats } from "react-icons/io";
import { LuGrid3X3, LuMove3D, LuRotate3D, LuRotateCwSquare, LuScale3D, LuSquareDashedMousePointer } from "react-icons/lu";
import { GiArrowCursor, GiTeapot, GiWireframeGlobe } from "react-icons/gi";

import {
	AbstractEngine,
	AbstractMesh,
	Animation,
	Camera,
	TransformNode,
	CubicEase,
	EasingFunction,
	Engine,
	GizmoCoordinatesMode,
	ISceneLoaderAsyncResult,
	Matrix,
	Node,
	Plane,
	Scene,
	Vector2,
	Vector3,
	WebGPUEngine,
	HavokPlugin,
	PickingInfo,
	SceneLoaderFlags,
	EngineView,
	Sprite,
	Color3,
	Color4,
	BoundingBox,
	MeshBuilder,
	SelectionOutlineLayer,
	ClusteredLightContainer,
	Tools,
	_GetAudioEngine,
} from "babylonjs";

import { GridMaterial } from "babylonjs-materials";

import { SpinnerUIComponent } from "../../ui/spinner";

import { Button } from "../../ui/shadcn/ui/button";
import { Toggle } from "../../ui/shadcn/ui/toggle";
import { Switch } from "../../ui/shadcn/ui/switch";
import { Progress } from "../../ui/shadcn/ui/progress";
import { Separator } from "../../ui/shadcn/ui/separator";
import { ToolbarRadioGroup, ToolbarRadioGroupItem } from "../../ui/shadcn/ui/toolbar-radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/shadcn/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/shadcn/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../ui/shadcn/ui/dropdown-menu";

import { Editor } from "../main";

import { isVector3 } from "../../tools/guards/math";
import { isDomTextInputFocused } from "../../tools/dom";
import { isNodeLocked, setNodeVisibleInGraph } from "../../tools/node/metadata";
import { tryGetSafeOpenModeFromLocalStorage } from "../../tools/local-storage";
import { registerUndoRedo } from "../../tools/undoredo";
import { initializeHavok } from "../../tools/physics/init";
import { initializeRecast } from "../../tools/recast/init";
import { isAnyParticleSystem } from "../../tools/guards/particles";
import { saveSceneScreenshot } from "../../tools/scene/screenshot";
import { onTextureAddedObservable } from "../../tools/observables";
import { getCameraFocusPositionFor } from "../../tools/camera/focus";
import { ITweenConfiguration, Tween } from "../../tools/animation/tween";
import { checkProjectCachedCompressedTextures } from "../../tools/assets/ktx";
import { createSceneLink, getRootSceneLink } from "../../tools/scene/scene-link";
import { UniqueNumber, waitNextAnimationFrame, waitUntil } from "../../tools/tools";
import { isSprite, isSpriteManagerNode, isSpriteMapNode } from "../../tools/guards/sprites";
import { defaultGizmoSnapPreferences, IGizmoSnapPreferences, roundGizmoSnapSteps } from "../../tools/scene/gizmo";
import { isAbstractMesh, isAnyTransformNode, isCamera, isCollisionInstancedMesh, isCollisionMesh, isLight, isNode } from "../../tools/guards/nodes";
import { applyModelSidecarToImport, discoverModelSidecar, isSupportedModelSidecarFile, normalizeSidecarPath, prepareExternalModelSidecarPackage } from "../../tools/model-sidecar";

import { EditorCamera } from "../nodes/camera";

import { saveRenderingConfigurationForCamera } from "../rendering/tools";
import { disposeVLSPostProcess, parseVLSPostProcess, vlsPostProcessCameraConfigurations } from "../rendering/vls";
import { disposeTAARenderingPipeline, parseTAARenderingPipeline, taaPipelineCameraConfigurations } from "../rendering/taa";
import { disposeSSRRenderingPipeline, parseSSRRenderingPipeline, ssrRenderingPipelineCameraConfigurations } from "../rendering/ssr";
import { disposeSSAO2RenderingPipeline, parseSSAO2RenderingPipeline, ssaoRenderingPipelineCameraConfigurations } from "../rendering/ssao";
import { disposeMotionBlurPostProcess, motionBlurPostProcessCameraConfigurations, parseMotionBlurPostProcess } from "../rendering/motion-blur";
import { defaultPipelineCameraConfigurations, disposeDefaultRenderingPipeline, parseDefaultRenderingPipeline } from "../rendering/default-pipeline";

import { EditorGraphContextMenu } from "./graph/context-menu";

import { EditorPreviewIcons } from "./preview/icons";
import { EditorPreviewCamera } from "./preview/camera";
import { EditorPreviewAxisHelper } from "./preview/axis";
import { EditorPreviewPlayComponent } from "./preview/play";

import { EditorPreviewGizmo, type EditorPreviewGizmoType } from "./preview/gizmo/gizmo";
import { EditorPreviewGizmoSettings } from "./preview/gizmo/settings";

import { Stats } from "./preview/stats/stats";
import { StatRow } from "./preview/stats/row";
import { StatsValuesType } from "./preview/stats/types";

import { applySoundAsset } from "./preview/import/sound";
import { applyTextureAssetToObject } from "./preview/import/texture";
import { applyMaterialAssetToObject } from "./preview/import/material";
import { EditorPreviewConvertProgress } from "./preview/import/progress";
import { loadImportedParticleSystemFile } from "./preview/import/particles";
import { loadImportedSceneFile, tryConvertSceneFile } from "./preview/import/import";

const IMPORTED_MODEL_TARGET_MAX_DIMENSION = 200;
const IMPORTED_MODEL_MIN_SCALE_FACTOR = 0.001;
const IMPORTED_MODEL_MAX_SCALE_FACTOR = 1000;
const PREVIEW_GRID_NAME = "__editor_preview_placement_grid__";
const PREVIEW_GRID_RENDER_SIZE = 100000;
const PREVIEW_GRID_STEP = 10;
const PREVIEW_GRID_MAJOR_STEP = 100;
const PREVIEW_GRID_Y_OFFSET = 0.01;

type ImportedModelRoot = AbstractMesh | TransformNode;
type CanvasPickEvent = Pick<MouseEvent<HTMLCanvasElement, globalThis.MouseEvent>, "currentTarget" | "clientX" | "clientY"> & {
	nativeEvent: Pick<globalThis.MouseEvent, "offsetX" | "offsetY">;
};

interface IImportedModelFitBounds {
	minimum: Vector3;
	maximum: Vector3;
	center: Vector3;
	size: Vector3;
	maxDimension: number;
	bottomCenter: Vector3;
}

export interface IEditorPreviewProps {
	/**
	 * The editor reference.
	 */
	editor: Editor;
}

export interface IEditorPreviewState {
	/**
	 * Defines the information message drawn over the preview to tell the user what is happening.
	 */
	informationMessage: ReactNode;

	isFocused: boolean;
	rightClickedObject?: any;
	pickingEnabled: boolean;

	showStatsValues: boolean;
	showSceneHelperIcons: boolean;
	showPlacementGrid: boolean;
	statsValues?: StatsValuesType;

	playEnabled: boolean;
	playSceneLoadingProgress: number;

	gizmoSnap: IGizmoSnapPreferences;
	activeGizmo: EditorPreviewGizmoType;

	/**
	 * Defines the fixed dimensions of the preview canvas.
	 * "fit" means the canvas will fit the entire panel container.
	 */
	fixedDimensions: "720p" | "1080p" | "4k" | "fit";
}

export class EditorPreview extends Component<IEditorPreviewProps, IEditorPreviewState> {
	/**
	 * The engine of the preview.
	 */
	public engine!: AbstractEngine;
	/**
	 * The scene of the preview.
	 */
	public scene!: Scene;
	/**
	 * The camera of the preview.
	 */
	public camera!: EditorCamera;

	/**
	 * The gizmo manager of the preview
	 */
	public gizmo!: EditorPreviewGizmo;
	/**
	 * The helper drawn over the scene to help visualizing and selecting nodes like lights, cameras, particle systems, etc.
	 */
	public icons!: EditorPreviewIcons;
	/**
	 * The helper drawn over the scene to help visualizing the axis according to the current camera view.
	 */
	public axis!: EditorPreviewAxisHelper;

	/**
	 * The play component of the preview.
	 */
	public play!: EditorPreviewPlayComponent;

	/**
	 * The current statistics of the preview.
	 * This is used to display the FPS and other values.
	 */
	public statistics!: Stats;

	/**
	 * Defines the reference to the canvas drawn in the preview.
	 */
	public canvas: HTMLCanvasElement | null = null;

	/**
	 * Defines the reference to the last picking info processed in the preview.
	 */
	public lastPickingInfo: PickingInfo | null = null;

	/**
	 * Defines the reference to the selection outline layer used to highlight a mesh when, for example, the pointer is over it.
	 */
	public selectionOutlineLayer!: SelectionOutlineLayer;
	/**
	 * Defines the reference to the clustered lighting container.
	 */
	public clusteredLightContainer!: ClusteredLightContainer;

	private _renderScene: boolean = true;
	private _mouseDownPosition: Vector2 = Vector2.Zero();

	private _lastPickedDecal: AbstractMesh | null = null;
	private _objectUnderPointer: AbstractMesh | Sprite | null = null;
	private _placementGrid: AbstractMesh | null = null;

	private _workingCanvas: HTMLCanvasElement | null = null;
	private _mainView: EngineView | null = null;

	/** @internal */
	public _previewCamera: Camera | null = null;

	public constructor(props: IEditorPreviewProps) {
		super(props);

		this.state = {
			isFocused: false,
			activeGizmo: "none",
			pickingEnabled: true,
			informationMessage: "",
			fixedDimensions: "fit",

			showStatsValues: false,
			showSceneHelperIcons: false,
			showPlacementGrid: true,

			playEnabled: false,
			playSceneLoadingProgress: 0,

			gizmoSnap: { ...defaultGizmoSnapPreferences },
		};

		ipcRenderer.on("gizmo:position", () => this.setActiveGizmo("position"));
		ipcRenderer.on("gizmo:rotation", () => this.setActiveGizmo("rotation"));
		ipcRenderer.on("gizmo:scaling", () => this.setActiveGizmo("scaling"));

		ipcRenderer.on("preview:focus", () => !isDomTextInputFocused() && this.focusObject());
		ipcRenderer.on("preview:edit-camera", () => this.props.editor.layout.inspector.setEditedObject(this.props.editor.layout.preview.scene.activeCamera));

		ipcRenderer.on("preview:screenshot", (_, size) => saveSceneScreenshot(this.props.editor.layout.preview.scene, size));

		onTextureAddedObservable.add(() => checkProjectCachedCompressedTextures(props.editor));
	}

	public render(): ReactNode {
		return (
			<div className="relative w-full h-full text-foreground">
				<div className="flex flex-col w-full h-full">
					{this._getToolbar()}

					<EditorGraphContextMenu editor={this.props.editor} object={this.state.rightClickedObject} onOpenChange={(o) => !o && this._resetPointerContextInfo()}>
						<canvas
							ref={(r) => this._onGotCanvasRef(r!)}
							onDrop={(ev) => this._handleDrop(ev)}
							onDragOver={(ev) => ev.preventDefault()}
							onBlur={() => this.setState({ isFocused: false })}
							onFocus={() => this.setState({ isFocused: true })}
							onPointerUp={(ev) => this._handleMouseUp(ev)}
							onPointerDown={(ev) => this._handleMouseDown(ev)}
							onDoubleClick={(ev) => this._handleDoubleClick(ev)}
							onMouseLeave={() => this._handleMouseLeave()}
							onDragLeave={() => this._handleMouseLeave()}
							onMouseMove={(ev) => this._handleMouseMove(ev)}
							className={`
                                select-none outline-none w-full h-full object-contain
                                ${this.state.fixedDimensions !== "fit" ? "bg-black" : "bg-background"}
                                transition-all duration-300 ease-in-out
                            `}
						/>

						{(this.play?.state.preparingPlay || this.play?.state.loading) && (
							<div className="absolute top-0 left-0 w-full h-full bg-black">
								<div className="flex flex-col justify-center items-center gap-10 w-full h-full bg-black">
									<Grid width={24} height={24} color="gray" />

									{this.play?.state.loading && <Progress className="w-1/2" value={this.state.playSceneLoadingProgress * 100} />}
								</div>
							</div>
						)}
					</EditorGraphContextMenu>
				</div>

				<EditorGraphContextMenu editor={this.props.editor} object={this.state.rightClickedObject} onOpenChange={(o) => !o && this._resetPointerContextInfo()}>
					<EditorPreviewIcons ref={(r) => this._onGotIconsRef(r!)} editor={this.props.editor} />
				</EditorGraphContextMenu>

				{this._previewCamera && this.scene?.cameras.includes(this._previewCamera) && (
					<EditorPreviewCamera hidden={this.play?.state.playing} key={this._previewCamera.id} editor={this.props.editor} camera={this._previewCamera} />
				)}

				<EditorPreviewAxisHelper ref={(r) => (this.axis = r!)} editor={this.props.editor} />

				<div
					style={{
						opacity: this.state.informationMessage ? "1" : "0",
						top: this.state.informationMessage ? "45px" : "-50px",
					}}
					className="absolute left-0 flex gap-2 items-center px-2 h-10 bg-black/50 transition-all duration-300 pointer-events-none"
				>
					<SpinnerUIComponent width="16" />
					<div>{this.state.informationMessage}</div>
				</div>
			</div>
		);
	}

	/**
	 * Sets whether or not to render the scene.
	 * @param render defines whether or not to render the scene.
	 */
	public setRenderScene(render: boolean): void {
		this._renderScene = render;
	}

	/**
	 * Resizes the engine.
	 */
	public resize(): void {
		if (this.state.fixedDimensions === "fit") {
			this.engine?.resize();
		}
	}

	/**
	 * Resets the preview component by re-creating the engine and an empty scene.
	 */
	public async reset(): Promise<void> {
		if (!this.canvas) {
			return;
		}

		this.axis?.stop();
		this.icons?.stop();

		disposeSSRRenderingPipeline();
		disposeMotionBlurPostProcess();
		disposeSSAO2RenderingPipeline();
		disposeDefaultRenderingPipeline();
		disposeTAARenderingPipeline();

		this.scene?.dispose();

		/**
		 * engine.dispose() generates an error:
		 * node_modules/babylonjs/babylon.js:1 Uncaught (in promise) InvalidAccessError: Failed to execute 'disconnect' on 'AudioNode': the given destination is not connected.
		 * This error is located in _WebAudioMainBus class in the dispose method. It is not reproduced on the Babylon.js playground. This error
		 * appeared after the migration to electron 35.7.5. A workaround consists on try/catching the dispose method.
		 * It appears to work this way and the VRAM is successfully released during the second .dispose() call in the catch.
		 * TODO: investigate in future bump of electron versions if the problem persists.
		 */
		try {
			this.engine?.dispose();
		} catch (e) {
			this.engine?.dispose();
		}

		this.scene = null!;
		this.engine = null!;

		this._placementGrid = null;
		this._previewCamera = null;

		return this._onGotCanvasRef(this.canvas);
	}

	/**
	 * Sets the fixed dimensions of the renderer. This is particularly useful to test the rendering
	 * performances and the aspect ratio of the scene in case it'll be renderer in fullscreen.
	 */
	public setFixedDimensions(fixedDimensions: "720p" | "1080p" | "4k" | "fit"): void {
		this.setState({
			fixedDimensions,
		});

		if (!this.engine || !this._mainView || !this.canvas) {
			return;
		}

		this._mainView!.customResize = undefined;

		switch (fixedDimensions) {
			case "720p":
				this.canvas!.width = 1280;
				this.canvas!.height = 720;

				this._mainView!.customResize = () => {
					this.engine.setSize(1280, 720);
				};
				break;
			case "1080p":
				this.canvas!.width = 1920;
				this.canvas!.height = 1080;

				this._mainView!.customResize = () => {
					this.engine.setSize(1920, 1080);
				};
				break;
			case "4k":
				this.canvas!.width = 3840;
				this.canvas!.height = 2160;

				this._mainView!.customResize = () => {
					this.engine.setSize(3840, 2160);
				};
				break;
		}
	}

	/**
	 * 临时隐藏预览辅助网格执行异步任务，避免项目缩略图等输出带上编辑器辅助线。
	 */
	public async withPlacementGridHidden<T>(callback: () => Promise<T>): Promise<T> {
		const grid = this._placementGrid;
		const restoreGrid = Boolean(grid && !grid.isDisposed() && grid.isEnabled());

		if (restoreGrid) {
			grid?.setEnabled(false);
		}

		try {
			return await callback();
		} finally {
			if (restoreGrid && grid && !grid.isDisposed()) {
				grid.setEnabled(true);
				this._syncPlacementGridToCamera();
			}
		}
	}

	/**
	 * Tries to focused the given object or the first one selected in the graph.
	 */
	public focusObject(object?: any): void {
		const selectedNode = object ?? this.props.editor.layout.graph.getSelectedNodes()[0]?.nodeData;
		if (!selectedNode) {
			return;
		}

		const camera = this.scene.activeCamera;
		if (!camera) {
			return;
		}

		let target: Vector3 | undefined;
		let position: Vector3 | undefined;

		if (isCamera(selectedNode)) {
			target = selectedNode.globalPosition;
		} else if (isAbstractMesh(selectedNode)) {
			const bounds = selectedNode.getTotalVertices() > 0 ? null : this._getNodeHierarchyBounds(selectedNode);
			if (bounds) {
				position = getCameraFocusPositionFor(bounds.center, camera, {
					distance: 2,
					minimum: bounds.minimum,
					maximum: bounds.maximum,
				});
				target = bounds.center;
			} else {
				selectedNode.refreshBoundingInfo({
					applyMorph: true,
					applySkeleton: true,
					updatePositionsArray: true,
				});

				const bb = selectedNode.getBoundingInfo();
				const center = bb.boundingSphere.centerWorld;

				position = getCameraFocusPositionFor(center, camera, {
					distance: 2,
					minimum: selectedNode.geometry ? bb.boundingBox.minimumWorld : new Vector3(-75, -75, -75),
					maximum: selectedNode.geometry ? bb.boundingBox.maximumWorld : new Vector3(75, 75, 75),
				});
				target = bb.boundingBox.centerWorld;
			}
		} else if (isAnyTransformNode(selectedNode)) {
			const bounds = this._getNodeHierarchyBounds(selectedNode);
			if (bounds) {
				position = getCameraFocusPositionFor(bounds.center, camera, {
					distance: 2,
					minimum: bounds.minimum,
					maximum: bounds.maximum,
				});
				target = bounds.center;
			} else {
				target = selectedNode.getAbsolutePosition();
			}
		} else if (isLight(selectedNode)) {
			target = selectedNode.getAbsolutePosition();
		} else if (isAnyParticleSystem(selectedNode)) {
			if (isAbstractMesh(selectedNode.emitter)) {
				target = selectedNode.emitter.getAbsolutePosition();
			} else if (isVector3(selectedNode.emitter)) {
				target = selectedNode.emitter;
			}
		} else if (isSprite(selectedNode)) {
			const bb = new BoundingBox(new Vector3(-selectedNode.width * 0.5, -selectedNode.height * 0.5, 0), new Vector3(selectedNode.width * 0.5, selectedNode.height * 0.5, 0));
			const center = bb.centerWorld;

			position = getCameraFocusPositionFor(center, camera, {
				distance: 2,
				minimum: bb.minimumWorld,
				maximum: bb.maximumWorld,
			});

			target = selectedNode.position.clone();
		}

		if (target) {
			const tweenConfiguration = {
				target,
			} as ITweenConfiguration;

			if (position) {
				tweenConfiguration.position = position;
			}

			Tween.create(camera, 0.5, tweenConfiguration);
		}
	}

	/**
	 * 计算节点层级下所有子网格的聚合包围盒，用于聚焦没有几何体的模型根节点。
	 */
	private _getNodeHierarchyBounds(node: Node): { minimum: Vector3; maximum: Vector3; center: Vector3 } | null {
		const getChildMeshes = (node as { getChildMeshes?: (directDescendantsOnly?: boolean) => AbstractMesh[] }).getChildMeshes;
		if (!getChildMeshes) {
			return null;
		}

		let minimum: Vector3 | null = null;
		let maximum: Vector3 | null = null;

		getChildMeshes.call(node, false).forEach((mesh) => {
			if (mesh.getTotalVertices() <= 0) {
				return;
			}

			mesh.refreshBoundingInfo({
				applyMorph: true,
				applySkeleton: true,
				updatePositionsArray: true,
			});

			const box = mesh.getBoundingInfo().boundingBox;
			minimum = minimum ? Vector3.Minimize(minimum, box.minimumWorld) : box.minimumWorld.clone();
			maximum = maximum ? Vector3.Maximize(maximum, box.maximumWorld) : box.maximumWorld.clone();
		});

		return minimum && maximum
			? {
					minimum,
					maximum,
					center: Vector3.Center(minimum, maximum),
				}
			: null;
	}

	/**
	 * 识别或创建本次导入模型的整体根节点，后续自动缩放、落点和 Gizmo 都围绕它处理。
	 */
	private _getImportedModelRoot(result: ISceneLoaderAsyncResult, absolutePath: string, sidecarRoot: ImportedModelRoot | null): ImportedModelRoot | null {
		if (sidecarRoot) {
			return sidecarRoot;
		}

		const ignoredNodes = [this.camera as unknown as Node, this._previewCamera as Node | null];
		const importedNodes = [...result.transformNodes, ...result.meshes].filter((node) => !ignoredNodes.includes(node));
		const rootNode = importedNodes.find((node) => (node.name === "__root__" || node.id === "__root__") && !node.parent);
		if (isAnyTransformNode(rootNode) || isAbstractMesh(rootNode)) {
			return rootNode;
		}

		const topLevelNodes = importedNodes.filter((node) => !node.parent && (isAnyTransformNode(node) || isAbstractMesh(node))) as ImportedModelRoot[];
		if (topLevelNodes.length === 1) {
			return topLevelNodes[0];
		}

		if (!topLevelNodes.length) {
			return null;
		}

		const root = new TransformNode(basename(absolutePath, extname(absolutePath)), this.scene);
		topLevelNodes.forEach((node) => (node.parent = root));

		return root;
	}

	/**
	 * 计算导入模型层级的世界包围盒，返回缩放和底部落点所需的派生尺寸。
	 */
	private _getImportedModelFitBounds(root: ImportedModelRoot): IImportedModelFitBounds | null {
		root.computeWorldMatrix(true);

		let minimum: Vector3 | null = null;
		let maximum: Vector3 | null = null;

		const meshes = isAbstractMesh(root) ? [root, ...root.getChildMeshes(false)] : root.getChildMeshes(false);
		meshes.forEach((mesh) => {
			if (mesh.getTotalVertices() <= 0) {
				return;
			}

			mesh.computeWorldMatrix(true);
			mesh.refreshBoundingInfo({
				applyMorph: true,
				applySkeleton: true,
				updatePositionsArray: true,
			});

			const box = mesh.getBoundingInfo().boundingBox;
			minimum = minimum ? Vector3.Minimize(minimum, box.minimumWorld) : box.minimumWorld.clone();
			maximum = maximum ? Vector3.Maximize(maximum, box.maximumWorld) : box.maximumWorld.clone();
		});

		if (!minimum || !maximum) {
			return null;
		}

		const boundsMinimum = minimum as Vector3;
		const boundsMaximum = maximum as Vector3;
		const center = Vector3.Center(boundsMinimum, boundsMaximum);
		const size = boundsMaximum.subtract(boundsMinimum);

		return {
			minimum: boundsMinimum,
			maximum: boundsMaximum,
			center,
			size,
			maxDimension: Math.max(size.x, size.y, size.z),
			bottomCenter: new Vector3(center.x, boundsMinimum.y, center.z),
		};
	}

	/**
	 * 自动把导入模型缩放到编辑器可操作尺寸，并把底部中心对齐到鼠标命中的世界坐标。
	 */
	private _fitImportedModelToDropPoint(root: ImportedModelRoot, position?: Vector3): void {
		const bounds = this._getImportedModelFitBounds(root);
		if (bounds?.maxDimension && Number.isFinite(bounds.maxDimension) && bounds.maxDimension > 0) {
			const scaleFactor = Math.min(
				IMPORTED_MODEL_MAX_SCALE_FACTOR,
				Math.max(IMPORTED_MODEL_MIN_SCALE_FACTOR, IMPORTED_MODEL_TARGET_MAX_DIMENSION / bounds.maxDimension)
			);

			root.scaling.scaleInPlace(scaleFactor);
			root.computeWorldMatrix(true);
		}

		if (!position) {
			return;
		}

		const scaledBounds = this._getImportedModelFitBounds(root);
		if (!scaledBounds) {
			root.setAbsolutePosition(position);
			root.computeWorldMatrix(true);
			return;
		}

		const delta = position.subtract(scaledBounds.bottomCenter);
		root.setAbsolutePosition(root.getAbsolutePosition().add(delta));
		root.computeWorldMatrix(true);
	}

	/**
	 * Sets the given camera active as a preview.
	 * This helps to visualize what the selected camera sees when being manipulated
	 * using gizmos for example.
	 * When "null", the preview is removed.
	 * @param camera the camera to activate the preview
	 */
	public setCameraPreviewActive(camera: Camera | null): void {
		if (this._previewCamera === camera || camera === this.scene.activeCamera) {
			return;
		}

		this._previewCamera = camera;
		this.forceUpdate();
	}

	private _onGotIconsRef(ref: EditorPreviewIcons): void {
		if (this.icons) {
			return;
		}

		waitNextAnimationFrame().then(() => {
			this.icons = ref;
			if (this.state.showSceneHelperIcons) {
				this.icons?.start();
			}
		});
	}

	private async _onGotCanvasRef(canvas: HTMLCanvasElement): Promise<void> {
		if (this.engine) {
			return;
		}

		this.canvas ??= canvas;
		this._workingCanvas ??= document.createElement("canvas");

		await waitUntil(() => this.props.editor.path);

		await Promise.all([await initializeRecast(this.props.editor), await initializeHavok(this.props.editor.path!)]);

		SceneLoaderFlags.ShowLoadingScreen = false;

		Animation.AllowMatricesInterpolation = true;
		Animation.AllowMatrixDecomposeForInterpolation = true;

		const safeOpenMode = tryGetSafeOpenModeFromLocalStorage();
		const webGpuSupported = false;
		// const webGpuSupported = await WebGPUEngine.IsSupportedAsync;

		if (webGpuSupported) {
			this.engine = await this._createWebgpuEngine(this._workingCanvas, safeOpenMode);
		} else {
			this.engine = new Engine(this._workingCanvas, true, {
				antialias: !safeOpenMode,
				audioEngine: true,
				adaptToDeviceRatio: !safeOpenMode,
				disableWebGL2Support: false,
				useHighPrecisionFloats: !safeOpenMode,
				useHighPrecisionMatrix: !safeOpenMode,
				powerPreference: safeOpenMode ? "low-power" : "high-performance",
				failIfMajorPerformanceCaveat: false,
				useExactSrgbConversions: true,
			});
		}

		if (safeOpenMode) {
			this.engine.setHardwareScalingLevel(2);
			this.props.editor.layout.console.log("已启用低硬件占用模式，预览渲染将使用保守配置。");
		}

		this.engine.disableContextMenu = false;
		this.engine.inputElement = this.canvas;

		this.scene = new Scene(this.engine);
		this.scene.autoClear = true;
		this.scene.skipPointerUpPicking = true;
		this.scene.skipPointerDownPicking = true;
		this.scene.skipPointerMovePicking = true;

		this.camera = new EditorCamera("camera", Vector3.Zero(), this.scene);
		this.camera.attachControl(true);

		_GetAudioEngine(null).listener.attach(this.camera);

		this.gizmo = new EditorPreviewGizmo(this.scene);
		this.gizmo.setSnapPreferences(this.state.gizmoSnap);

		this.selectionOutlineLayer = new SelectionOutlineLayer("selectionOutline", this.scene);
		this.selectionOutlineLayer.outlineThickness = 4;

		this.clusteredLightContainer = new ClusteredLightContainer("Clustered Light Container", [], this.scene);
		this.clusteredLightContainer.id = Tools.RandomId();
		this.clusteredLightContainer.uniqueId = UniqueNumber.Get();

		this.engine.hideLoadingUI();
		this._mainView = this.engine.registerView(this.canvas);

		this.engine.runRenderLoop(() => {
			if (this._renderScene && !this.play.state.playing) {
				if (this._previewCamera) {
					// TODO: remove this once fixed
					// Bug report on forum: https://forum.babylonjs.com/t/multi-canvas-and-post-processes/59616/23
					const ppRenderer = this.scene.prePassRenderer;
					if (ppRenderer) {
						ppRenderer.markAsDirty();
					}
				}

				this._syncPlacementGridToCamera();
				this.scene.render();

				if (!this.engine.activeView?.camera) {
					this.axis.scene?.render();
				}
				return;
			}

			if (this.play.canPlayScene) {
				try {
					return this.play.scene?.render();
				} catch (e) {
					if (e instanceof Error) {
						this.props.editor.layout.console.error(`Error while playing the scene:\n${e.message}`);
					}
					console.error(e);
					this.play.stop();
				}
			}
		});

		Tween.Scene = this.scene;
		Tween.DefaultEasing = {
			type: new CubicEase(),
			mode: EasingFunction.EASINGMODE_EASEINOUT,
		};

		this.scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin());

		this.statistics = new Stats(this.props.editor);
		this.statistics.onValuesChangedObservable.add((values) => {
			if (this.state.showStatsValues) {
				this.setState({
					statsValues: { ...values },
				});
			}
		});

		this.axis?.start();
		this._setPlacementGridVisible(this.state.showPlacementGrid);
		if (this.state.showSceneHelperIcons) {
			this.icons?.start();
		}

		this.forceUpdate();
	}

	/**
	 * 创建用于摆放模型的运行时辅助网格。该网格不保存、不进层级图，也不参与拾取。
	 */
	private _createPlacementGrid(): AbstractMesh | null {
		if (!this.scene || (this._placementGrid && !this._placementGrid.isDisposed())) {
			return this._placementGrid;
		}

		const grid = MeshBuilder.CreateGround(
			PREVIEW_GRID_NAME,
			{
				width: PREVIEW_GRID_RENDER_SIZE,
				height: PREVIEW_GRID_RENDER_SIZE,
				subdivisions: 1,
			},
			this.scene
		);
		const material = new GridMaterial(`${PREVIEW_GRID_NAME}_material`, this.scene);

		material.gridRatio = PREVIEW_GRID_STEP;
		material.majorUnitFrequency = PREVIEW_GRID_MAJOR_STEP / PREVIEW_GRID_STEP;
		material.minorUnitVisibility = 0.28;
		material.opacity = 0.38;
		material.mainColor = new Color3(0.48, 0.48, 0.48);
		material.lineColor = new Color3(0.72, 0.72, 0.72);
		material.backFaceCulling = false;
		material.doNotSerialize = true;
		material.metadata = {
			...material.metadata,
			doNotSerialize: true,
			editorPreviewGrid: true,
		};

		grid.id = PREVIEW_GRID_NAME;
		grid.material = material;
		grid.isPickable = false;
		grid.alwaysSelectAsActiveMesh = true;
		grid.doNotSerialize = true;
		grid.metadata = {
			...grid.metadata,
			doNotSerialize: true,
			editorPreviewGrid: true,
		};
		setNodeVisibleInGraph(grid, false);
		grid._removeFromSceneRootNodes();

		this._placementGrid = grid;
		this._syncPlacementGridToCamera();
		return grid;
	}

	/**
	 * 将超大网格跟随当前视口中心移动，并用材质偏移保持网格线仍对齐世界坐标。
	 */
	private _syncPlacementGridToCamera(): void {
		if (!this.scene || !this._placementGrid || this._placementGrid.isDisposed() || !this._placementGrid.isEnabled()) {
			return;
		}

		const camera = this.scene.activeCamera;
		if (!camera) {
			return;
		}

		const cameraTarget = (camera as Camera & { target?: unknown }).target;
		const center = isVector3(cameraTarget) ? cameraTarget : camera.position;
		const x = Math.round(center.x / PREVIEW_GRID_STEP) * PREVIEW_GRID_STEP;
		const z = Math.round(center.z / PREVIEW_GRID_STEP) * PREVIEW_GRID_STEP;

		if (this._placementGrid.position.x !== x || this._placementGrid.position.y !== PREVIEW_GRID_Y_OFFSET || this._placementGrid.position.z !== z) {
			this._placementGrid.position.set(x, PREVIEW_GRID_Y_OFFSET, z);
		}

		const material = this._placementGrid.material;
		if (material instanceof GridMaterial && (material.gridOffset.x !== x || material.gridOffset.y !== 0 || material.gridOffset.z !== z)) {
			material.gridOffset.set(x, 0, z);
		}
	}

	/**
	 * 设置预览辅助网格显隐，隐藏时保留对象以便快速再次显示。
	 */
	private _setPlacementGridVisible(visible: boolean): void {
		const grid = visible ? this._createPlacementGrid() : this._placementGrid;
		if (grid) {
			grid.setEnabled(visible);
			this._syncPlacementGridToCamera();
		}

		this.setState({ showPlacementGrid: visible });
	}

	/**
	 * 设置是否显示场景中的灯光、相机等辅助图标。
	 */
	private _setSceneHelperIconsVisible(visible: boolean): void {
		if (visible) {
			this.icons?.start();
		} else {
			this.icons?.stop();
		}

		this.setState({ showSceneHelperIcons: visible });
	}

	private async _createWebgpuEngine(canvas: HTMLCanvasElement, safeOpenMode: boolean): Promise<WebGPUEngine> {
		const glslangJs = require("@babylonjs/core/assets/glslang/glslang.cjs");
		const glslang = await glslangJs(join(process.cwd(), "../node_modules/@babylonjs/core/assets/glslang/glslang.wasm"));

		const twgslJs = require("@babylonjs/core/assets/twgsl/twgsl.cjs");
		const twgsl = await twgslJs(join(process.cwd(), "../node_modules/@babylonjs/core/assets/twgsl/twgsl.wasm"));

		const engine = new WebGPUEngine(canvas, {
			antialias: !safeOpenMode,
			audioEngine: true,
			adaptToDeviceRatio: !safeOpenMode,
			glslangOptions: {
				glslang,
			},
			twgslOptions: {
				twgsl,
			},
			useHighPrecisionMatrix: !safeOpenMode,
			powerPreference: safeOpenMode ? "low-power" : "high-performance",
		});

		await engine.initAsync();

		return engine;
	}

	/** @internal */
	public _handleMouseLeave(): void {
		this._restoreCurrentMeshUnderPointer();
		this.lastPickingInfo = null;
		this._objectUnderPointer = null;
	}

	private _mouseMoveTimeoutId: number = -1;

	private _handleMouseMove(event: MouseEvent<HTMLCanvasElement, globalThis.MouseEvent>): void {
		this.lastPickingInfo = null;

		if (!this.state.pickingEnabled) {
			return;
		}

		const pickingInfo = this._getPickingInfoForEvent(event);
		const pickedObject = pickingInfo.pickedSprite ?? pickingInfo.pickedMesh?._masterMesh ?? pickingInfo.pickedMesh;

		if (!pickedObject || (isNode(pickedObject) && isNodeLocked(pickedObject))) {
			this._restoreCurrentMeshUnderPointer();
			this._objectUnderPointer = null;
			return;
		}

		if (this._objectUnderPointer !== pickedObject) {
			this._restoreCurrentMeshUnderPointer();
			this._highlightCurrentMeshUnderPointer(pickedObject);

			this._objectUnderPointer = pickedObject;

			if (this._mouseMoveTimeoutId) {
				clearTimeout(this._mouseMoveTimeoutId);
			}

			this._mouseMoveTimeoutId = window.setTimeout(() => {
				this.forceUpdate();
			}, 200);
		}
	}

	private _handleMouseDown(event: MouseEvent<HTMLCanvasElement, globalThis.MouseEvent>): void {
		this.lastPickingInfo = null;

		if (!this.state.pickingEnabled) {
			return;
		}

		this._mouseDownPosition.set(event.clientX, event.clientY);

		if (event.button === 2) {
			const pickingInfo = this._getPickingInfoForEvent(event);
			const rightClickedObject = this._getEffectivePickedObject(pickingInfo);

			if (rightClickedObject) {
				this.setState({
					rightClickedObject,
				});
			} else {
				this._resetPointerContextInfo();
			}

			this._restoreCurrentMeshUnderPointer();
			this._objectUnderPointer = null;

			if (rightClickedObject) {
				this.scene.activeCamera?.inputs.detachElement();
				this._handleMouseUp(event);
			}

			return;
		}

		this._restoreCurrentMeshUnderPointer();
		this._objectUnderPointer = null;
	}

	private _handleDoubleClick(event: MouseEvent<HTMLCanvasElement, globalThis.MouseEvent>): void {
		this.lastPickingInfo = null;

		if (!this.state.pickingEnabled || this.axis._axisMeshUnderPointer) {
			return;
		}

		const pickingInfo = this._getPickingInfoForEvent(event);
		if (pickingInfo.pickedMesh || pickingInfo.pickedSprite) {
			this.focusObject(pickingInfo.pickedMesh ?? pickingInfo.pickedSprite);
		}
	}

	private _handleMouseUp(event: MouseEvent<HTMLCanvasElement, globalThis.MouseEvent>): void {
		this.lastPickingInfo = null;

		if (!this.state.pickingEnabled) {
			return;
		}

		if (event.altKey || event.button === 1) {
			return;
		}

		const distance = Vector2.Distance(this._mouseDownPosition, new Vector2(event.clientX, event.clientY));

		if (distance > 2) {
			return;
		}

		this.scene.meshes.forEach((mesh) => {
			if (mesh.geometry) {
				mesh.refreshBoundingInfo({
					applyMorph: true,
					applySkeleton: true,
				});
			}
		});

		const pickingInfo = this._getPickingInfoForEvent(event);

		const effectivePickedObject = this._getEffectivePickedObject(pickingInfo);

		this.lastPickingInfo = pickingInfo;

		if (effectivePickedObject) {
			if (event.shiftKey) {
				this.props.editor.layout.graph.addToSelectedNodes(effectivePickedObject);
			} else {
				this.props.editor.layout.graph.setSelectedNode(effectivePickedObject);
			}

			this.gizmo.setAttachedObject(effectivePickedObject);
			this.props.editor.layout.inspector.setEditedObject(effectivePickedObject);
			this.props.editor.layout.animations.setEditedObject(effectivePickedObject);
		}
	}

	private _decalMeshPredicate(m: AbstractMesh): boolean {
		if (!m.isVisible || !m.isEnabled() || !m.metadata?.decal) {
			return false;
		}

		if (this._lastPickedDecal) {
			return m !== this._lastPickedDecal;
		}

		return true;
	}

	private _meshPredicate(m: AbstractMesh): boolean {
		return !m.metadata?.editorPreviewGrid && !m._masterMesh && !isCollisionMesh(m) && !isCollisionInstancedMesh(m) && m.isVisible && m.isEnabled();
	}

	/**
	 * 把鼠标事件转换为 Babylon scene.pick 使用的坐标，并扣除固定分辨率 object-contain 产生的黑边。
	 */
	private _getCanvasPickCoordinates(ev: CanvasPickEvent): Vector2 | null {
		const target = ev.currentTarget;
		const rect = target.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return new Vector2(ev.nativeEvent.offsetX, ev.nativeEvent.offsetY);
		}

		const localX = ev.clientX - rect.left;
		const localY = ev.clientY - rect.top;
		const renderWidth = this.engine?.getRenderWidth();
		const renderHeight = this.engine?.getRenderHeight();
		const hardwareScalingLevel = this.engine?.getHardwareScalingLevel() ?? 1;

		if (!renderWidth || !renderHeight || renderWidth <= 0 || renderHeight <= 0 || hardwareScalingLevel <= 0) {
			return new Vector2(localX, localY);
		}

		const renderAspectRatio = renderWidth / renderHeight;
		const rectAspectRatio = rect.width / rect.height;
		let contentWidth = rect.width;
		let contentHeight = rect.height;
		let contentLeft = 0;
		let contentTop = 0;

		if (rectAspectRatio > renderAspectRatio) {
			contentWidth = rect.height * renderAspectRatio;
			contentLeft = (rect.width - contentWidth) / 2;
		} else if (rectAspectRatio < renderAspectRatio) {
			contentHeight = rect.width / renderAspectRatio;
			contentTop = (rect.height - contentHeight) / 2;
		}

		const contentX = localX - contentLeft;
		const contentY = localY - contentTop;
		const edgeTolerance = 0.5;
		if (contentX < -edgeTolerance || contentY < -edgeTolerance || contentX > contentWidth + edgeTolerance || contentY > contentHeight + edgeTolerance) {
			return null;
		}

		const clampedContentX = Math.min(Math.max(contentX, 0), contentWidth);
		const clampedContentY = Math.min(Math.max(contentY, 0), contentHeight);
		const renderX = (clampedContentX / contentWidth) * renderWidth;
		const renderY = (clampedContentY / contentHeight) * renderHeight;

		// Babylon 创建 picking ray 时会再除以硬件缩放，这里乘回去才能保持事件坐标与渲染缓冲一致。
		return new Vector2(renderX * hardwareScalingLevel, renderY * hardwareScalingLevel);
	}

	/**
	 * 把拖放事件转换为 Babylon scene.pick 使用的 canvas 相对坐标。
	 */
	private _getDragPickCoordinates(ev: React.DragEvent<HTMLCanvasElement>): Vector2 | null {
		return this._getCanvasPickCoordinates(ev);
	}

	private _getDropPickingInfoAt(coordinates: Vector2 | null): PickingInfo {
		if (!coordinates) {
			return new PickingInfo();
		}

		return this.scene.pick(coordinates.x, coordinates.y, (m) => this._meshPredicate(m), false);
	}

	/**
	 * 计算拖放落点。优先使用真实模型命中点；空白区域则投射到 XZ 水平面，保证拖到网格时也能得到稳定位置。
	 */
	private _getDropPointAt(coordinates: Vector2 | null): Vector3 | null {
		if (!coordinates) {
			return null;
		}

		const pickedPoint = this._getDropPickingInfoAt(coordinates).pickedPoint?.clone();
		if (pickedPoint) {
			return pickedPoint;
		}

		const camera = this.scene.activeCamera;
		if (!camera) {
			return null;
		}

		const ray = this.scene.createPickingRay(coordinates.x, coordinates.y, Matrix.Identity(), camera);
		const distance = ray.intersectsPlane(new Plane(0, 1, 0, 0));
		if (distance === null) {
			return null;
		}

		return ray.origin.add(ray.direction.scale(distance));
	}

	private _getDropPoint(ev: React.DragEvent<HTMLCanvasElement>): Vector3 | null {
		return this._getDropPointAt(this._getDragPickCoordinates(ev));
	}

	private _getPickingInfoForEvent(event: CanvasPickEvent): PickingInfo {
		const coordinates = this._getCanvasPickCoordinates(event);
		if (!coordinates) {
			return new PickingInfo();
		}

		return this._getPickingInfo(coordinates.x, coordinates.y);
	}

	private _getPickingInfo(x: number, y: number): PickingInfo {
		const decalPick = this.scene.pick(x, y, (m) => this._decalMeshPredicate(m), false);
		const meshPick = this.scene.pick(x, y, (m) => this._meshPredicate(m), false);
		const spritePick = this.scene.pickSprite(x, y, (s) => isSprite(s), false);

		this._lastPickedDecal = null;

		let pickingInfo = meshPick;
		if (decalPick?.pickedPoint && meshPick?.pickedPoint) {
			const distance = Vector3.Distance(decalPick.pickedPoint, meshPick.pickedPoint);
			const zOffset = decalPick.pickedMesh?.material?.zOffset ?? 0;

			if (distance <= zOffset + 1) {
				pickingInfo = decalPick;
				this._lastPickedDecal = decalPick.pickedMesh;
			}
		}

		if (spritePick?.pickedSprite) {
			if (!pickingInfo.pickedMesh) {
				pickingInfo = spritePick;
			} else if (pickingInfo.ray && spritePick.ray) {
				const spriteDistance = Vector2.Distance(spritePick.ray.origin, spritePick.pickedPoint!);
				const meshDistance = Vector3.Distance(pickingInfo.ray.origin, pickingInfo.pickedPoint!);

				if (spriteDistance <= meshDistance) {
					pickingInfo = spritePick;
				}
			}
		}

		return pickingInfo;
	}

	private _getEffectivePickedObject(pickingInfo: PickingInfo): Node | Sprite | null {
		const pickedObject = pickingInfo.pickedSprite ?? pickingInfo.pickedMesh?._masterMesh ?? pickingInfo.pickedMesh;
		if (!pickedObject) {
			return null;
		}

		if (isSprite(pickedObject)) {
			return pickedObject;
		}

		if (!isNode(pickedObject) || isNodeLocked(pickedObject)) {
			return null;
		}

		let effectivePickedObject: Node = pickedObject;
		const sceneLink = getRootSceneLink(effectivePickedObject);
		if (sceneLink) {
			effectivePickedObject = sceneLink;
		}

		if (effectivePickedObject.parent && isSpriteMapNode(effectivePickedObject.parent) && effectivePickedObject.parent.outputPlane === effectivePickedObject) {
			effectivePickedObject = effectivePickedObject.parent;
		}

		return effectivePickedObject;
	}

	private _resetPointerContextInfo(): void {
		if (this.state.rightClickedObject) {
			this.setState({
				rightClickedObject: null,
			});

			this.scene.activeCamera?.inputs.attachElement();
		}
	}

	private _highlightCurrentMeshUnderPointer(pickedObject: AbstractMesh | Sprite): void {
		if (isSprite(pickedObject)) {
			pickedObject.overrideColor ??= new Color4(1, 1, 1, 1);
			Tween.create(pickedObject, 0.1, {
				overrideColor: new Color4(0.5, 0.5, 0.5, 1.0),
			});
		}
	}

	private _restoreCurrentMeshUnderPointer(): void {
		const objectUnderPointer = this._objectUnderPointer;

		if (objectUnderPointer) {
			if (isSprite(objectUnderPointer)) {
				Tween.killTweensOf(objectUnderPointer);
				Tween.create(objectUnderPointer, 0.1, {
					overrideColor: new Color4(1.0, 1.0, 1.0, 1.0),
				});
			}
		}
	}

	private _getToolbar(): ReactNode {
		return (
			<div className="absolute top-0 left-0 w-full h-12 z-10">
				<div className="flex justify-between items-center gap-4 h-full bg-background/95 w-full px-2 py-1">
					{
						this.play?.state.playing && <div /> // For justify between
					}

					{!this.play?.state.playing && this._getEditToolbar()}

					<div className="flex gap-2 items-center h-10">
						<EditorPreviewPlayComponent
							ref={(r) => (this.play = r!)}
							editor={this.props.editor}
							enabled={this.state.playEnabled}
							onRestart={() => this.play.restart()}
						/>
					</div>
				</div>
			</div>
		);
	}

	public updateGizmoSnapPreferences(prefs: IGizmoSnapPreferences): void {
		const normalized = roundGizmoSnapSteps(prefs);
		this.gizmo?.setSnapPreferences(normalized);
		this.setState({
			gizmoSnap: normalized,
		});
	}

	private _getEditToolbar(): ReactNode {
		return (
			<div className="flex flex-wrap gap-2 items-center h-10">
				<TooltipProvider>
					<Select value={this.scene?.activeCamera?.id} onOpenChange={(o) => o && this.forceUpdate()} onValueChange={(v) => this._switchToCamera(v)}>
						<SelectTrigger className="w-36 border-none bg-muted/50">
							<SelectValue placeholder="Select Value..." />
						</SelectTrigger>
						<SelectContent>
							{this.scene?.cameras.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Separator orientation="vertical" className="mx-1 h-[24px]" />

					<ToolbarRadioGroup
						value={this.state.activeGizmo === "none" ? "select" : this.state.activeGizmo}
						onValueChange={(value) => {
							if (value === "select") {
								this.setActiveGizmo("none");
							} else {
								this.setActiveGizmo(value as EditorPreviewGizmoType);
							}
						}}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToolbarRadioGroupItem value="select" className={this.state.activeGizmo === "none" ? "bg-primary/20" : ""}>
									<GiArrowCursor className="h-4 w-4" />
								</ToolbarRadioGroupItem>
							</TooltipTrigger>
							<TooltipContent>选择模式</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToolbarRadioGroupItem value="position" className={this.state.activeGizmo === "position" ? "bg-primary/20" : ""}>
									<LuMove3D height={16} />
								</ToolbarRadioGroupItem>
							</TooltipTrigger>
							<TooltipContent>切换位置 Gizmo</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToolbarRadioGroupItem value="position-plane" className={this.state.activeGizmo === "position-plane" ? "bg-primary/20" : ""}>
									<LuSquareDashedMousePointer height={16} />
								</ToolbarRadioGroupItem>
							</TooltipTrigger>
							<TooltipContent>切换平面移动 Gizmo</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToolbarRadioGroupItem value="rotation" className={this.state.activeGizmo === "rotation" ? "bg-primary/20" : ""}>
									<LuRotate3D height={16} />
								</ToolbarRadioGroupItem>
							</TooltipTrigger>
							<TooltipContent>切换旋转 Gizmo</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToolbarRadioGroupItem value="rotation-plane" className={this.state.activeGizmo === "rotation-plane" ? "bg-primary/20" : ""}>
									<LuRotateCwSquare height={16} />
								</ToolbarRadioGroupItem>
							</TooltipTrigger>
							<TooltipContent>切换平面旋转 Gizmo</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<ToolbarRadioGroupItem value="scaling" className={this.state.activeGizmo === "scaling" ? "bg-primary/20" : ""}>
									<LuScale3D height={16} />
								</ToolbarRadioGroupItem>
							</TooltipTrigger>
							<TooltipContent>切换缩放 Gizmo</TooltipContent>
						</Tooltip>
					</ToolbarRadioGroup>

					<Separator orientation="vertical" className="mx-1 h-[24px]" />

					<EditorPreviewGizmoSettings editor={this.props.editor} />

					<Separator orientation="vertical" className="mx-1 h-[24px]" />

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								className={this.state.showPlacementGrid ? "!px-2 !py-2 bg-primary/20" : "!px-2 !py-2"}
								pressed={this.state.showPlacementGrid}
								onPressedChange={(pressed) => this._setPlacementGridVisible(pressed)}
							>
								<LuGrid3X3 className="w-5 h-5" strokeWidth={2} />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>显示/隐藏网格</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Toggle
								className={this.scene?.forceWireframe ? "!px-2 !py-2 bg-primary/20" : "!px-2 !py-2"}
								pressed={this.scene?.forceWireframe}
								onPressedChange={() => {
									this.scene.forceWireframe = !this.scene.forceWireframe;
									this.forceUpdate();
								}}
							>
								<GiWireframeGlobe className="w-6 h-6 scale-125" strokeWidth={1} color="white" />
							</Toggle>
						</TooltipTrigger>
						<TooltipContent>切换线框</TooltipContent>
					</Tooltip>

					<Separator orientation="vertical" className="mx-1 h-[24px]" />

					<Select
						value={this.gizmo?.getCoordinateMode().toString()}
						onValueChange={(v) => {
							this.gizmo?.setCoordinatesMode(parseInt(v));
							this.forceUpdate();
						}}
					>
						<SelectTrigger className="w-32 border-none bg-muted/50">
							<SelectValue placeholder="Select Value..." />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={GizmoCoordinatesMode.World.toString()}>世界</SelectItem>
							<SelectItem value={GizmoCoordinatesMode.Local.toString()}>本地</SelectItem>
						</SelectContent>
					</Select>

					<Separator orientation="vertical" className="mx-1 h-[24px]" />

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="px-1 py-1 w-9 h-9">
								<GiTeapot className="w-6 h-6" strokeWidth={1} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent onClick={() => this.forceUpdate()}>
							<DropdownMenuLabel>渲染选项</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => (this.axis.enabled ? this.axis.stop() : this.axis.start())}>
								{this.axis?.enabled && <FaCheck className="w-4 h-4" />} Axis Helper
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-3 items-center justify-between" onClick={() => this._setSceneHelperIconsVisible(!this.state.showSceneHelperIcons)}>
								<span>显示灯光/相机图标</span>
								<Switch
									checked={this.state.showSceneHelperIcons}
									onClick={(ev) => ev.stopPropagation()}
									onCheckedChange={(checked) => this._setSceneHelperIconsVisible(checked)}
								/>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => (this.scene.postProcessesEnabled = !this.scene.postProcessesEnabled)}>
								{this.scene?.postProcessesEnabled && <FaCheck className="w-4 h-4" />} Post-processes enabled
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => (this.scene.texturesEnabled = !this.scene.texturesEnabled)}>
								{this.scene?.texturesEnabled && <FaCheck className="w-4 h-4" />} Textures enabled
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => (this.scene.lightsEnabled = !this.scene.lightsEnabled)}>
								{this.scene?.lightsEnabled && <FaCheck className="w-4 h-4" />} Lights enabled
							</DropdownMenuItem>
							<DropdownMenuItem
								className="flex gap-2 items-center"
								onClick={() => {
									this.scene.shadowsEnabled = !this.scene.shadowsEnabled;
									this.scene.renderTargetsEnabled = this.scene.shadowsEnabled;
								}}
							>
								{this.scene?.shadowsEnabled && <FaCheck className="w-4 h-4" />} Shadows enabled
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => (this.scene.particlesEnabled = !this.scene.particlesEnabled)}>
								{this.scene?.particlesEnabled && <FaCheck className="w-4 h-4" />} Particles enabled
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuLabel>Renderer dimensions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => this.setFixedDimensions("720p")}>
								{this.state.fixedDimensions === "720p" && <FaCheck className="w-4 h-4" />} 720p
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => this.setFixedDimensions("1080p")}>
								{this.state.fixedDimensions === "1080p" && <FaCheck className="w-4 h-4" />} 1080p
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => this.setFixedDimensions("4k")}>
								{this.state.fixedDimensions === "4k" && <FaCheck className="w-4 h-4" />} 4K (UHD)
							</DropdownMenuItem>
							<DropdownMenuItem className="flex gap-2 items-center" onClick={() => this.setFixedDimensions("fit")}>
								{this.state.fixedDimensions === "fit" && <FaCheck className="w-4 h-4" />} Fit
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu onOpenChange={(o) => this.setState({ showStatsValues: o })}>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="px-1 py-1 w-9 h-9">
								<IoIosStats className="w-6 h-6" strokeWidth={1} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-72" onClick={() => this.forceUpdate()}>
							<DropdownMenuLabel>统计</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="flex flex-col gap-1">
								<StatRow label="平均 FPS" value={this.state.statsValues?.averageFPS} />
								<StatRow label="Instantaneous FPS" value={this.state.statsValues?.instantaneousFPS} />
								<StatRow label="绘制调用" value={this.state.statsValues?.drawCalls} />
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="flex flex-col gap-1">
								<StatRow label="活动面" value={this.state.statsValues?.activeFaces} />
								<StatRow label="活动网格" value={this.state.statsValues?.activeMeshes} />
								<StatRow label="活动索引" value={this.state.statsValues?.activeIndices} />
								<StatRow label="活动骨骼" value={this.state.statsValues?.activeBones} />
								<StatRow label="活动粒子" value={this.state.statsValues?.activeParticles} />
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="flex flex-col gap-1">
								<StatRow label="网格总数" value={this.state.statsValues?.totalMeshes} />
								<StatRow label="顶点总数" value={this.state.statsValues?.totalVertices} />
								<StatRow label="材质总数" value={this.state.statsValues?.totalMaterials} />
								<StatRow label="纹理总数" value={this.state.statsValues?.totalTextures} />
								<StatRow label="灯光总数" value={this.state.statsValues?.totalLights} />
							</DropdownMenuLabel>
						</DropdownMenuContent>
					</DropdownMenu>
				</TooltipProvider>
			</div>
		);
	}

	private _switchToCamera(id: string): void {
		const camera = this.scene.cameras.find((c) => c.id === id);
		if (!camera) {
			return;
		}

		if (this.scene.activeCamera) {
			saveRenderingConfigurationForCamera(this.scene.activeCamera);
		}

		this.scene.activeCamera?.detachControl();

		this.scene.activeCamera = camera;
		if (!isNodeLocked(camera)) {
			this.scene.activeCamera?.attachControl(true);
		}

		_GetAudioEngine(null).listener.attach(camera);

		disposeSSAO2RenderingPipeline();
		disposeVLSPostProcess(this.props.editor);
		disposeSSRRenderingPipeline();
		disposeMotionBlurPostProcess();
		disposeDefaultRenderingPipeline();
		disposeTAARenderingPipeline();

		const ssao2Pipeline = ssaoRenderingPipelineCameraConfigurations.get(camera);
		if (ssao2Pipeline) {
			parseSSAO2RenderingPipeline(this.props.editor, ssao2Pipeline);
		}

		const vlsPostProcess = vlsPostProcessCameraConfigurations.get(camera);
		if (vlsPostProcess) {
			parseVLSPostProcess(this.props.editor, vlsPostProcess);
		}

		const ssrPipeline = ssrRenderingPipelineCameraConfigurations.get(camera);
		if (ssrPipeline) {
			parseSSRRenderingPipeline(this.props.editor, ssrPipeline);
		}

		const motionBlurPostProcess = motionBlurPostProcessCameraConfigurations.get(camera);
		if (motionBlurPostProcess) {
			parseMotionBlurPostProcess(this.props.editor, motionBlurPostProcess);
		}

		const defaultRenderingPipeline = defaultPipelineCameraConfigurations.get(camera);
		if (defaultRenderingPipeline) {
			parseDefaultRenderingPipeline(this.props.editor, defaultRenderingPipeline);
		}

		const taaRenderingPipeline = taaPipelineCameraConfigurations.get(camera);
		if (taaRenderingPipeline) {
			parseTAARenderingPipeline(this.props.editor, taaRenderingPipeline);
		}

		this.scene.lights.forEach((light) => {
			light.getShadowGenerators()?.forEach((shadowGenerator) => {
				const shadowMap = shadowGenerator.getShadowMap();
				if (shadowMap) {
					shadowMap.activeCamera = camera;
				}
			});
		});

		this.props.editor.layout.inspector.forceUpdate();

		if (this._previewCamera === camera) {
			this.setCameraPreviewActive(null);
		}
	}

	/**
	 * Sets the currently active gizmo. Set "none" to deactivate the gizmo.
	 * @param gizmo defines the type of gizmo to activate.
	 */
	public setActiveGizmo(gizmo: EditorPreviewGizmoType): void {
		if (this.state.activeGizmo === gizmo) {
			gizmo = "none";
		}

		this.gizmo.setGizmoType(gizmo);
		this.setState({ activeGizmo: gizmo });
	}

	public async importSceneFile(absolutePath: string, useCloudConverter: boolean): Promise<ISceneLoaderAsyncResult | null> {
		if (useCloudConverter) {
			const extension = extname(absolutePath).toLowerCase();
			switch (extension) {
				case ".fbx":
				case ".blend":
					let progressRef: EditorPreviewConvertProgress;
					this.setState({
						informationMessage: <EditorPreviewConvertProgress absolutePath={absolutePath} ref={(r) => (progressRef = r!)} />,
					});

					const newAbsolutePath = await tryConvertSceneFile(absolutePath, (value) => progressRef?.setState({ value }));

					if (newAbsolutePath) {
						absolutePath = newAbsolutePath;
					} else {
						useCloudConverter = false;

						toast.error("Failed to convert the file. Fallback on local Assimp loader.");
						this.setState({
							informationMessage: null,
						});
					}
					break;
			}
		}

		this.setState({ informationMessage: `Importing scene "${basename(absolutePath)}"...` });
		const result = await loadImportedSceneFile(this.scene, absolutePath);
		this.setState({ informationMessage: "" });

		return result;
	}

	private async _handleDrop(ev: React.DragEvent<HTMLCanvasElement>): Promise<void> {
		ev.preventDefault();
		ev.stopPropagation();

		const assets = ev.dataTransfer.getData("assets");
		if (assets) {
			return this._handleAssetsDropped(ev);
		}

		const graphNode = ev.dataTransfer.getData("graph/node");
		if (graphNode) {
			return this._handleGraphNodesDropped(ev);
		}

		const sprite = ev.dataTransfer.getData("sprite");
		if (sprite) {
			return this._handleSpritesDropped(ev);
		}

		if (ev.dataTransfer.files.length) {
			return this._handleExternalFilesDropped(ev);
		}
	}

	private _handleGraphNodesDropped(ev: React.DragEvent<HTMLCanvasElement>): void {
		const pickedPoint = this._getDropPoint(ev);

		if (!pickedPoint) {
			return;
		}

		const nodesToMove = this.props.editor.layout.graph.getSelectedNodes();
		const oldPositionsMap = new Map<unknown, Vector3>();

		nodesToMove.forEach((n) => {
			if (isAnyTransformNode(n.nodeData) || isAbstractMesh(n.nodeData)) {
				oldPositionsMap.set(n.nodeData, n.nodeData.getAbsolutePosition().clone());
			} else if (isSprite(n.nodeData)) {
				oldPositionsMap.set(n.nodeData, n.nodeData.position.clone());
			}
		});

		registerUndoRedo({
			executeRedo: true,
			undo: () => {
				nodesToMove.forEach((n) => {
					if (oldPositionsMap.has(n.nodeData)) {
						if (isAnyTransformNode(n.nodeData) || isAbstractMesh(n.nodeData)) {
							n.nodeData.setAbsolutePosition(oldPositionsMap.get(n.nodeData)!);
						} else if (isSprite(n.nodeData)) {
							n.nodeData.position.copyFrom(oldPositionsMap.get(n.nodeData)!);
						}
					}
				});
			},
			redo: () => {
				nodesToMove.forEach((n) => {
					if (isAnyTransformNode(n.nodeData) || isAbstractMesh(n.nodeData)) {
						n.nodeData.setAbsolutePosition(pickedPoint);
					} else if (isSprite(n.nodeData)) {
						n.nodeData.position.copyFrom(pickedPoint);
					}
				});
			},
		});
	}

	private _handleSpritesDropped(ev: React.DragEvent<HTMLCanvasElement>): void {
		const data = JSON.parse(ev.dataTransfer.getData("sprite"));
		const spriteNode = this.scene.getNodeById(data.spriteNodeId);

		if (!isSpriteManagerNode(spriteNode) || !spriteNode.spriteManager) {
			return;
		}

		const pickedPoint = this._getDropPoint(ev);
		if (!pickedPoint) {
			return;
		}

		const sprite = new Sprite(`sprite-${spriteNode.spriteManager.sprites.length}`, spriteNode.spriteManager);
		sprite.size = 100;
		sprite.uniqueId = UniqueNumber.Get();

		if (data.cellRef) {
			sprite.cellRef = data.cellRef;

			sprite.width = spriteNode.atlasJson.frames[data.cellRef].sourceSize.w;
			sprite.height = spriteNode.atlasJson.frames[data.cellRef].sourceSize.h;
		} else if (data.cellIndex !== undefined) {
			sprite.cellIndex = data.cellIndex;
		}

		sprite.position.copyFrom(pickedPoint);

		this.gizmo.setAttachedObject(sprite);
		this.props.editor.layout.graph.refresh();
	}

	private _handleAssetsDropped(ev: React.DragEvent<HTMLCanvasElement>): void {
		const absolutePaths = this.props.editor.layout.assets.state.selectedKeys;
		const dropCoordinates = this._getDragPickCoordinates(ev);
		const dropPoint = this._getDropPointAt(dropCoordinates);
		const dropPick = this._getDropPickingInfoAt(dropCoordinates);
		const dropMesh = dropPick.pickedMesh?._masterMesh ?? dropPick.pickedMesh;
		const useCloudConverter = ev.shiftKey;

		absolutePaths.forEach(async (absolutePath) => {
			await waitNextAnimationFrame();

			const extension = extname(absolutePath).toLowerCase();
			switch (extension) {
				case ".x":
				case ".b3d":
				case ".dae":
				case ".glb":
				case ".gltf":
				case ".fbx":
				case ".stl":
				case ".lwo":
				case ".dxf":
				case ".obj":
				case ".3ds":
				case ".ms3d":
				case ".blend":
				case ".babylon":
					if (!dropPoint) {
						return;
					}

					await this._importModelAsset(absolutePath, useCloudConverter, dropPoint?.clone());
					break;

				case ".env":
				case ".jpg":
				case ".png":
				case ".webp":
				case ".bmp":
				case ".jpeg":
					applyTextureAssetToObject(this.props.editor, dropMesh ?? this.scene, absolutePath);
					break;

				case ".material":
					applyMaterialAssetToObject(this.props.editor, dropMesh, absolutePath);
					break;

				case ".scene":
					if (!dropPoint) {
						return;
					}

					createSceneLink(this.props.editor, absolutePath).then((node) => {
						this.setRenderScene(true);
						node?.position.addInPlace(dropPoint);
					});
					break;

				// case ".gui":
				// 	if (this.props.editor.state.enableExperimentalFeatures) {
				// 		applyImportedGuiFile(this.props.editor, absolutePath).then(() => {
				// 			this.props.editor.layout.graph.refresh();
				// 		});
				// 	}
				// 	break;

				case ".mp3":
				case ".ogg":
				case ".wav":
				case ".wave":
					applySoundAsset(this.props.editor, dropMesh ?? this.scene, absolutePath).then(() => {
						this.props.editor.layout.graph.refresh();
					});
					break;

				case ".npss":
					if (dropMesh) {
						loadImportedParticleSystemFile(this.props.editor.layout.preview.scene, dropMesh, absolutePath).then(() => {
							this.props.editor.layout.graph.refresh();
						});
					}
					break;
			}
		});
	}

	/**
	 * 处理从系统文件管理器拖入画布的模型文件，并将整个模型包复制到项目 assets 目录。
	 */
	private async _handleExternalFilesDropped(ev: React.DragEvent<HTMLCanvasElement>): Promise<void> {
		if (!this.props.editor.state.projectPath) {
			return;
		}

		const modelFiles = Array.from(ev.dataTransfer.files)
			.map((file) => normalizeSidecarPath(webUtils.getPathForFile(file)))
			.filter((path) => path && isSupportedModelSidecarFile(path));

		if (!modelFiles.length) {
			return;
		}

		const pickedPoint = this._getDropPoint(ev);
		if (!pickedPoint) {
			return;
		}

		for (const modelFile of modelFiles) {
			try {
				const projectModelPath = await prepareExternalModelSidecarPackage(this.props.editor.state.projectPath, modelFile);
				await this._importModelAsset(projectModelPath, ev.shiftKey, pickedPoint?.clone());
			} catch (e) {
				console.error(e);
				toast.error(`无法导入模型包 "${basename(modelFile)}"。`);
			}
		}

		this.props.editor.layout.assets.refresh();
	}

	/**
	 * 导入模型并在存在同目录外挂脚本时绑定参数脚本和动画驱动脚本。
	 */
	private async _importModelAsset(absolutePath: string, useCloudConverter: boolean, position?: Vector3): Promise<void> {
		const result = await this.importSceneFile(absolutePath, useCloudConverter);
		if (!result || !this.props.editor.state.projectPath) {
			return;
		}

		const sidecar = await discoverModelSidecar(this.props.editor.state.projectPath, absolutePath);
		const sidecarRoot = sidecar ? applyModelSidecarToImport(this.scene, result, sidecar) : null;
		const autoFitImportedModel = [".glb", ".gltf"].includes(extname(absolutePath).toLowerCase());

		if (!autoFitImportedModel) {
			if (position) {
				if (sidecarRoot) {
					sidecarRoot.position.addInPlace(position);
				} else {
					result.meshes.forEach((m) => !m.parent && m.position.addInPlace(position));
					result.transformNodes.forEach((t) => !t.parent && t.position.addInPlace(position));
				}
			}

			if (sidecarRoot) {
				this.gizmo.setAttachedObject(sidecarRoot);
				this.props.editor.layout.graph.setSelectedNode(sidecarRoot);
				this.props.editor.layout.inspector.setEditedObject(sidecarRoot);
				this.props.editor.layout.graph.refresh();
				await waitNextAnimationFrame();
				this.focusObject(sidecarRoot);
			}

			return;
		}

		const root = this._getImportedModelRoot(result, absolutePath, sidecarRoot);
		if (!root) {
			return;
		}

		this._fitImportedModelToDropPoint(root, position);
		this.gizmo.setAttachedObject(root);
		this.props.editor.layout.graph.setSelectedNode(root);
		this.props.editor.layout.inspector.setEditedObject(root);
		this.props.editor.layout.animations.setEditedObject(root);
		this.props.editor.layout.graph.refresh();
		await waitNextAnimationFrame();
		this.focusObject(root);
	}
}
