import { platform } from "os";
import { ipcMain } from "electron";
import { spawn, IPty } from "node-pty";
import { pathExistsSync } from "fs-extra";

interface IStoredNodePty {
	pty: IPty;
	exited: boolean;
	webContentsId: number;
}

const spawnsMap = new Map<string, IStoredNodePty>();

/**
 * 获取异常消息，兼容 Electron 主进程里非 Error 类型的抛出值。
 * @param error 定义捕获到的异常对象。
 */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * 安全关闭并移除指定的 node-pty 进程，避免已退出进程再次抛出主进程异常。
 * @param id 定义 node-pty 实例 id。
 * @param stored 定义当前缓存的 node-pty 记录。
 */
function closeNodePty(id: string, stored: IStoredNodePty): void {
	if (!stored.exited) {
		try {
			stored.pty.kill();
		} catch (error) {
			console.warn(`Node pty "${id}" was already closed: ${getErrorMessage(error)}`);
		}
	}

	stored.exited = true;
	spawnsMap.delete(id);
}

/**
 * 安全执行 node-pty 操作，操作失败时清理缓存，避免主进程弹出未捕获异常。
 * @param id 定义 node-pty 实例 id。
 * @param action 定义需要执行的 pty 操作。
 */
function tryUseNodePty(id: string, action: (stored: IStoredNodePty) => void): void {
	const stored = spawnsMap.get(id);
	if (!stored || stored.exited) {
		return;
	}

	try {
		action(stored);
	} catch (error) {
		stored.exited = true;
		spawnsMap.delete(id);
		console.warn(`Node pty "${id}" operation ignored after exit: ${getErrorMessage(error)}`);
	}
}

/**
 * 关闭指定窗口创建的所有 node-pty 进程。
 * @param id 定义需要清理 node-pty 进程的窗口 webContents id。
 * @example closeAllNodePtyForWebContentsId(window.webContents.id);
 */
export function closeAllNodePtyForWebContentsId(id: number) {
	for (const [key, value] of spawnsMap) {
		if (value.webContentsId === id) {
			closeNodePty(key, value);
		}
	}
}

// 创建新的 node-pty 进程。
ipcMain.on("editor:create-node-pty", (ev, command, id, options, forcedShell) => {
	let shell = process.env[platform() === "win32" ? "COMSPEC" : "SHELL"] ?? null;
	if (forcedShell && forcedShell !== "Automatic" && pathExistsSync(forcedShell)) {
		shell = forcedShell;
	}

	if (!shell) {
		return ev.sender.send("editor:create-node-pty", null);
	}

	const args: string[] = [];
	if (platform() === "darwin") {
		args.push("-l");
	}

	const p = spawn(shell!, args, {
		cols: 80,
		rows: 30,
		name: "xterm-color",
		encoding: "utf-8",
		useConpty: false,
		...options,
	});

	p.onData((data) => {
		if (!ev.sender.isDestroyed()) {
			ev.sender.send(`editor:node-pty-data:${id}`, data);
		}
	});

	p.onExit((event) => {
		const stored = spawnsMap.get(id);
		if (stored) {
			stored.exited = true;
		}

		spawnsMap.delete(id);
		if (!ev.sender.isDestroyed()) {
			ev.sender.send(`editor:node-pty-exit:${id}`, event.exitCode);
		}
	});

	spawnsMap.set(id, {
		pty: p,
		exited: false,
		webContentsId: ev.sender.id,
	});

	ev.sender.send(`editor:create-node-pty-${id}`);

	const hasBackSlashes = shell!.toLowerCase() === process.env["COMSPEC"]?.toLowerCase();

	tryUseNodePty(id, (stored) => {
		if (hasBackSlashes) {
			stored.pty.write(`${command.replace(/\//g, "\\")}\n\r`);
		} else {
			stored.pty.write(`${command}\n\r`);
		}

		stored.pty.write("exit\n\r");
	});
});

// 向 node-pty 进程写入数据。
ipcMain.on("editor:node-pty-write", (_, id, data) => {
	tryUseNodePty(id, (stored) => stored.pty.write(data));
});

// 关闭 node-pty 进程。
ipcMain.on("editor:kill-node-pty", (_, id) => {
	const stored = spawnsMap.get(id);
	if (stored) {
		closeNodePty(id, stored);
	}
});

// 调整 node-pty 终端尺寸。
ipcMain.on("editor:resize-node-pty", (_, id, cols, rows) => {
	const safeCols = Math.max(1, Math.floor(Number(cols)));
	const safeRows = Math.max(1, Math.floor(Number(rows)));

	if (!Number.isFinite(safeCols) || !Number.isFinite(safeRows)) {
		return;
	}

	tryUseNodePty(id, (stored) => stored.pty.resize(safeCols, safeRows));
});
