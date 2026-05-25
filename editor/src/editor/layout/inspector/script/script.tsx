import { extname, join, dirname } from "path/posix";

import { toast } from "sonner";
import { Component, DragEvent, ReactNode } from "react";

import { Tools } from "babylonjs";

import { Editor } from "../../../main";

import { registerUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorSectionField } from "../fields/section";
import { EditorInspectorListField } from "../fields/list";

import { InspectorScriptField } from "./field";

import { IModelSidecarMetadata, IModelSidecarScriptRecord, isModelSidecarScript, setSelectedModelSidecarAnimation } from "../../../../tools/model-sidecar";

export interface IScriptInspectorComponent {
	object: any;
	editor: Editor;
}

export interface IScriptInspectorComponentState {
	dragOver: boolean;
	scriptFound: boolean;
}

export class ScriptInspectorComponent extends Component<IScriptInspectorComponent, IScriptInspectorComponentState> {
	public constructor(props: IScriptInspectorComponent) {
		super(props);

		this.state = {
			dragOver: false,
			scriptFound: true,
		};
	}

	public render(): ReactNode {
		const scripts = (this.props.object.metadata?.scripts ?? []) as IModelSidecarScriptRecord[];
		const regularScripts = scripts.map((script, index) => ({ script, index })).filter(({ script }) => !isModelSidecarScript(script));

		return (
			<>
				{this._getModelSidecarComponent()}

				<EditorInspectorSectionField title="Scripts">
					{regularScripts.map(({ script, index }) => {
						script._id ??= Tools.RandomId();

						return (
							<InspectorScriptField
								key={script._id}
								script={script}
								scriptIndex={index}
								editor={this.props.editor}
								object={this.props.object}
								onRemove={() => this._handleRemoveScript(index)}
							/>
						);
					})}

					{this._getEmptyComponent()}
				</EditorInspectorSectionField>
			</>
		);
	}

	private _handleRemoveScript(index: number): void {
		const script = this.props.object.metadata?.scripts?.[index];

		registerUndoRedo({
			executeRedo: true,
			undo: () => this.props.object.metadata?.scripts?.splice(index, 0, script),
			redo: () => this.props.object.metadata?.scripts?.splice(index, 1),
		});

		this.forceUpdate();
	}

	/**
	 * 渲染模型同目录外挂脚本区域，负责展示参数脚本并选择动画驱动脚本。
	 */
	private _getModelSidecarComponent(): ReactNode {
		const sidecar = this.props.object.metadata?.modelSidecar as IModelSidecarMetadata | undefined;
		if (!sidecar) {
			return null;
		}

		const scripts = (this.props.object.metadata?.scripts ?? []) as IModelSidecarScriptRecord[];
		const paramsScriptIndex = scripts.findIndex((script) => script.root === "project" && script.kind === "params" && script.key === sidecar.paramsScriptKey);
		const paramsScript = paramsScriptIndex !== -1 ? scripts[paramsScriptIndex] : null;
		const noAnimationValue = "__model_sidecar_no_animation__";
		const animationSelection = {
			value: sidecar.selectedAnimationKey ?? noAnimationValue,
		};

		return (
			<EditorInspectorSectionField title="模型外挂脚本">
				<div className="flex flex-col gap-2">
					<div className="text-xs text-muted-foreground px-2">模型：{sidecar.modelPath}</div>

					{paramsScript ? (
						<InspectorScriptField
							hideRemove
							script={paramsScript}
							scriptIndex={paramsScriptIndex}
							editor={this.props.editor}
							object={this.props.object}
							onRemove={() => undefined}
						/>
					) : (
						<div className="text-sm text-muted-foreground px-2">未发现参数脚本。</div>
					)}

					{sidecar.animationScripts.length > 0 ? (
						<EditorInspectorListField
							noUndoRedo
							search={sidecar.animationScripts.length > 5}
							object={animationSelection}
							property="value"
							label="动画脚本"
							items={[
								{
									text: "不启用动画脚本",
									value: noAnimationValue,
								},
								...sidecar.animationScripts.map((script) => ({
									text: script.name,
									value: script.key,
									label: script.key,
								})),
							]}
							onChange={(value) => this._handleSelectModelSidecarAnimation(value === noAnimationValue ? null : value)}
						/>
					) : (
						<div className="text-sm text-muted-foreground px-2">未发现动画驱动脚本。</div>
					)}
				</div>
			</EditorInspectorSectionField>
		);
	}

	/**
	 * 记录模型动画驱动脚本选择，并同步脚本启用状态以便运行时只执行当前驱动脚本。
	 */
	private _handleSelectModelSidecarAnimation(selectedAnimationKey: string | null): void {
		const oldValue = (this.props.object.metadata?.modelSidecar as IModelSidecarMetadata | undefined)?.selectedAnimationKey ?? null;

		registerUndoRedo({
			executeRedo: true,
			undo: () => {
				setSelectedModelSidecarAnimation(this.props.object, oldValue);
				this.forceUpdate();
			},
			redo: () => {
				setSelectedModelSidecarAnimation(this.props.object, selectedAnimationKey);
				this.forceUpdate();
			},
		});
	}

	private _getEmptyComponent(): ReactNode {
		return (
			<div
				onDrop={(ev) => this._handleDropEmptyComponent(ev)}
				onDragLeave={() => this.setState({ dragOver: false })}
				onDragOver={(ev) => this._handleDragOverEmptyComponent(ev)}
				className={`flex flex-col justify-center items-center w-full h-[64px] rounded-lg border-[1px] border-secondary-foreground/35 border-dashed ${this.state.dragOver ? "bg-secondary-foreground/35" : ""} transition-all duration-300 ease-in-out`}
			>
				<div className="font-semibold text-muted-foreground">Drag'n'drop a script here</div>
			</div>
		);
	}

	private _handleDragOverEmptyComponent(ev: DragEvent<HTMLDivElement>): void {
		ev.preventDefault();
		ev.stopPropagation();

		this.setState({ dragOver: true });
	}

	private _handleDropEmptyComponent(ev: DragEvent<HTMLDivElement>): void {
		ev.preventDefault();
		ev.stopPropagation();

		this.setState({ dragOver: false });

		if (!this.props.editor.state.projectPath) {
			return;
		}

		const absolutePaths = JSON.parse(ev.dataTransfer.getData("assets")) as string[];
		if (!Array.isArray(absolutePaths)) {
			return;
		}

		const files = absolutePaths.filter((path) => {
			const extension = extname(path).toLowerCase();
			return extension === ".ts" || extension === ".tsx";
		});

		if (!files.length) {
			return;
		}

		const projectDir = dirname(this.props.editor.state.projectPath!);

		this.props.object.metadata ??= {};
		this.props.object.metadata.scripts ??= [];

		files.forEach((file) => {
			const relativePath = file.replace(join(projectDir, "/src/"), "").replace(/\\/g, "/");
			if (relativePath === file) {
				return;
			}

			if (this.props.object.metadata.scripts.find((script) => script.key === relativePath)) {
				return toast.warning(`Script '${relativePath}' is already attached to the object.`);
			}

			registerUndoRedo({
				executeRedo: true,
				undo: () => this.props.object.metadata.scripts.pop(),
				redo: () => {
					this.props.object.metadata.scripts.push({
						enabled: true,
						key: relativePath,
					});
				},
			});
		});

		this.forceUpdate();
	}
}
