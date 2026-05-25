import { BrowserWindow, Menu, ipcMain } from "electron";

import { isDarwin } from "../tools/os";

export function setupDashboardMenu(): void {
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
						click: () => ipcMain.emit("app:quit"),
						label: "退出 Babylon.js Editor",
						accelerator: "CommandOrControl+Q",
					},
				],
			},
			{
				label: "Files",
				submenu: [
					{
						label: "导入项目...",
						accelerator: "CommandOrControl+I",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("dashboard:import-project"),
					},
					{
						type: "separator",
					},
					{
						label: "新建项目...",
						accelerator: "CommandOrControl+N",
						click: () => BrowserWindow.getFocusedWindow()?.webContents.send("dashboard:new-project"),
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
							BrowserWindow.getFocusedWindow()?.webContents.undo();
							// BrowserWindow.getFocusedWindow()?.webContents.send("undo");
						},
					},
					{
						label: "重做",
						accelerator: isDarwin() ? "CommandOrControl+Shift+Z" : "Control+Y",
						click: () => {
							BrowserWindow.getFocusedWindow()?.webContents.redo();
							// BrowserWindow.getFocusedWindow()?.webContents.send("redo");
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
				],
			},
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
						click: () => BrowserWindow.getFocusedWindow()?.close(),
					},
				],
			},
		])
	);
}
