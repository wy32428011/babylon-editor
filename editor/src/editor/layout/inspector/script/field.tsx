import { clipboard } from "electron";
import { FSWatcher } from "chokidar";
import { join, dirname } from "path/posix";
import { pathExists, stat } from "fs-extra";

import { useEffect, useState } from "react";

import { FaCopy } from "react-icons/fa";
import { SiTypescript } from "react-icons/si";

import { XMarkIcon } from "@heroicons/react/20/solid";

import { toast } from "sonner";

import { Vector2, Vector3, Color3, Color4, Texture, CubeTexture } from "babylonjs";
import {
	applyModelSidecarParametersToObject,
	ModelSidecarParametersApplyReason,
	VisibleInInspectorDecoratorEntityConfiguration,
	VisibleInInspectorDecoratorStringConfiguration,
	VisibleInspectorDecoratorAssetConfiguration,
} from "babylonjs-editor-tools";

import { Editor } from "../../../main";

import { Button } from "../../../../ui/shadcn/ui/button";

import { watchFile } from "../../../../tools/fs";
import { execNodePty } from "../../../../tools/node-pty";
import { registerUndoRedo } from "../../../../tools/undoredo";
import { executeSimpleWorker } from "../../../../tools/worker";
import { cloneJSObject, UniqueNumber } from "../../../../tools/tools";
import { ensureTemporaryDirectoryExists } from "../../../../tools/project";

import { configureImportedTexture } from "../../preview/import/import";

import { projectConfiguration } from "../../../../project/configuration";

import { getScriptAbsolutePath } from "../../../../tools/model-sidecar";

import { EditorInspectorKeyField } from "../fields/key";
import { EditorInspectorListField } from "../fields/list";
import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorAssetField } from "../fields/asset";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorVectorField } from "../fields/vector";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorTextureField } from "../fields/texture";
import { EditorInspectorSceneEntityField } from "../fields/entity";

import { ScriptInspectorValue, VisibleInInspectorDecoratorObject, computeDefaultValuesForObject, scriptValues } from "./tools";

const cachedScripts: Record<
	string,
	{
		time: number;
		output: VisibleInInspectorDecoratorObject[] | null;
		outputAbsolutePath: string;
		scriptExports?: any;
	}
> = {};

export interface IInspectorScriptFieldProps {
	object: any;
	script: any;
	scriptIndex: number;
	editor: Editor;
	hideRemove?: boolean;

	onRemove: () => void;
}

const textures: (Texture | CubeTexture)[] = [];

export function InspectorScriptField(props: IInspectorScriptFieldProps) {
	let srcAbsolutePath = "";
	if (projectConfiguration.path) {
		srcAbsolutePath = getScriptAbsolutePath(dirname(projectConfiguration.path), props.script);
	}

	const [exists, setExists] = useState<boolean | null>(null);
	const [enabled, setEnabled] = useState(props.script.enabled);
	const [output, setOutput] = useState<VisibleInInspectorDecoratorObject[] | null>(null);

	const [watcher, setWatcher] = useState<FSWatcher | null>(null);

	const [updateId, setUpdateId] = useState(0); // 用于纹理或脚本默认值变化后强制刷新字段。

	useEffect(() => {
		const output = cachedScripts[srcAbsolutePath]?.output;
		if (output) {
			computeDefaultValuesForObject(props.script, output, {
				syncDefaultValues: isModelSidecarParametersScript(),
			});
			setOutput(output);
			handleApplyModelSidecarParameters();
		}

		return () => {
			textures.forEach((texture) => {
				texture.dispose();
			});

			textures.splice(0, textures.length);
		};
	}, []);

	useEffect(() => {
		return () => {
			watcher?.close();
		};
	}, [watcher]);

	useEffect(() => {
		checkExists();
	}, [props.script]);

	useEffect(() => {
		if (exists) {
			handleParseVisibleProperties();
		}
	}, [exists]);

	async function checkExists() {
		if (!projectConfiguration.path) {
			return;
		}

		const src = getScriptAbsolutePath(dirname(projectConfiguration.path), props.script);
		const exists = await pathExists(src);

		setExists(exists);

		if (exists) {
			const watcher = watchFile(src, () => {
				handleParseVisibleProperties();
			});

			setWatcher(watcher);
		}
	}

	async function handleParseVisibleProperties() {
		if (!projectConfiguration.path) {
			return;
		}

		const fStat = await stat(srcAbsolutePath);
		const cached = cachedScripts[srcAbsolutePath];
		const previousOutput = cached?.output ?? null;

		if (!cached || cached.time !== fStat.mtimeMs) {
			const temporaryDirectory = await ensureTemporaryDirectoryExists(projectConfiguration.path);
			const outputAbsolutePath = join(temporaryDirectory, "scripts", `${props.script.key.replace(/\//g, "_")}.cjs`);

			const compilationSuccess = await executeSimpleWorker<{ success: boolean; error?: string }>("workers/script.js", {
				action: "compile",
				srcAbsolutePath,
				outputAbsolutePath,
			});

			if (!compilationSuccess.success) {
				return props.editor.layout.console.error(`An unexpected error occurred while compiling the script:\n ${compilationSuccess.error}`);
			}

			const extractOutput = await executeSimpleWorker<VisibleInInspectorDecoratorObject[] | null>("workers/script.js", {
				action: "extract",
				outputAbsolutePath,
			});

			cachedScripts[srcAbsolutePath] = {
				time: fStat.mtimeMs,
				output: extractOutput,
				outputAbsolutePath,
				scriptExports: undefined,
			};

		}

		const currentOutput = cachedScripts[srcAbsolutePath]?.output;
		if (currentOutput) {
			computeDefaultValuesForObject(props.script, currentOutput, {
				previousOutput,
				syncDefaultValues: isModelSidecarParametersScript(),
			});
			setUpdateId((id) => id + 1);
		}

		setOutput(currentOutput);
		handleApplyModelSidecarParameters();
	}

	function getEntityInspector(value: VisibleInInspectorDecoratorObject) {
		const entityType = (value.configuration as VisibleInInspectorDecoratorEntityConfiguration).entityType;

		switch (entityType) {
			case "node":
			case "particleSystem":
			case "sound":
				return (
					<EditorInspectorSceneEntityField
						noUndoRedo
						type={entityType}
						key={value.propertyKey}
						object={props.script[scriptValues][value.propertyKey]}
						property="value"
						scene={props.editor.layout.preview.scene}
						label={value.label ?? value.propertyKey}
						tooltip={value.configuration.description}
						onChange={(v) => {
							const oldValue = props.script[scriptValues][value.propertyKey].value;

							registerParameterValueUndoRedo(value.propertyKey, oldValue, v?.id);
						}}
					/>
				);

			case "animationGroup":
				return (
					<EditorInspectorListField
						key={value.propertyKey}
						noUndoRedo={isModelSidecarParametersScript()}
						object={props.script[scriptValues][value.propertyKey]}
						property="value"
						label={value.label ?? value.propertyKey}
						tooltip={value.configuration.description}
						items={props.editor.layout.preview.scene.animationGroups.map((animationGroup) => ({
							text: animationGroup.name,
							value: animationGroup.name,
						}))}
						search={props.editor.layout.preview.scene.animationGroups.length > 5}
						onChange={(newValue, oldValue) => {
							if (isModelSidecarParametersScript()) {
								registerParameterValueUndoRedo(value.propertyKey, oldValue, newValue);
							}
						}}
					/>
				);
		}
	}

	function getTextureInspector(value: VisibleInInspectorDecoratorObject) {
		let texture: Texture | CubeTexture | null = null;

		const serializedTexture = props.script[scriptValues][value.propertyKey]?.value;
		const existingTexture = textures.find((texture) => texture.uniqueId === serializedTexture?.uniqueId);

		if (!existingTexture && serializedTexture) {
			const rootUrl = join(dirname(projectConfiguration.path!), "/");
			const parsedTexture = Texture.Parse(serializedTexture, props.editor.layout.preview.scene, rootUrl) as Texture | CubeTexture;

			if (parsedTexture) {
				texture = configureImportedTexture(parsedTexture);
				texture.uniqueId = serializedTexture?.uniqueId ?? UniqueNumber.Get();
				textures.push(texture);
			}
		}

		const tempTexture = {
			value: texture,
		};

		return (
			<EditorInspectorTextureField
				noUndoRedo
				key={value.propertyKey}
				object={tempTexture}
				property="value"
				title={value.label ?? value.propertyKey}
				scene={props.editor.layout.preview.scene}
				acceptCubeTexture={value.configuration.acceptCubes}
				onChange={(v) => {
					const oldSerializedTexture = props.script[scriptValues][value.propertyKey].value;

					registerParameterValueUndoRedo(value.propertyKey, oldSerializedTexture, v?.serialize() ?? null);

					setUpdateId(updateId + 1);
				}}
			/>
		);
	}

	function handleCopyName(): void {
		clipboard.writeText(props.script.key);
		toast.success("名称已复制到剪贴板。");
	}

	/**
	 * 判断当前脚本是否是模型参数脚本，只有该类脚本需要在 Inspector 变更时实时应用。
	 */
	function isModelSidecarParametersScript(): boolean {
		return props.script.root === "project" && props.script.kind === "params";
	}

	/**
	 * 克隆脚本字段值，避免撤销/重做记录被后续数组或对象引用修改污染。
	 * @param value 定义需要记录的脚本字段值。
	 */
	function cloneParameterValue<T>(value: T): T {
		if (value === null || value === undefined || typeof value !== "object") {
			return value;
		}

		return cloneJSObject(value);
	}

	/**
	 * 获取脚本字段保存记录，集中处理 values 缺失或字段不存在的边界。
	 * @param propertyKey 定义脚本字段名。
	 */
	function getParameterValueRecord(propertyKey: string): ScriptInspectorValue | undefined {
		return props.script[scriptValues]?.[propertyKey] as ScriptInspectorValue | undefined;
	}

	/**
	 * 读取脚本字段的手动覆盖状态，普通脚本没有该标记时保持 undefined。
	 * @param propertyKey 定义脚本字段名。
	 */
	function getParameterOverridden(propertyKey: string): boolean | undefined {
		const value = getParameterValueRecord(propertyKey);
		return typeof value?.overridden === "boolean" ? value.overridden : undefined;
	}

	/**
	 * 设置脚本字段值，并保持数组、对象等复合值互不共享引用。
	 * @param propertyKey 定义脚本字段名。
	 * @param value 定义即将写入的字段值。
	 * @param overridden 定义是否将该字段标记为 Inspector 手动覆盖。
	 */
	function setParameterValue(propertyKey: string, value: any, overridden?: boolean): void {
		const record = getParameterValueRecord(propertyKey);
		if (!record) {
			return;
		}

		record.value = cloneParameterValue(value);
		if (overridden !== undefined) {
			record.overridden = overridden;
		}
	}

	/**
	 * 注册脚本字段撤销/重做，并在每次状态切换后重新应用模型参数。
	 * @param propertyKey 定义脚本字段名。
	 * @param oldValue 定义撤销时恢复的旧值。
	 * @param newValue 定义重做时应用的新值。
	 */
	function registerParameterValueUndoRedo(propertyKey: string, oldValue: any, newValue: any): void {
		const oldValueCopy = cloneParameterValue(oldValue);
		const newValueCopy = cloneParameterValue(newValue);
		const oldOverridden = getParameterOverridden(propertyKey);
		const newOverridden = isModelSidecarParametersScript() ? true : oldOverridden;

		registerUndoRedo({
			executeRedo: true,
			undo: () => {
				setParameterValue(propertyKey, oldValueCopy, oldOverridden);
				handleApplyModelSidecarParameters();
			},
			redo: () => {
				setParameterValue(propertyKey, newValueCopy, newOverridden);
				handleApplyModelSidecarParameters();
			},
		});
	}

	/**
	 * 临时加载编译后的参数脚本，并调用约定的 onApplyParameters 入口。
	 * @param reason 定义本次应用来自编辑器还是运行时，编辑器侧固定传入 editor。
	 */
	function handleApplyModelSidecarParameters(reason: ModelSidecarParametersApplyReason = "editor"): void {
		if (!isModelSidecarParametersScript() || !projectConfiguration.path) {
			return;
		}

		const cached = cachedScripts[srcAbsolutePath];
		if (!cached?.outputAbsolutePath) {
			return;
		}

		try {
			if (!cached.scriptExports) {
				const outputAbsolutePath = require.resolve(cached.outputAbsolutePath);
				delete require.cache[outputAbsolutePath];
				cached.scriptExports = require(outputAbsolutePath);
			}

			const rootUrl = join(dirname(projectConfiguration.path), "/");
			applyModelSidecarParametersToObject(props.editor.layout.preview.scene as any, props.object, props.script, cached.scriptExports, rootUrl, reason);
			refreshModelSidecarBounds();
		} catch (e) {
			console.error(`Failed to apply model sidecar parameters for script "${props.script.key}".`, e);
		}
	}

	/**
	 * 参数脚本修改内部部件缩放后刷新世界矩阵和包围盒，保证选框、聚焦和渲染使用最新尺寸。
	 */
	function refreshModelSidecarBounds(): void {
		props.object.computeWorldMatrix?.(true);

		const childMeshes = props.object.getChildMeshes?.(false) ?? [];
		const meshes = props.object.getTotalVertices ? [props.object, ...childMeshes] : childMeshes;
		meshes.forEach((mesh) => {
			mesh.computeWorldMatrix?.(true);
			if ((mesh.getTotalVertices?.() ?? 0) > 0) {
				mesh.refreshBoundingInfo?.({
					applyMorph: true,
					applySkeleton: true,
					updatePositionsArray: true,
				});
			}
		});

		props.editor.layout.preview.scene.render();
	}

	return (
		<div className="flex flex-col gap-2 bg-muted-foreground/35 dark:bg-muted-foreground/5 rounded-lg px-5 pb-2.5">
			<div className="flex gap-[10px]">
				<SiTypescript size="80px" className={`${enabled ? "opacity-100" : "opacity-15"} transition-all duration-300 ease-in-out`} />

				<div className="flex flex-col gap-1 w-full py-2.5">
					<div className="flex items-center">
						<div
							onClick={() => srcAbsolutePath && exists && execNodePty(`code "${srcAbsolutePath}"`)}
							className={`font-bold px-2 hover:underline transition-all duration-300 ease-in-out cursor-pointer ${exists !== false ? "" : "text-red-400"}`}
						>
							{props.script.key} {exists !== false ? "" : "(Not found)"}
						</div>

						<Button disabled={!exists} variant="ghost" className="w-6 h-6 p-1" onClick={() => handleCopyName()}>
							<FaCopy className="w-4 h-4" />
						</Button>
					</div>

					<EditorInspectorSwitchField object={props.script} property="enabled" label="启用" onChange={(v) => setEnabled(v)} />
				</div>

				{!props.hideRemove && (
					<div
						className="flex justify-center items-center w-10 h-10 p-1 hover:bg-secondary rounded-lg my-auto transition-all duration-300"
						onClick={() => props.onRemove()}
					>
						<XMarkIcon className="w-6 h-6" />
					</div>
				)}
			</div>

			{output && (
				<div className="flex flex-col gap-2">
					{output.map((value) => {
						switch (value.configuration.type) {
							case "boolean":
								return (
									<EditorInspectorSwitchField
										key={value.propertyKey}
										object={props.script[scriptValues][value.propertyKey]}
										property="value"
										label={value.label ?? value.propertyKey}
										tooltip={value.configuration.description}
										noUndoRedo={isModelSidecarParametersScript()}
										onChange={(v) => {
											if (isModelSidecarParametersScript()) {
												registerParameterValueUndoRedo(value.propertyKey, !v, v);
											}
										}}
									/>
								);

							case "number":
								return (
									<EditorInspectorNumberField
										key={value.propertyKey}
										object={props.script[scriptValues][value.propertyKey]}
										property="value"
										label={value.label ?? value.propertyKey}
										min={value.configuration.min}
										max={value.configuration.max}
										step={value.configuration.step}
										tooltip={value.configuration.description}
										noUndoRedo={isModelSidecarParametersScript()}
										onChange={() => handleApplyModelSidecarParameters()}
										onFinishChange={(newValue, oldValue) => {
											if (isModelSidecarParametersScript()) {
												registerParameterValueUndoRedo(value.propertyKey, oldValue, newValue);
											}
										}}
									/>
								);

							case "string":
								return (
									<EditorInspectorStringField
										key={value.propertyKey}
										object={props.script[scriptValues][value.propertyKey]}
										property="value"
										label={value.label ?? value.propertyKey}
										tooltip={value.configuration.description}
										multiline={(value.configuration as VisibleInInspectorDecoratorStringConfiguration).multiline}
										noUndoRedo={isModelSidecarParametersScript()}
										onChange={() => handleApplyModelSidecarParameters()}
										onFinishChange={(newValue, oldValue) => {
											if (isModelSidecarParametersScript()) {
												registerParameterValueUndoRedo(value.propertyKey, oldValue, newValue);
											}
										}}
									/>
								);

							case "vector2":
							case "vector3":
								const tempVector = {
									value:
										value.configuration.type === "vector2"
											? Vector2.FromArray(props.script[scriptValues][value.propertyKey].value)
											: Vector3.FromArray(props.script[scriptValues][value.propertyKey].value),
								};

								return (
									<EditorInspectorVectorField
										noUndoRedo
										key={value.propertyKey}
										object={tempVector}
										property="value"
										label={value.label ?? value.propertyKey}
										asDegrees={value.configuration.asDegrees}
										onChange={() => {
											const scriptCopy = cloneJSObject(props.script);

											props.script[scriptValues][value.propertyKey].value = tempVector.value.asArray();
											handleApplyModelSidecarParameters();
											props.script[scriptValues][value.propertyKey].value = scriptCopy[scriptValues][value.propertyKey].value;
										}}
										onFinishChange={() => {
											const oldValue = props.script[scriptValues][value.propertyKey].value.slice();

											registerParameterValueUndoRedo(value.propertyKey, oldValue, tempVector.value.asArray());
										}}
										tooltip={value.configuration.description}
									/>
								);

							case "color3":
							case "color4":
								const tempColor = {
									value:
										value.configuration.type === "color3"
											? Color3.FromArray(props.script[scriptValues][value.propertyKey].value)
											: Color4.FromArray(props.script[scriptValues][value.propertyKey].value),
								};

								return (
									<EditorInspectorColorField
										noUndoRedo
										key={value.propertyKey}
										object={tempColor}
										property="value"
										label={value.label ?? value.propertyKey}
										noClamp={value.configuration.noClamp}
										noColorPicker={value.configuration.noColorPicker}
										onChange={() => {
											const scriptCopy = cloneJSObject(props.script);

											props.script[scriptValues][value.propertyKey].value = tempColor.value.asArray();
											handleApplyModelSidecarParameters();
											props.script[scriptValues][value.propertyKey].value = scriptCopy[scriptValues][value.propertyKey].value;
										}}
										onFinishChange={() => {
											const oldValue = props.script[scriptValues][value.propertyKey].value.slice();

											registerParameterValueUndoRedo(value.propertyKey, oldValue, tempColor.value.asArray());
										}}
										tooltip={value.configuration.description}
									/>
								);

							case "keymap":
								return (
									<EditorInspectorKeyField
										key={value.propertyKey}
										value={props.script[scriptValues][value.propertyKey]?.value?.toString() ?? ""}
										label={value.label ?? value.propertyKey}
										onChange={(v) => {
											const oldValue = props.script[scriptValues][value.propertyKey].value;
											registerParameterValueUndoRedo(value.propertyKey, oldValue, v);
										}}
									/>
								);

							case "entity":
								return getEntityInspector(value);

							case "texture":
								return getTextureInspector(value);

							case "asset":
								return (
									<EditorInspectorAssetField
										key={value.propertyKey}
										noUndoRedo={isModelSidecarParametersScript()}
										object={props.script[scriptValues][value.propertyKey]}
										property="value"
										assetType={(value.configuration as VisibleInspectorDecoratorAssetConfiguration).assetType}
										label={value.label ?? value.propertyKey}
										tooltip={value.configuration.description}
										typeRestriction={(value.configuration as VisibleInspectorDecoratorAssetConfiguration).typeRestriction}
										onChange={(newValue, oldValue) => {
											if (isModelSidecarParametersScript()) {
												registerParameterValueUndoRedo(value.propertyKey, oldValue, newValue);
											}
										}}
									/>
								);

							default:
								return null;
						}
					})}
				</div>
			)}
		</div>
	);
}
