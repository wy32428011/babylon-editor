import { dirname, join } from "path/posix";
import { ipcRenderer, shell } from "electron";

import { Component, ReactNode } from "react";

import {
	Menubar,
	MenubarCheckboxItem,
	MenubarContent,
	MenubarItem,
	MenubarLabel,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarSub,
	MenubarSubContent,
	MenubarSubTrigger,
	MenubarTrigger,
} from "../../ui/shadcn/ui/menubar";

import { isDarwin } from "../../tools/os";
import { execNodePty } from "../../tools/node-pty";
import { openSingleFileDialog } from "../../tools/dialog";
import { saveSceneScreenshot } from "../../tools/scene/screenshot";

import { showConfirm } from "../../ui/dialog";
import { ToolbarComponent } from "../../ui/toolbar";

import { saveProject } from "../../project/save/save";
import { startProjectDevProcess } from "../../project/run";
import { exportProject } from "../../project/export/export";

import { Editor } from "../main";
import { getNodeCommands } from "../dialogs/command-palette/node";
import { getMeshCommands } from "../dialogs/command-palette/mesh";
import { getLightCommands } from "../dialogs/command-palette/light";
import { getCameraCommands } from "../dialogs/command-palette/camera";
import { getSpriteCommands } from "../dialogs/command-palette/sprite";
import { ICommandPaletteType } from "../dialogs/command-palette/command-palette";

import { EditorMarketplaceBrowser } from "./marketplace";

export interface IEditorToolbarProps {
	editor: Editor;
}

export class EditorToolbar extends Component<IEditorToolbarProps> {
	private _nodeCommands: ICommandPaletteType[];
	private _meshCommands: ICommandPaletteType[];
	private _lightCommands: ICommandPaletteType[];
	private _cameraCommands: ICommandPaletteType[];
	private _spriteCommands: ICommandPaletteType[];

	public constructor(props: IEditorToolbarProps) {
		super(props);

		ipcRenderer.on("editor:open-project", () => this._handleOpenProject());
		ipcRenderer.on("editor:open-vscode", () => this._handleOpenVisualStudioCode());
		ipcRenderer.on("editor:toggle-marketplace", () => this._handleToggleMarketplace());

		this._nodeCommands = getNodeCommands(this.props.editor);
		this._meshCommands = getMeshCommands(this.props.editor);
		this._lightCommands = getLightCommands(this.props.editor);
		this._cameraCommands = getCameraCommands(this.props.editor);
		this._spriteCommands = getSpriteCommands(this.props.editor);

		const commands = [...this._nodeCommands, ...this._meshCommands, ...this._lightCommands, ...this._cameraCommands, ...this._spriteCommands];

		commands.forEach((command) => {
			ipcRenderer.on(`add:${command.ipcRendererChannelKey}`, command.action);
		});
	}

	public render(): ReactNode {
		return (
			<>
				{isDarwin() && <div className="absolute top-0 left-0 w-screen h-10 electron-draggable" />}

				{(!isDarwin() || process.env.DEBUG) && this._getToolbar()}
			</>
		);
	}

	private _getToolbar(): ReactNode {
		return (
			<ToolbarComponent>
				<Menubar className="border-none rounded-none pl-3 my-auto">
					<img alt="" src="assets/ZENDING_while.png" className="w-6 object-contain" />

					{/* File */}
					<MenubarMenu>
						<MenubarTrigger>文件</MenubarTrigger>
						<MenubarContent className="border-black/50">
							<MenubarItem onClick={() => this._handleOpenProject()}>
								打开项目 <MenubarShortcut>CTRL+O</MenubarShortcut>
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => saveProject(this.props.editor)}>
								保存 <MenubarShortcut>CTRL+S</MenubarShortcut>
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => exportProject(this.props.editor, { optimize: false })}>
								生成当前场景 <MenubarShortcut>CTRL+G</MenubarShortcut>
							</MenubarItem>
							<MenubarItem onClick={() => this.props.editor.setState({ generateProject: true })}>生成所有场景和资源...</MenubarItem>

							<MenubarSeparator />

							<MenubarItem disabled={!this.props.editor.state.visualStudioCodeAvailable} onClick={() => this._handleOpenVisualStudioCode()}>
								在 Visual Studio Code 中打开
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => startProjectDevProcess(this.props.editor)}>运行项目...</MenubarItem>
						</MenubarContent>
					</MenubarMenu>

					{/* Edit */}
					<MenubarMenu>
						<MenubarTrigger>编辑</MenubarTrigger>
						<MenubarContent className="border-black/50">
							<MenubarItem>
								撤销 <MenubarShortcut>CTRL+Z</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								重做 <MenubarShortcut>CTRL+Y</MenubarShortcut>
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem>
								全选 <MenubarShortcut>CTRL+A</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								复制 <MenubarShortcut>CTRL+C</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								粘贴 <MenubarShortcut>CTRL+V</MenubarShortcut>
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => this.props.editor.setState({ editProject: true })}>项目...</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => this.props.editor.setState({ editPreferences: true })}>偏好设置...</MenubarItem>
						</MenubarContent>
					</MenubarMenu>

					{/* Preview */}
					<MenubarMenu>
						<MenubarTrigger>预览</MenubarTrigger>
						<MenubarContent className="border-black/50">
							<MenubarItem onClick={() => this.props.editor.layout.preview.setActiveGizmo("position")}>
								位置 <MenubarShortcut>CTRL+T</MenubarShortcut>
							</MenubarItem>
							<MenubarItem onClick={() => this.props.editor.layout.preview.setActiveGizmo("rotation")}>
								旋转 <MenubarShortcut>CTRL+R</MenubarShortcut>
							</MenubarItem>
							<MenubarItem onClick={() => this.props.editor.layout.preview.setActiveGizmo("scaling")}>
								缩放 <MenubarShortcut>CTRL+W</MenubarShortcut>
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => this.props.editor.layout.preview.focusObject()} className="w-60">
								聚焦选中对象 <MenubarShortcut>CTRL+F</MenubarShortcut>
							</MenubarItem>

							<MenubarSeparator />

							<MenubarItem onClick={() => this.props.editor.layout.inspector.setEditedObject(this.props.editor.layout.preview.scene.activeCamera)}>
								编辑相机
							</MenubarItem>

							<MenubarSeparator />

							<MenubarSub>
								<MenubarSubTrigger>截图</MenubarSubTrigger>
								<MenubarSubContent className="w-52">
									<MenubarLabel className="text-muted-foreground">横向</MenubarLabel>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 1280, height: 720 })}>
										720p <MenubarShortcut>(1280x720)</MenubarShortcut>
									</MenubarItem>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 1920, height: 1080 })}>
										1080p <MenubarShortcut>(1920x1080)</MenubarShortcut>
									</MenubarItem>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 3840, height: 2160 })}>
										4K <MenubarShortcut>(3840x2160)</MenubarShortcut>
									</MenubarItem>
									<MenubarLabel className="text-muted-foreground">方形</MenubarLabel>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 512, height: 512 })}>512x512</MenubarItem>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 1024, height: 1024 })}>1024x1024</MenubarItem>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 2048, height: 2048 })}>2048x2048</MenubarItem>
									<MenubarItem onClick={() => saveSceneScreenshot(this.props.editor.layout.preview.scene, { width: 4096, height: 4096 })}>4096x4096</MenubarItem>
								</MenubarSubContent>
							</MenubarSub>

							<MenubarSeparator />

							<MenubarItem onClick={() => this.props.editor.layout.preview.play.triggerPlayScene()}>播放场景</MenubarItem>
						</MenubarContent>
					</MenubarMenu>

					{/* Add */}
					<MenubarMenu>
						<MenubarTrigger>添加</MenubarTrigger>
						<MenubarContent className="border-black/50">
							{this._nodeCommands.map((command) => (
								<MenubarItem key={command.key} disabled={command.disabled} onClick={command.action}>
									{command.text}
								</MenubarItem>
							))}
							<MenubarSeparator />
							{this._meshCommands.map((command) => (
								<MenubarItem key={command.key} disabled={command.disabled} onClick={command.action}>
									{command.text}
								</MenubarItem>
							))}
							<MenubarSeparator />
							{this._lightCommands.map((command) => (
								<MenubarItem key={command.key} disabled={command.disabled} onClick={command.action}>
									{command.text}
								</MenubarItem>
							))}
							<MenubarSeparator />
							{this._cameraCommands.map((command) => (
								<MenubarItem key={command.key} disabled={command.disabled} onClick={command.action}>
									{command.text}
								</MenubarItem>
							))}
							<MenubarSeparator />
							{this._spriteCommands.map((command) => (
								<MenubarItem key={command.key} disabled={command.disabled} onClick={command.action}>
									{command.text}
								</MenubarItem>
							))}
						</MenubarContent>
					</MenubarMenu>

					{/* View */}
					{this.props.editor.state.enableExperimentalFeatures && (
						<MenubarMenu>
							<MenubarTrigger>视图</MenubarTrigger>
							<MenubarContent className="border-black/50">
								<MenubarCheckboxItem checked={this.props.editor.state.openedTabs.includes("marketplace")} onClick={() => this._handleToggleMarketplace()}>
									资源市场
								</MenubarCheckboxItem>
							</MenubarContent>
						</MenubarMenu>
					)}

					{/* Window */}
					<MenubarMenu>
						<MenubarTrigger>窗口</MenubarTrigger>
						<MenubarContent className="border-black/50">
							<MenubarItem onClick={() => ipcRenderer.send("window:minimize")}>
								最小化 <MenubarShortcut>CTRL+M</MenubarShortcut>
							</MenubarItem>
							<MenubarItem onClick={() => this.props.editor.close()}>
								关闭 <MenubarShortcut>CTRL+W</MenubarShortcut>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>

					{/* Help */}
					<MenubarMenu>
						<MenubarTrigger>帮助</MenubarTrigger>
						<MenubarContent className="border-black/50">
							<MenubarItem onClick={() => shell.openExternal("https://editor.babylonjs.com/documentation")}>编辑器文档...</MenubarItem>
							<MenubarItem onClick={() => shell.openExternal("https://doc.babylonjs.com")}>Babylon.js 文档...</MenubarItem>
							<MenubarSeparator />
							<MenubarItem onClick={() => shell.openExternal("https://forum.babylonjs.com")}>Babylon.js 论坛...</MenubarItem>
							<MenubarSeparator />
							<MenubarItem onClick={() => shell.openExternal("https://forum.babylonjs.com/c/bugs")}>报告问题...</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
				</Menubar>
			</ToolbarComponent>
		);
	}

	private async _handleOpenProject(): Promise<void> {
		const file = openSingleFileDialog({
			title: "打开项目",
			filters: [{ name: "Babylon.js Editor 项目文件", extensions: ["bjseditor"] }],
		});

		if (!file) {
			return;
		}

		const accept = await showConfirm("确定吗？", "这将关闭当前项目并打开选中的项目。");
		if (!accept) {
			return;
		}

		await this.props.editor.layout.preview.reset();
		await this.props.editor.openProject(file);
	}

	private async _handleOpenVisualStudioCode(): Promise<void> {
		if (!this.props.editor.state.projectPath) {
			return;
		}

		const p = await execNodePty(`code "${join(dirname(this.props.editor.state.projectPath), "/")}"`);
		await p.wait();
	}

	private _handleToggleMarketplace(): void {
		if (this.props.editor.state.openedTabs.includes("marketplace")) {
			return this.props.editor.layout.removeLayoutTab("marketplace");
		}

		this.props.editor.layout.addLayoutTab(<EditorMarketplaceBrowser editor={this.props.editor} />, {
			id: "marketplace",
			title: "资源市场",
			enableClose: true,
			setAsActiveTab: true,
			neighborId: "assets-browser",
		});
	}
}
