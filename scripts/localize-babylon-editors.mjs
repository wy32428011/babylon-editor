import { access, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

const scriptName = "localize-babylon-editors";
const rootPath = join(import.meta.dirname, "..");
const defaultConfigPath = join(import.meta.dirname, "localize-babylon-editors.config.json");

/**
 * 打印第三方编辑器汉化脚本的命令行帮助。
 */
function printHelp() {
	console.log(`Usage: node ./scripts/localize-babylon-editors.mjs [options]

Options:
  --config <path>  指定汉化参数文件，默认 scripts/localize-babylon-editors.config.json
  --root <path>    指定项目根目录，默认当前脚本上级目录
  --dry-run        只统计可替换数量，不写入文件
  --help           显示帮助信息`);
}

/**
 * 读取需要单独取值的命令行参数。
 */
function readOptionValue(args, index, name) {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${name}`);
	}

	return value;
}

/**
 * 解析命令行参数并返回规范化执行选项。
 */
function parseArguments(args) {
	const options = {
		configPath: defaultConfigPath,
		root: rootPath,
		dryRun: false,
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}

		if (arg === "--config") {
			options.configPath = readOptionValue(args, i, "--config");
			i++;
			continue;
		}

		if (arg.startsWith("--config=")) {
			options.configPath = arg.slice("--config=".length);
			continue;
		}

		if (arg === "--root") {
			options.root = readOptionValue(args, i, "--root");
			i++;
			continue;
		}

		if (arg.startsWith("--root=")) {
			options.root = arg.slice("--root=".length);
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	options.configPath = resolvePath(process.cwd(), options.configPath);
	options.root = resolvePath(process.cwd(), options.root);

	return options;
}

/**
 * 基于当前目录解析相对路径。
 */
function resolvePath(basePath, value) {
	return isAbsolute(value) ? value : resolve(basePath, value);
}

/**
 * 判断传入值是否为普通对象。
 */
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 校验包名只能指向 node_modules 内部包。
 */
function validatePackageName(value, fieldName) {
	if (!value || typeof value !== "string" || value.includes("\\") || isAbsolute(value)) {
		throw new Error(`${fieldName} must be a package name`);
	}

	const segments = value.split("/");
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
		throw new Error(`${fieldName} must not contain empty, "." or ".." path segments`);
	}
}

/**
 * 校验 bundle 文件路径只能是包内相对路径。
 */
function validatePackageFile(value, fieldName) {
	if (!value || typeof value !== "string" || value.includes("\0") || isAbsolute(value)) {
		throw new Error(`${fieldName} must be a relative file path`);
	}

	const segments = value.split(/[\\/]/);
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
		throw new Error(`${fieldName} must not contain empty, "." or ".." path segments`);
	}
}

/**
 * 校验翻译条目列表，数组结构可以保留替换顺序并避免 JSON 重复 key 静默覆盖。
 */
function validateTranslationList(value, fieldName) {
	if (!Array.isArray(value)) {
		throw new Error(`${fieldName} must be an array`);
	}

	const seenSources = new Set();

	return value.map((item, index) => {
		const itemName = `${fieldName}[${index}]`;
		if (!isRecord(item)) {
			throw new Error(`${itemName} must be an object`);
		}

		if (!item.source || typeof item.source !== "string") {
			throw new Error(`${itemName}.source must be a non-empty string`);
		}

		if (typeof item.target !== "string") {
			throw new Error(`${itemName}.target must be a string`);
		}

		if (seenSources.has(item.source)) {
			throw new Error(`${fieldName} contains duplicate source: ${item.source}`);
		}

		seenSources.add(item.source);
		return {
			source: item.source,
			target: item.target,
		};
	});
}

/**
 * 校验包级配置，避免参数文件结构错误导致静默跳过。
 */
function validatePackageConfig(pkg, index) {
	const fieldName = `packages[${index}]`;

	if (!isRecord(pkg)) {
		throw new Error(`${fieldName} must be an object`);
	}

	validatePackageName(pkg.name, `${fieldName}.name`);

	if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
		throw new Error(`${fieldName}.files must be a non-empty string array`);
	}

	pkg.files.forEach((file, fileIndex) => validatePackageFile(file, `${fieldName}.files[${fileIndex}]`));

	return {
		name: pkg.name,
		files: pkg.files,
		translations: validateTranslationList(pkg.translations, `${fieldName}.translations`),
	};
}

/**
 * 校验完整参数文件并补齐可选字段。
 */
function normalizeConfig(config) {
	if (!isRecord(config)) {
		throw new Error("Config root must be an object");
	}

	if (config.version !== 1) {
		throw new Error("Config version must be 1");
	}

	const commonTranslations = validateTranslationList(config.commonTranslations ?? [], "commonTranslations");

	if (!Array.isArray(config.packages)) {
		throw new Error("packages must be an array");
	}

	return {
		commonTranslations,
		packages: config.packages.map(validatePackageConfig),
	};
}

/**
 * 读取并解析第三方编辑器汉化参数文件。
 */
async function loadConfig(configPath) {
	const content = await readFile(configPath, "utf8");

	try {
		return normalizeConfig(JSON.parse(content));
	} catch (error) {
		throw new Error(`Invalid config ${configPath}: ${error.message}`);
	}
}

/**
 * 合并公共翻译和包级翻译，同源文案由包级翻译覆盖。
 */
function mergeTranslations(commonTranslations, packageTranslations) {
	const order = [];
	const translations = new Map();

	for (const item of [...commonTranslations, ...packageTranslations]) {
		if (!translations.has(item.source)) {
			order.push(item.source);
		}

		translations.set(item.source, item.target);
	}

	return order.map((source) => ({
		source,
		target: translations.get(source),
	}));
}

/**
 * 转义正则表达式中的特殊字符。
 */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 转义写回 JavaScript 字符串字面量的目标文案。
 */
function escapeJavaScriptString(value, quote) {
	let escaped = value.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

	if (quote === "`") {
		return escaped.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
	}

	return quote === '"' ? escaped.replace(/"/g, '\\"') : escaped.replace(/'/g, "\\'");
}

/**
 * 只替换 JavaScript 字符串字面量中的完整文案并统计替换次数。
 */
function localizeJavaScriptBundle(content, source, target) {
	const escaped = escapeRegExp(source);
	const quotedStringPattern = new RegExp(`(["'\`])${escaped}\\1`, "g");
	let count = 0;
	const updated = content.replace(quotedStringPattern, (_match, quote) => {
		count++;
		return `${quote}${escapeJavaScriptString(target, quote)}${quote}`;
	});

	return { count, updated };
}

/**
 * 对 source map 做调试友好的文本替换并统计替换次数。
 */
function localizeSourceMap(content, source, target) {
	const count = content.split(source).length - 1;
	return {
		count,
		updated: count > 0 ? content.replaceAll(source, target) : content,
	};
}

/**
 * 按文件类型选择替换顺序，source map 使用长短语优先避免短词污染长词。
 */
function getTranslationsForFile(filePath, translations) {
	if (!filePath.endsWith(".map")) {
		return translations;
	}

	return [...translations].sort((a, b) => b.source.length - a.source.length);
}

/**
 * 基于包名和包内文件路径生成受限的绝对文件路径。
 */
function getPackageFilePath(root, packageName, file) {
	const packagePath = resolve(root, "node_modules", ...packageName.split("/"));
	const filePath = resolve(packagePath, file);

	if (filePath !== packagePath && !filePath.startsWith(`${packagePath}${sep}`)) {
		throw new Error(`Resolved file is outside package directory: ${file}`);
	}

	return filePath;
}

/**
 * 对第三方编辑器发布产物做幂等字符串替换。
 */
async function localizeFile(filePath, translations, options) {
	try {
		await access(filePath);
	} catch {
		console.warn(`[${scriptName}] Missing file, skipped: ${filePath}`);
		return 0;
	}

	const content = await readFile(filePath, "utf8");
	let updated = content;
	let count = 0;

	for (const { source, target } of getTranslationsForFile(filePath, translations)) {
		const result = filePath.endsWith(".map") ? localizeSourceMap(updated, source, target) : localizeJavaScriptBundle(updated, source, target);
		updated = result.updated;
		count += result.count;
	}

	if (!options.dryRun && updated !== content) {
		await writeFile(filePath, updated, "utf8");
	}

	return count;
}

/**
 * 根据参数文件执行第三方编辑器汉化。
 */
async function run() {
	const options = parseArguments(process.argv.slice(2));

	if (options.help) {
		printHelp();
		return;
	}

	const config = await loadConfig(options.configPath);
	let total = 0;

	for (const pkg of config.packages) {
		const translations = mergeTranslations(config.commonTranslations, pkg.translations);
		for (const file of pkg.files) {
			total += await localizeFile(getPackageFilePath(options.root, pkg.name, file), translations, options);
		}
	}

	const suffix = options.dryRun ? " in dry-run mode" : "";
	console.log(`[${scriptName}] Applied ${total} localization replacements${suffix}.`);
}

try {
	await run();
} catch (error) {
	console.error(`[${scriptName}] ${error.message}`);
	process.exitCode = 1;
}
