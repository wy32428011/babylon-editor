import { ipcRenderer } from "electron";

import { ipcSendAsyncWithMessageId } from "../ipc";
import { ICadDwgConversionRequest, ICadDwgConversionResponse } from "./types";

/**
 * 通过 Electron 主进程把 DWG 转换为 DXF；Web 环境不支持直接执行外部转换器。
 * @param request 定义 DWG 输入、DXF 输出和可选转换器路径。
 */
export async function convertCadDwgToDxf(request: ICadDwgConversionRequest): Promise<ICadDwgConversionResponse> {
	if (!ipcRenderer) {
		return {
			ok: false,
			code: "CAD_DWG_CONVERTER_UNSUPPORTED",
			message: "当前环境不支持 DWG 转 DXF。请在 Electron 桌面编辑器中导入 DWG，或先使用 ODA File Converter / CAD 软件手动转换为 DXF。",
		};
	}

	return ipcSendAsyncWithMessageId<ICadDwgConversionResponse>("editor:cad:convert-dwg-to-dxf", request);
}
