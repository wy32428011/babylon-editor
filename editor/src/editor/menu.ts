import { platform } from "os";
import { BrowserWindow, Menu, MenuItem, shell } from "electron";

import { cameraCommandItems, lightCommandItems, meshCommandItems, nodeCommandItems, spriteCommandItems } from "./dialogs/command-palette/shared-commands";

export function setupEditorMenu(options: { enableExperimentalFeatures: boolean; openedTabs?: string[] }): void {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{
				label: "Babylon.js Editor",
				submenu: [
					{
						label: "关于 Babylon.js Editor",
						role: "about",
					},
					{
						type: "separator",
					},
					{
						label: "偏好设置...",
						accelerator: "Command+,",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:edit-preferences"),
					},
					{
						type: "separator",
					},
					{
						label: "退出 Babylon.js Editor",
						accelerator: "CommandOrControl+Q",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:quit-app"),
					},
				],
			},
			{
				label: "Files",
				submenu: [
					{
						label: "打开项目...",
						accelerator: "CommandOrControl+O",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:open-project"),
					},
					{
						type: "separator",
					},
					{
						label: "保存",
						accelerator: "CommandOrControl+S",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("save"),
					},
					{
						type: "separator",
					},
					{
						label: "生成当前场景",
						accelerator: "CommandOrControl+G",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("generate"),
					},
					{
						label: "生成所有场景和资源...",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:generate-project"),
					},
					{
						type: "separator",
					},
					{
						label: "在 Visual Studio Code 中打开",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:open-vscode"),
					},
					{
						type: "separator",
					},
					{
						label: "运行项目...",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:run-project"),
					},
				],
			},
			{
				label: "编辑",
				submenu: [
					{
						label: "撤销",
						accelerator: "CommandOrControl+Z",
						click: () => {
							// BrowserWindow.getFocusedWindow()?.webContents.undo();
							BrowserWindow.getFocusedWindow()?.webContents.send("undo");
						},
					},
					{
						label: "重做",
						accelerator: platform() === "darwin" ? "CommandOrControl+Shift+Z" : "Control+Y",
						click: () => {
							// BrowserWindow.getFocusedWindow()?.webContents.redo();
							BrowserWindow.getFocusedWindow()?.webContents.send("redo");
						},
					},
					{
						type: "separator",
					},
					{
						label: "全选",
						accelerator: "CommandOrControl+A",
						role: "selectAll",
					},
					{
						type: "separator",
					},
					{
						role: "copy",
						label: "复制",
						accelerator: "CommandOrControl+C",
					},
					{
						role: "paste",
						label: "粘贴",
						accelerator: "CommandOrControl+V",
					},
					{
						type: "separator",
					},
					{
						label: "项目...",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:edit-project"),
					},
				],
			},
			{
				label: "预览",
				submenu: [
					{
						label: "位置",
						accelerator: "CommandOrControl+T",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("gizmo:position"),
					},
					{
						label: "旋转",
						accelerator: "CommandOrControl+R",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("gizmo:rotation"),
					},
					{
						label: "缩放",
						accelerator: "CommandOrControl+D",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("gizmo:scaling"),
					},
					{
						type: "separator",
					},
					{
						label: "聚焦选中对象",
						accelerator: "CommandOrControl+F",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:focus"),
					},
					{
						type: "separator",
					},
					{
						label: "编辑相机",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:edit-camera"),
					},
					{
						type: "separator",
					},
					{
						label: "截图",
						submenu: [
							{
								type: "header",
								label: "横向",
							},
							{
								label: "720p (1280x720)",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 1280, height: 720 }),
							},
							{
								label: "1080p (1920x1080)",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 1920, height: 1080 }),
							},
							{
								label: "4K (3840x2160)",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 3840, height: 2160 }),
							},
							{
								type: "header",
								label: "方形",
							},
							{
								label: "512x512",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 512, height: 512 }),
							},
							{
								label: "1024x1024",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 1024, height: 1024 }),
							},
							{
								label: "2048x2048",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 2048, height: 2048 }),
							},
							{
								label: "4096x4096",
								click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:screenshot", { width: 4096, height: 4096 }),
							},
						],
					},
					{
						type: "separator",
					},
					{
						label: "播放场景",
						accelerator: "CommandOrControl+B",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("preview:play-scene"),
					},
				],
			},
			{
				label: "添加",
				submenu: [
					...Object.values(nodeCommandItems).map((command) => ({
						label: command.text,
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send(`add:${command.ipcRendererChannelKey}`),
					})),
					{
						type: "separator",
					},
					...Object.values(meshCommandItems).map((command) => ({
						label: command.text,
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send(`add:${command.ipcRendererChannelKey}`),
					})),
					{
						type: "separator",
					},
					...Object.values(lightCommandItems).map((command) => ({
						label: command.text,
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send(`add:${command.ipcRendererChannelKey}`),
					})),
					{
						type: "separator",
					},
					...Object.values(cameraCommandItems).map((command) => ({
						label: command.text,
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send(`add:${command.ipcRendererChannelKey}`),
					})),
					{
						type: "separator",
					},
					...Object.values(spriteCommandItems).map((command) => ({
						label: command.text,
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send(`add:${command.ipcRendererChannelKey}`),
					})),
				],
			},
			...(options.enableExperimentalFeatures
				? [
						{
							label: "视图",
							submenu: [
								{
									label: "资源市场",
									type: "checkbox" as MenuItem["type"],
									checked: options.openedTabs?.includes("marketplace"),
									click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:toggle-marketplace"),
								},
							],
						},
					]
				: []),
			{
				label: "窗口",
				submenu: [
					{
						label: "最小化",
						accelerator: "Command+M",
						click: () => BrowserWindow.getFocusedWindow()?.minimize(),
					},
					{
						label: "关闭",
						accelerator: "Command+W",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("editor:close-window"),
					},
				],
			},
			{
				label: "帮助",
				submenu: [
					{
						label: "编辑器文档...",
						click: () => shell.openExternal("https://editor.babylonjs.com/documentation"),
					},
					{
						label: "Babylon.js 文档...",
						click: () => shell.openExternal("https://doc.babylonjs.com"),
					},
					{
						type: "separator",
					},
					{
						label: "Babylon.js 论坛...",
						click: () => shell.openExternal("https://forum.babylonjs.com"),
					},
					{
						type: "separator",
					},
					{
						label: "报告问题...",
						click: () => shell.openExternal("https://forum.babylonjs.com/c/bugs"),
					},
				],
			},
		])
	);
}
