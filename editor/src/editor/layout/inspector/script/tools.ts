export type VisibleInInspectorDecoratorObject = {
	label?: string;
	propertyKey: string;
	configuration: VisibleInInspectorDecoratorConfiguration;

	defaultValue?: any;
};

export type VisibleInInspectorDecoratorConfiguration = {
	type: string;
	description?: string;

	min?: number;
	max?: number;
	step?: number;

	asDegrees?: boolean;

	noClamp?: boolean;
	noColorPicker?: boolean;

	acceptCubes?: boolean;
	onlyCubes?: boolean;
};

export const scriptValues = "values";

export type ScriptInspectorValue = {
	type: string;
	description?: string;
	value: any;
	defaultValue?: any;
	overridden?: boolean;
};

export type ComputeDefaultValuesForObjectOptions = {
	previousOutput?: VisibleInInspectorDecoratorObject[] | null;
	syncDefaultValues?: boolean;
};

/**
 * 克隆脚本参数值，避免默认值和当前值共享同一个数组或对象引用。
 * @param value 定义待克隆的脚本字段值。
 */
function cloneInspectorValue<T>(value: T): T {
	if (value === null || value === undefined || typeof value !== "object") {
		return value;
	}

	try {
		return JSON.parse(JSON.stringify(value));
	} catch (e) {
		return Array.isArray(value) ? ([...value] as T) : ({ ...value } as T);
	}
}

/**
 * 比较脚本参数值，主要用于判断当前值是否仍等于上一版脚本默认值。
 * @param left 定义左侧值。
 * @param right 定义右侧值。
 */
function areInspectorValuesEqual(left: any, right: any): boolean {
	if (left === right) {
		return true;
	}

	try {
		return JSON.stringify(left) === JSON.stringify(right);
	} catch (e) {
		return false;
	}
}

/**
 * 计算装饰器字段的有效默认值，保证缺省配置也能得到可序列化值。
 * @param value 定义从脚本提取出的 Inspector 字段描述。
 */
function getDefaultValueForVisibleProperty(value: VisibleInInspectorDecoratorObject): any {
	switch (value.configuration.type) {
		case "boolean":
			return value.defaultValue ?? false;

		case "number":
			return value.defaultValue ?? value.configuration.min ?? value.configuration.max ?? 0;

		case "string":
			return value.defaultValue ?? "";

		case "vector2":
			return [
				value.defaultValue?.[0] ?? value.configuration.min ?? value.configuration.max ?? 0,
				value.defaultValue?.[1] ?? value.configuration.min ?? value.configuration.max ?? 0,
			];

		case "vector3":
			return [
				value.defaultValue?.[0] ?? value.configuration.min ?? value.configuration.max ?? 0,
				value.defaultValue?.[1] ?? value.configuration.min ?? value.configuration.max ?? 0,
				value.defaultValue?.[2] ?? value.configuration.min ?? value.configuration.max ?? 0,
			];

		case "color3":
			return [value.defaultValue?.[0] ?? 1, value.defaultValue?.[1] ?? 1, value.defaultValue?.[2] ?? 1];

		case "color4":
			return [value.defaultValue?.[0] ?? 1, value.defaultValue?.[1] ?? 1, value.defaultValue?.[2] ?? 1, value.defaultValue?.[3] ?? 1];

		case "keymap":
			return value.defaultValue ?? 0;

		case "entity":
		case "texture":
		case "asset":
			return value.defaultValue ?? null;
	}
}

/**
 * 读取上一版脚本默认值，优先使用已写入 metadata 的 defaultValue，再回退到 watcher 持有的旧提取结果。
 * @param existingValue 定义当前 metadata 中保存的字段值。
 * @param propertyKey 定义字段名。
 * @param options 定义同步配置。
 */
function getPreviousDefaultValue(existingValue: ScriptInspectorValue | undefined, propertyKey: string, options: ComputeDefaultValuesForObjectOptions): any {
	if (existingValue && Object.prototype.hasOwnProperty.call(existingValue, "defaultValue")) {
		return existingValue.defaultValue;
	}

	const previousOutputValue = options.previousOutput?.find((value) => value.propertyKey === propertyKey);
	return previousOutputValue ? getDefaultValueForVisibleProperty(previousOutputValue) : undefined;
}

/**
 * 判断旧字段值是否仍能用于当前装饰器类型，类型或值形状不匹配时需要回退到新默认值。
 * @param existingValue 定义当前 metadata 中保存的字段值。
 * @param value 定义从脚本提取出的 Inspector 字段描述。
 */
function isExistingValueCompatible(existingValue: ScriptInspectorValue | undefined, value: VisibleInInspectorDecoratorObject): boolean {
	if (!existingValue || !Object.prototype.hasOwnProperty.call(existingValue, "value")) {
		return false;
	}

	if (existingValue.type !== value.configuration.type) {
		return false;
	}

	switch (value.configuration.type) {
		case "boolean":
			return typeof existingValue.value === "boolean";

		case "number":
			return typeof existingValue.value === "number";

		case "string":
			return typeof existingValue.value === "string";

		case "vector2":
			return Array.isArray(existingValue.value) && existingValue.value.length >= 2;

		case "vector3":
		case "color3":
			return Array.isArray(existingValue.value) && existingValue.value.length >= 3;

		case "color4":
			return Array.isArray(existingValue.value) && existingValue.value.length >= 4;

		default:
			return true;
	}
}

/**
 * 计算字段是否已被 Inspector 手动覆盖，旧项目缺少标记时用旧默认值做一次迁移推断。
 * @param existingValue 定义当前 metadata 中保存的字段值。
 * @param defaultValue 定义脚本新默认值。
 * @param previousDefaultValue 定义脚本上一版默认值。
 */
function getInspectorValueOverridden(existingValue: ScriptInspectorValue | undefined, defaultValue: any, previousDefaultValue: any): boolean {
	if (!existingValue || !Object.prototype.hasOwnProperty.call(existingValue, "value")) {
		return false;
	}

	if (typeof existingValue.overridden === "boolean") {
		return existingValue.overridden;
	}

	if (previousDefaultValue !== undefined) {
		return !areInspectorValuesEqual(existingValue.value, previousDefaultValue);
	}

	return !areInspectorValuesEqual(existingValue.value, defaultValue);
}

/**
 * 计算字段当前值。用户已手动改过的值保留，未覆盖字段跟随脚本新默认值。
 * @param existingValue 定义当前 metadata 中保存的字段值。
 * @param defaultValue 定义脚本新默认值。
 * @param overridden 定义当前字段是否已被 Inspector 手动覆盖。
 * @param canReuseExistingValue 定义旧字段值是否兼容当前装饰器类型。
 */
function getNextInspectorValue(existingValue: ScriptInspectorValue | undefined, defaultValue: any, overridden: boolean, canReuseExistingValue: boolean): any {
	if (!canReuseExistingValue || !overridden) {
		return cloneInspectorValue(defaultValue);
	}

	return cloneInspectorValue(existingValue!.value);
}

export function computeDefaultValuesForObject(script: any, output: VisibleInInspectorDecoratorObject[], options: ComputeDefaultValuesForObjectOptions = {}) {
	script[scriptValues] ??= {};

	const attachedScripts = script[scriptValues] as Record<string, ScriptInspectorValue>;
	const existingKeys = Object.keys(attachedScripts);

	// 清理脚本中已经删除的 Inspector 字段，避免保存和运行时继续携带旧参数。
	existingKeys.forEach((key) => {
		const existingOutput = output.find((value) => value.propertyKey === key);
		if (!existingOutput) {
			return delete attachedScripts[key];
		}
	});

	output.forEach((value) => {
		const existingValue = attachedScripts[value.propertyKey];
		const defaultValue = getDefaultValueForVisibleProperty(value);
		const previousDefaultValue = getPreviousDefaultValue(existingValue, value.propertyKey, options);
		const canReuseExistingValue = isExistingValueCompatible(existingValue, value);
		const overridden = options.syncDefaultValues && canReuseExistingValue ? getInspectorValueOverridden(existingValue, defaultValue, previousDefaultValue) : false;

		const nextValue: ScriptInspectorValue = {
			type: value.configuration.type,
			description: value.configuration.description,
			value: options.syncDefaultValues ? getNextInspectorValue(existingValue, defaultValue, overridden, canReuseExistingValue) : canReuseExistingValue ? cloneInspectorValue(existingValue!.value) : cloneInspectorValue(defaultValue),
		};

		if (options.syncDefaultValues) {
			nextValue.defaultValue = cloneInspectorValue(defaultValue);
			nextValue.overridden = overridden;
		}

		attachedScripts[value.propertyKey] = nextValue;
	});
}
