import { join } from "path/posix";
import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen } from "electron";

import { closeAllNodePtyForWebContentsId } from "../electron/node-pty";

/**
 * 定义当前已打开的编辑器窗口列表。
 */
export const editorWindows: BrowserWindow[] = [];

/**
 * 创建主编辑器窗口，并等待渲染进程和编辑器布局初始化完成后显示。
 * @returns 新创建的编辑器窗口。
 */
export async function createEditorWindow(): Promise<BrowserWindow> {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = {
		width: primaryDisplay.workAreaSize.width * 0.75,
		height: primaryDisplay.workAreaSize.height * 0.75,
	};

	const window = new BrowserWindow({
		show: false,
		frame: false,
		closable: true,
		minimizable: true,
		maximizable: true,
		transparent: false,
		titleBarStyle: "hidden",
		width: width,
		height: height,
		webPreferences: {
			nodeIntegration: true,
			nodeIntegrationInWorker: true,
			contextIsolation: process.env.DEBUG !== "true",
			preload: join(app.getAppPath(), "build/src/editor/preload.js"),
		},
	});

	editorWindows.push(window);

	if (process.env.DEBUG !== "true") {
		window.menuBarVisible = false;
	}

	let checkClose = true;

	window.on("close", (event) => {
		if (!checkClose) {
			return;
		}

		window.focus();

		const close = showCloseEditorWindowsDialog(window);

		if (!close) {
			return event.preventDefault();
		}

		checkClose = false;

		BrowserWindow.getAllWindows()
			.slice(0)
			.forEach((w) => {
				if (w.getParentWindow() === window) {
					w.close();
					closeAllNodePtyForWebContentsId(w.webContents.id);
				}
			});

		window.webContents.send("editor:closed");

		const index = editorWindows.indexOf(window);
		if (index !== -1) {
			editorWindows.splice(index, 1);
		}

		closeAllNodePtyForWebContentsId(window.webContents.id);
	});

	window.loadURL(join("file://", app.getAppPath(), "index.html"));

	if (process.env.DEBUG) {
		setTimeout(() => {
			window.webContents.openDevTools();
		}, 1000);
	}

	const splash = new BrowserWindow({
		width: 480,
		height: 320,
		frame: false,
		alwaysOnTop: true,
		transparent: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: process.env.DEBUG !== "true",
			preload: join(app.getAppPath(), "build/src/splash/preload.js"),
		},
	});

	splash.loadURL(join("file://", app.getAppPath(), "index.html"));
	splash.center();

	await Promise.all([
		new Promise<void>((resolve) => {
			window.webContents.once("did-finish-load", () => resolve());
		}),
		new Promise<void>((resolve) => {
			ipcMain.once("editor:ready", () => resolve());
		}),
	]);

	splash.close();

	window.show();
	window.focus();

	return window;
}

/**
 * 创建自定义编辑器子窗口，并把入口脚本和启动参数发送给该窗口。
 * @param indexPath 定义窗口入口脚本路径，路径相对应用根目录。
 * @param options 定义传递给窗口主组件的启动参数。
 * @example ipcRenderer.send("window:open", "build/src/editor/windows/nme", { filePath: "my-material.material"  });
 */
export async function createCustomWindow(indexPath: string, options: any): Promise<BrowserWindow> {
	const window = new BrowserWindow({
		show: true,
		frame: false,
		closable: true,
		minimizable: true,
		maximizable: true,
		titleBarStyle: "hidden",
		width: 1280,
		height: 800,
		webPreferences: {
			nodeIntegration: true,
			nodeIntegrationInWorker: true,
			contextIsolation: process.env.DEBUG !== "true",
			preload: join(app.getAppPath(), "build/src/editor/windows/preload.js"),
		},
	});

	if (process.env.DEBUG !== "true") {
		window.menuBarVisible = false;
	}

	window.loadURL(join("file://", app.getAppPath(), "index.html"));

	if (process.env.DEBUG) {
		setTimeout(() => {
			window.webContents.openDevTools();
		}, 1000);
	}

	window.webContents.on("did-finish-load", () => {
		window.webContents.send("editor:window-launch-data", join(app.getAppPath(), indexPath), options);
	});

	return window;
}

/**
 * 显示关闭编辑器窗口确认框，避免误触导致当前项目窗口被关闭。
 * @param window 定义需要显示确认框的父窗口。
 */
export function showCloseEditorWindowsDialog(window: BrowserWindow): boolean {
	const result = dialog.showMessageBoxSync(window, {
		type: "question",
		buttons: ["是", "否"],
		title: "关闭窗口",
		message: "确定要关闭窗口吗？",
		icon: nativeImage.createFromPath(join(app.getAppPath(), "assets/ZENDING_EN.png")),
	});

	return result === 0;
}
