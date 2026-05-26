import { toast } from "sonner";

import { Editor } from "../../editor/main";

export const safeOpenModeSaveBlockedMessage = "低硬件占用模式会跳过部分资源，为避免覆盖项目文件，请关闭该模式并重新打开项目后再保存。";

/**
 * 返回当前编辑器状态是否允许写入项目保存文件。
 */
export function canWriteProjectSaveFiles(editor: Editor): boolean {
	return !editor.state.safeOpenMode;
}

/**
 * 提示低硬件占用模式已阻止保存，避免覆盖未加载资源。
 */
export function notifySafeOpenModeSaveBlocked(editor: Editor): void {
	editor.layout.console.error(safeOpenModeSaveBlockedMessage);
	toast.error(safeOpenModeSaveBlockedMessage);
}

/**
 * 在任何项目保存写盘前统一阻止低硬件占用模式保存。
 */
export function guardProjectSaveWrite(editor: Editor): boolean {
	if (canWriteProjectSaveFiles(editor)) {
		return true;
	}

	notifySafeOpenModeSaveBlocked(editor);
	return false;
}
