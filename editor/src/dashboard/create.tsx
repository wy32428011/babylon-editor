import { dirname, join, relative } from "path/posix";
import { ipcRenderer } from "electron";
import { pathExists, readJSON, remove, writeJSON } from "fs-extra";

import decompress from "decompress";
import decompressTargz from "decompress-targz";

import { useEffect, useState } from "react";

import { RxCross2 } from "react-icons/rx";
import { Grid } from "react-loader-spinner";

import { pack } from "babylonjs-editor-cli";

import { showAlert, showConfirm } from "../ui/dialog";

import { Input } from "../ui/shadcn/ui/input";
import { Button } from "../ui/shadcn/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/shadcn/ui/dialog";

import { openSingleFolderDialog } from "../tools/dialog";
import { isPackageManagerAvailable } from "../tools/process";
import { tryAddProjectToLocalStorage } from "../tools/local-storage";

import { EditorProjectPackageManager, IEditorProject, EditorProjectTemplate } from "../project/typings";

export interface IDashboardCreateProjectDialogProps {
	isOpened: boolean;
	closeDashboardOnProjectOpen: boolean;
	onClose: () => void;
}

type PackageManagerCheckState = "processing" | "available" | "not-available";

/**
 * 从当前工作目录向上查找本地源码工作区中的包目录。
 * @param packageDirectory 定义要查找的工作区目录名称。
 */
async function findLocalWorkspacePackageDirectory(packageDirectory: "tools" | "cli") {
	let current = process.cwd().replace(/\\/g, "/");

	for (let i = 0; i < 8; i++) {
		const candidate = join(current, packageDirectory);
		if (await pathExists(join(candidate, "package.json"))) {
			return candidate;
		}

		const parent = dirname(current);
		if (parent === current || parent === ".") {
			break;
		}

		current = parent;
	}

	return null;
}

/**
 * 生成写入 package.json 的本地 file 依赖路径。
 * @param destination 定义新项目所在目录。
 * @param packageDirectory 定义本地源码包目录。
 */
function getLocalPackageDependency(destination: string, packageDirectory: string) {
	const relativePackageDirectory = relative(destination.replace(/\\/g, "/"), packageDirectory).replace(/\\/g, "/");
	const normalizedPackageDirectory = relativePackageDirectory.startsWith(".") ? relativePackageDirectory : `./${relativePackageDirectory}`;

	return `file:${normalizedPackageDirectory}`;
}

/**
 * 开发态创建项目时，优先让项目使用当前源码工作区中的 tools 和 cli。
 * 这样本地新增的脚本运行时能力可以立即被新项目使用，不依赖 npm 上同版本包是否已发布。
 * @param destination 定义新项目所在目录。
 */
async function setupLocalWorkspaceDependencies(destination: string) {
	if (!process.env.DEBUG) {
		return;
	}

	const toolsDirectory = await findLocalWorkspacePackageDirectory("tools");
	const cliDirectory = await findLocalWorkspacePackageDirectory("cli");
	if (!toolsDirectory && !cliDirectory) {
		return;
	}

	const packageJsonPath = join(destination, "package.json");
	const packageJson = await readJSON(packageJsonPath);

	packageJson.dependencies ??= {};
	packageJson.devDependencies ??= {};

	if (toolsDirectory) {
		packageJson.dependencies["babylonjs-editor-tools"] = getLocalPackageDependency(destination, toolsDirectory);
	}

	if (cliDirectory) {
		packageJson.devDependencies["babylonjs-editor-cli"] = getLocalPackageDependency(destination, cliDirectory);
	}

	await writeJSON(packageJsonPath, packageJson, {
		spaces: "\t",
		encoding: "utf-8",
	});
}

export function DashboardCreateProjectDialog(props: IDashboardCreateProjectDialogProps) {
	const [destination, setDestination] = useState("");
	const [packageManager, setPackageManager] = useState<EditorProjectPackageManager>("npm");
	const [template, setTemplate] = useState<EditorProjectTemplate>("nextjs");
	const [creating, setCreating] = useState(false);

	const [npmAvailable, setNpmAvailable] = useState<PackageManagerCheckState>("processing");
	const [yarnAvailable, setYarnAvailable] = useState<PackageManagerCheckState>("processing");
	const [pnpmAvailable, setPnpmAvailable] = useState<PackageManagerCheckState>("processing");
	const [bunAvailable, setBunAvailable] = useState<PackageManagerCheckState>("processing");

	useEffect(() => {
		if (props.isOpened) {
			isPackageManagerAvailable("npm").then((available) => setNpmAvailable(available ? "available" : "not-available"));
			isPackageManagerAvailable("yarn").then((available) => setYarnAvailable(available ? "available" : "not-available"));
			isPackageManagerAvailable("pnpm").then((available) => setPnpmAvailable(available ? "available" : "not-available"));
			isPackageManagerAvailable("bun").then((available) => setBunAvailable(available ? "available" : "not-available"));
		}
	}, [props.isOpened]);

	async function handleBrowseFolderPath() {
		const folder = openSingleFolderDialog("选择项目创建目录");

		if (folder) {
			setDestination(folder);
		}
	}

	async function setupTemplate(destination: string, template: EditorProjectTemplate) {
		const templatePath = process.env.DEBUG ? `templates/${template}.tgz` : `../../templates/${template}.tgz`;
		const templateBlob = await fetch(templatePath).then((r) => r.blob());
		const buffer = Buffer.from(await templateBlob.arrayBuffer());

		// Extract template.
		await decompress(buffer, destination, {
			plugins: [decompressTargz()],
			map: (file) => {
				file.path = file.path.replace("package/", "");
				return file;
			},
		});

		await remove(join(destination, "package"));

		// Configure project file.
		const projectAbsolutePath = join(destination, "project.bjseditor");

		const projectContent = (await readJSON(projectAbsolutePath)) as IEditorProject;
		projectContent.packageManager = packageManager;

		await writeJSON(projectAbsolutePath, projectContent, {
			spaces: "\t",
			encoding: "utf-8",
		});

		await setupLocalWorkspaceDependencies(destination);

		// Generate public/scene.
		await pack(destination, {
			optimize: false,
		});
	}

	async function handleCreateProject() {
		setCreating(true);

		try {
			const projectAbsolutePath = join(destination, "project.bjseditor");

			await setupTemplate(destination, template);

			tryAddProjectToLocalStorage(projectAbsolutePath);

			props.onClose();

			const result = await showConfirm("打开项目？", "是否打开刚创建的项目？", {
				cancelText: "否",
				confirmText: "是",
			});

			if (result) {
				ipcRenderer.send("dashboard:open-project", projectAbsolutePath, props.closeDashboardOnProjectOpen);
			}
		} catch (e) {
			showAlert("发生了意外错误", e.message);
		}

		setCreating(false);
		setDestination("");
	}

	function getPackageManagerSelectItem(packageManager: EditorProjectPackageManager, availability: PackageManagerCheckState) {
		return (
			<SelectItem value={packageManager} disabled={availability !== "available"}>
				<div className="flex items-center gap-2">
					{availability === "processing" && <Grid width={16} height={16} color="#ffffff" />}

					{availability === "not-available" && <RxCross2 className="w-4 h-4 text-red-500" />}

					<div>{packageManager}</div>
				</div>
			</SelectItem>
		);
	}

	function getTemplateSelectItem(template: EditorProjectTemplate) {
		return (
			<SelectItem value={template}>
				<div className="flex items-center gap-2">
					<div>{template}</div>
				</div>
			</SelectItem>
		);
	}

	return (
		<Dialog open={props.isOpened} onOpenChange={(o) => !o && props.onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>创建项目</DialogTitle>
					<DialogDescription className="flex flex-col gap-4 py-5">
						{!creating && (
							<>
								<div className="flex flex-col gap-2">
									<div>选择项目创建目录。</div>

									<div className="flex gap-[10px]">
										<Input value={destination} disabled placeholder="文件夹路径..." />
										<Button variant="secondary" className="w-24" onClick={() => handleBrowseFolderPath()}>
											浏览...
										</Button>
									</div>
								</div>

								<div className="flex flex-col gap-2">
									<div>包管理器</div>

									<Select value={packageManager} onValueChange={(v) => setPackageManager(v as EditorProjectPackageManager)}>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="包管理器" />
										</SelectTrigger>
										<SelectContent>
											{getPackageManagerSelectItem("npm", npmAvailable)}
											{getPackageManagerSelectItem("yarn", yarnAvailable)}
											{getPackageManagerSelectItem("pnpm", pnpmAvailable)}
											{getPackageManagerSelectItem("bun", bunAvailable)}
										</SelectContent>
									</Select>
								</div>

								<div className="flex flex-col gap-2">
									<div>模板</div>

									<Select value={template} onValueChange={(v) => setTemplate(v as EditorProjectTemplate)}>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="模板" />
										</SelectTrigger>
										<SelectContent>
											{getTemplateSelectItem("nextjs")}
											{getTemplateSelectItem("nuxtjs")}
											{getTemplateSelectItem("solidjs")}
											{getTemplateSelectItem("vanillajs")}
											{getTemplateSelectItem("electron")}
										</SelectContent>
									</Select>
								</div>
							</>
						)}

						{creating && (
							<div className="flex flex-col gap-[10px] justify-center items-center pt-5">
								<Grid width={24} height={24} color="#ffffff" />

								<div>正在创建项目...</div>
							</div>
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="default" className="w-24" onClick={() => handleCreateProject()} disabled={destination === "" || creating}>
						创建
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
