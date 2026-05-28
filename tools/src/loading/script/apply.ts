import { Node } from "@babylonjs/core/node";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observer } from "@babylonjs/core/Misc/observable";
import { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { IParticleSystem } from "@babylonjs/core/Particles/IParticleSystem";

import { IModelSidecarParameterValue, IModelSidecarParametersContext, IMqttDriverContext, IScript, ModelSidecarParametersApplyReason } from "../../script";

import { applyDecorators } from "../../decorators/apply";

import { isAnyParticleSystem, isNode, isScene, isSoundNode } from "../../tools/guards";

import { ScriptMap } from "../loader";

interface IScriptConfiguration {
	key: string;
	kind?: string;
	values?: Record<string, IModelSidecarParameterValue>;
}

/**
 * @internal
 */
export function _applyScriptsForObject(scene: Scene, object: any, scriptsMap: ScriptMap, rootUrl: string) {
	if (!object.metadata?.scripts) {
		return;
	}

	object.metadata.scripts?.forEach((script) => {
		if (!script.enabled) {
			return;
		}

		const exports = scriptsMap[script.key];
		if (!exports) {
			return;
		}

		let result = exports;
		const observers: IRegisteredScriptObservers = {};

		if (exports.default) {
			const appliedScript = instantiateScriptWithDecorators(scene, object, script, exports, rootUrl);
			if (!appliedScript) {
				return;
			}

			result = appliedScript.instance;
			Object.assign(observers, appliedScript.observers);
			applyModelSidecarParametersInstance(scene, object, script, result, "runtime");
		}

		if (result.onStart) {
			observers.onStartObserver = scene.onBeforeRenderObservable.addOnce(() => result.onStart!(object));
		}

		if (result.onUpdate) {
			observers.onUpdateObserver = scene.onBeforeRenderObservable.add(() => result.onUpdate!(object));
		}

		_registerScriptInstance(object, result, script.key, observers);
	});

	object.metadata.scripts = undefined;
}

/**
 * 实例化模型参数脚本并立即应用参数，供编辑器实时预览复用运行时同一套逻辑。
 * @param scene 定义当前 Babylon 场景。
 * @param object 定义脚本绑定的模型根对象。
 * @param script 定义 metadata 中的脚本记录。
 * @param exports 定义脚本编译后的模块导出。
 * @param rootUrl 定义项目资源根路径。
 * @param reason 定义本次应用来源。
 */
export function applyModelSidecarParametersToObject(
	scene: Scene,
	object: any,
	script: IScriptConfiguration,
	exports: any,
	rootUrl: string,
	reason: ModelSidecarParametersApplyReason
): IScript | null {
	const appliedScript = instantiateScriptWithDecorators(scene, object, script, exports, rootUrl);
	if (!appliedScript) {
		return null;
	}

	try {
		applyModelSidecarParametersInstance(scene, object, script, appliedScript.instance, reason);
	} finally {
		disposeScriptObservers(appliedScript.observers);
	}

	return appliedScript.instance;
}

/**
 * Applies the given script constructor on the given object on the fly.
 * @param object defines the reference to the object on which the script must be applied.
 * @param scriptConstructor defines the constructor of the script to apply on the object.
 * @param scene defines the reference to the scene. If not provided, will try to get it from object.getScene()
 * @example
 * import { applyScriptOnObject } from "babylonjs-editor-tools";
 * ...
 * const instance = applyScriptOnObject(mesh, MyScriptClass);
 */
export function applyScriptOnObject(object: any, scriptConstructor: new (...args: any) => any, scene?: Scene) {
	scene ??= object.getScene?.();
	if (!scene) {
		throw new Error("Cannot apply script on object: no scene available.");
	}

	const instance = new scriptConstructor(object);
	const observers: IRegisteredScriptObservers = {};

	const script = {
		values: {},
	};

	applyDecorators(scene, object, script, instance, "");

	if (instance.onStart) {
		observers.onStartObserver = scene.onBeforeRenderObservable.addOnce(() => instance.onStart!());
	}

	if (instance.onUpdate) {
		scene.onBeforeRenderObservable.add(() => instance.onUpdate!());
	}

	_registerScriptInstance(object, instance, "runtime", observers);

	return instance;
}

interface IAppliedScript {
	instance: IScript;
	observers: IRegisteredScriptObservers;
}

export interface IRegisteredScript {
	/**
	 * Defines the key of the script. Refer to scriptMap.
	 */
	key: string;
	/**
	 * Defines the instance of the script that was created while loading the scene.
	 */
	instance: IScript;
	/**
	 * Defines the dictionary of all registered observers for this script.
	 */
	observers: IRegisteredScriptObservers;
}

export interface IRegisteredScriptObservers {
	onStartObserver?: Observer<Scene> | null;
	onUpdateObserver?: Observer<Scene> | null;
	pointerObserver?: Observer<PointerInfo> | null;
	keyboardObserver?: Observer<KeyboardInfo> | null;
}

export const scriptsDictionary = new Map<Node | IParticleSystem | Scene, IRegisteredScript[]>();

/**
 * 创建脚本实例并注入装饰器字段值。
 * @param scene 定义当前 Babylon 场景。
 * @param object 定义脚本绑定对象。
 * @param script 定义 metadata 中的脚本记录。
 * @param exports 定义脚本模块导出。
 * @param rootUrl 定义资源根路径。
 */
function instantiateScriptWithDecorators(scene: Scene, object: any, script: IScriptConfiguration, exports: any, rootUrl: string): IAppliedScript | null {
	if (!exports.default) {
		return null;
	}

	const instance = new exports.default(object) as IScript;
	const decoratorsResult = applyDecorators(scene, object, script, instance, rootUrl);

	return {
		instance,
		observers: decoratorsResult?.observers ?? {},
	};
}

/**
 * 调用参数脚本的实时应用入口。
 * @param scene 定义当前 Babylon 场景。
 * @param object 定义脚本绑定对象。
 * @param script 定义 metadata 中的脚本记录。
 * @param instance 定义已注入装饰器字段值的脚本实例。
 * @param reason 定义本次应用来源。
 */
function applyModelSidecarParametersInstance(scene: Scene, object: any, script: IScriptConfiguration, instance: IScript, reason: ModelSidecarParametersApplyReason): void {
	if (script.kind !== "params" || !instance.onApplyParameters) {
		return;
	}

	try {
		instance.onApplyParameters(createModelSidecarParametersContext(scene, object, script, reason));
	} catch (e) {
		console.error(`Failed to apply model sidecar parameters for script "${script.key}" on object "${object?.name ?? object?.id ?? "unknown"}".`, e);
	}
}

/**
 * 创建参数脚本上下文，封装后代查找和基于原始缩放的尺寸应用。
 * @param scene 定义当前 Babylon 场景。
 * @param object 定义模型根对象。
 * @param script 定义 metadata 中的脚本记录。
 * @param reason 定义本次应用来源。
 */
function createModelSidecarParametersContext(scene: Scene, object: any, script: IScriptConfiguration, reason: ModelSidecarParametersApplyReason): IModelSidecarParametersContext {
	const findDescendantsByName = (name: string): any[] => {
		return getObjectDescendants(object).filter((node) => node.name === name || node.id === name);
	};

	return {
		object,
		scene,
		scriptKey: script.key,
		values: script.values ?? {},
		reason,
		findDescendantsByName,
		findDescendantByName: (name) => findDescendantsByName(name)[0] ?? null,
		getOriginalScaling: (node) => getOriginalScaling(node),
		setNodeScaling: (node, scaling) => setNodeScalingFromOriginal(node, scaling),
		setDescendantScaling: (name, scaling) => {
			findDescendantsByName(name).forEach((node) => setNodeScalingFromOriginal(node, scaling));
		},
	};
}

/**
 * 移除编辑器实时应用参数时临时创建的观察者，避免参数预览产生持久事件订阅。
 * @param observers 定义装饰器创建的观察者集合。
 */
function disposeScriptObservers(observers: IRegisteredScriptObservers): void {
	observers.onStartObserver?.remove();
	observers.onUpdateObserver?.remove();
	observers.pointerObserver?.remove();
	observers.keyboardObserver?.remove();
}

/**
 * 返回模型根对象的全部后代。
 * @param object 定义模型根对象。
 */
function getObjectDescendants(object: any): any[] {
	return object.getDescendants?.(false) ?? [];
}

/**
 * 读取或初始化节点原始缩放。
 * @param node 定义待读取的节点。
 */
function getOriginalScaling(node: any): Vector3 {
	const existingTuple = node.metadata?.editorImportedModel?.originalScaling ?? node.metadata?.modelSidecarParameters?.originalScaling;
	if (Array.isArray(existingTuple) && existingTuple.length >= 3) {
		return Vector3.FromArray(existingTuple);
	}

	const scaling = node.scaling?.clone?.() ?? Vector3.One();
	const tuple = scaling.asArray() as [number, number, number];
	node.metadata ??= {};
	node.metadata.modelSidecarParameters = {
		...(node.metadata.modelSidecarParameters ?? {}),
		originalScaling: tuple,
	};

	return scaling;
}

/**
 * 按节点原始缩放设置当前缩放，避免重复应用参数时不断累乘。
 * @param node 定义待缩放节点。
 * @param scaling 定义相对原始缩放的倍率。
 */
function setNodeScalingFromOriginal(node: any, scaling: any): void {
	if (!node?.scaling) {
		return;
	}

	const originalScaling = getOriginalScaling(node);
	const scalingVector = toScalingVector(scaling);
	node.scaling.set(originalScaling.x * scalingVector.x, originalScaling.y * scalingVector.y, originalScaling.z * scalingVector.z);
	node.computeWorldMatrix?.(true);
}

/**
 * 将脚本传入的 number、数组或 Vector3Like 转成缩放向量。
 * @param scaling 定义脚本传入的缩放配置。
 */
function toScalingVector(scaling: any): Vector3 {
	if (typeof scaling === "number") {
		return new Vector3(scaling, scaling, scaling);
	}

	if (Array.isArray(scaling)) {
		return Vector3.FromArray([scaling[0] ?? 1, scaling[1] ?? 1, scaling[2] ?? 1]);
	}

	return new Vector3(scaling?.x ?? 1, scaling?.y ?? 1, scaling?.z ?? 1);
}

export interface IMqttDriverDispatchOptions {
	/**
	 * MQTT 消息来源 topic。
	 */
	topic?: string;

	/**
	 * MQTT 原始消息负载。
	 */
	payload?: unknown;

	/**
	 * 覆盖默认分发时间戳。
	 */
	timestamp?: number;

	/**
	 * 覆盖自动推断的 Babylon 场景。
	 */
	scene?: Scene;
}

/**
 * 将 MQTT 或外部实时值分发给对象当前选中的模型动画驱动脚本。
 * @param object 定义已绑定模型外挂脚本的 Babylon 对象。
 * @param value 定义传递给动画驱动脚本的实时值。
 * @param options 定义可选的 MQTT topic、原始负载和时间戳。
 * @returns 返回实际收到值的脚本数量。
 */
export function dispatchMqttValueToObject(object: any, value: unknown, options?: IMqttDriverDispatchOptions): number {
	const selectedAnimationKey = object.metadata?.modelSidecar?.selectedAnimationKey as string | null | undefined;
	if (!selectedAnimationKey) {
		return 0;
	}

	const runningScripts = scriptsDictionary.get(object) ?? [];
	const selectedScript = runningScripts.find((script) => script.key === selectedAnimationKey);
	if (!selectedScript?.instance.onMqttValue) {
		return 0;
	}

	const context: IMqttDriverContext = {
		object,
		scene: options?.scene ?? object.getScene?.() ?? object,
		scriptKey: selectedScript.key,
		topic: options?.topic,
		payload: options?.payload,
		timestamp: options?.timestamp ?? Date.now(),
	};

	selectedScript.instance.onMqttValue(value, context);

	return 1;
}

/**
 * When a scene is being loaded, scripts that were attached to objects in the scene using the Editor are processed.
 * This function registers the instance of scripts per object in order to retrieve them later.
 * @internal
 */
export function _registerScriptInstance(object: any, scriptInstance: IScript, key: string, observers: IRegisteredScriptObservers) {
	const registeredScript = {
		key,
		observers,
		instance: scriptInstance,
	} as IRegisteredScript;

	if (!scriptsDictionary.has(object)) {
		scriptsDictionary.set(object, [registeredScript]);
	} else {
		scriptsDictionary.get(object)!.push(registeredScript);
	}

	if (isNode(object) || isAnyParticleSystem(object) || isScene(object) || isSoundNode(object)) {
		object.onDisposeObservable.addOnce((() => {
			const scripts = scriptsDictionary.get(object)?.slice();
			scripts?.forEach((s) => {
				_removeRegisteredScriptInstance(object, s);
			});

			scriptsDictionary.delete(object);
		}) as any);
	}
}

/**
 * When a node is disposed, or for hot reload purpose, the script should be unregistered and all observers removed.
 * @internal
 */
export function _removeRegisteredScriptInstance(object: any, registeredScript: IRegisteredScript) {
	registeredScript.observers.onStartObserver?.remove();
	registeredScript.observers.onUpdateObserver?.remove();

	registeredScript.observers.pointerObserver?.remove();
	registeredScript.observers.keyboardObserver?.remove();

	try {
		registeredScript.instance.onStop?.(object);
	} catch (e) {
		console.error(`Failed to call onStop for script ${registeredScript.key} on object ${object}`, e);
	}

	const runningScripts = scriptsDictionary.get(object);
	const index = runningScripts?.indexOf(registeredScript) ?? -1;
	if (index !== -1) {
		runningScripts?.splice(index, 1);
	}
}

/**
 * Returns all the instances of the script attached to the given object that matches the given class type.
 * The same script can be attached multiple times to the same object. If you ensure that ONLY DISTINCT scripts
 * are attached to the object, you can use `getScriptByClassForObject` which will return the unique instance for the given object.
 * @param object defines the reference to the object where the script to retrieve is attached to.
 * @param classType defines the class of the type to retrieve
 * @example
 * import { IScript, getAllScriptsByClassForObject } from "babylonjs-editor-tools";
 *
 * class ScriptClass implements IScript {
 * 	public onStart(): void {
 * 		const instances = getAllScriptsByClassForObject(mesh, OtherScriptClass);
 * 		instances.forEach((i) => {
 * 			i.doSomething();
 * 		});
 * 	}
 * }
 *
 * class OtherScriptClass implements IScript {
 * 	public doSomething(): void {
 * 		console.log("Doing something!");
 * 	}
 * }
 */
export function getAllScriptsByClassForObject<T extends new (...args: any) => any>(object: any, classType: T) {
	const data = scriptsDictionary.get(object);
	const result = data?.filter((s) => s.instance.constructor === classType);

	return (result?.map((r) => r.instance) as InstanceType<T>[]) ?? null;
}

/**
 * Returns the instance of the script attached to the given object that matches the given class type.
 * @param object defines the reference to the object where the script to retrieve is attached to.
 * @param classType defines the class of the type to retrieve
 * @example
 * import { IScript, getScriptByClassForObject } from "babylonjs-editor-tools";
 *
 * class ScriptClass implements IScript {
 * 	public onStart(): void {
 * 		const instance = getScriptByClassForObject(mesh, OtherScriptClass);
 * 		instance.doSomething();
 * 	}
 * }
 *
 * class OtherScriptClass implements IScript {
 * 	public doSomething(): void {
 * 		console.log("Doing something!");
 * 	}
 * }
 */
export function getScriptByClassForObject<T extends new (...args: any) => any>(object: any, classType: T) {
	const result = getAllScriptsByClassForObject<T>(object, classType);
	return (result?.[0] as InstanceType<T>) ?? null;
}
