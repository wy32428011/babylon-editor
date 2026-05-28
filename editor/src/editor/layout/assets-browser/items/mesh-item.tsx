import { pathExists, writeJSON } from "fs-extra";
import { extname } from "path/posix";

import { ReactNode } from "react";

import { SiConvertio } from "react-icons/si";
import { BiSolidCube } from "react-icons/bi";
import { LuFileInput } from "react-icons/lu";

import { Scene, SceneSerializer } from "babylonjs";

import { SpinnerUIComponent } from "../../../../ui/spinner";
import { ContextMenuItem } from "../../../../ui/shadcn/ui/context-menu";

import { loadImportedSceneFile } from "../../preview/import/import";

import { computeOrGetThumbnail } from "../../../../tools/assets/thumbnail";

import { AssetsBrowserItem } from "./item";

const convertingFiles: string[] = [];
const cadDrawingExtensions = new Set([".dxf", ".dwg"]);
const sceneFileConversionBlockedExtensions = new Set([".dxf", ".dwg"]);

export class AssetBrowserMeshItem extends AssetsBrowserItem {
	private _thumbnailError: boolean = false;
	private _thumbnailBase64: string | null = null;

	/**
	 * @override
	 */
	public async componentDidMount(): Promise<void> {
		await super.componentDidMount();
		await this._computeThumbnail();
	}

	/**
	 * @override
	 */
	protected getContextMenuContent(): ReactNode {
		if (canImportCadDrawing(this.props.absolutePath)) {
			return (
				<ContextMenuItem className="flex items-center gap-2" onClick={() => this._handleImportCadDrawing()}>
					<LuFileInput className="w-5 h-5" /> 导入 CAD 图纸
				</ContextMenuItem>
			);
		}

		if (!canConvertSceneFileToBabylon(this.props.absolutePath)) {
			return null;
		}

		return (
			<>
				<ContextMenuItem className="flex items-center gap-2" onClick={() => this._handleConvertSceneFileToBabylon()}>
					<SiConvertio className="w-5 h-5" /> Convert to .babylon
				</ContextMenuItem>
			</>
		);
	}

	/**
	 * @override
	 */
	protected getIcon(): ReactNode {
		const index = convertingFiles.indexOf(this.props.absolutePath);
		if (index !== -1) {
			return <SpinnerUIComponent width="64px" />;
		}

		if (this._thumbnailBase64) {
			return <img alt="" src={this._thumbnailBase64} className="w-[120px] aspect-square object-contain ring-blue-500 ring-2 rounded-lg" />;
		}

		if (this._thumbnailError) {
			return <BiSolidCube size="64px" />;
		}

		return <SpinnerUIComponent width="64px" />;
	}

	private async _computeThumbnail(): Promise<void> {
		if (!(await pathExists(this.props.absolutePath))) {
			return;
		}

		this._thumbnailBase64 = await computeOrGetThumbnail(this.props.editor, {
			type: "mesh",
			absolutePath: this.props.absolutePath,
		});

		if (!this._thumbnailBase64) {
			this._thumbnailError = true;
		}

		this.forceUpdate();
	}

	private async _handleConvertSceneFileToBabylon(): Promise<void> {
		const selectedFiles = this.props.editor.layout.assets.state.selectedKeys.filter(canConvertSceneFileToBabylon);

		await Promise.all(
			selectedFiles.map(async (file) => {
				if (convertingFiles.includes(file)) {
					return;
				}

				convertingFiles.push(file);
				this.props.onRefresh();

				try {
					const scene = new Scene(this.props.editor.layout.preview.engine);
					const result = await loadImportedSceneFile(scene, file);
					if (!result) {
						return;
					}

					const data = await SceneSerializer.SerializeAsync(scene);
					await writeJSON(`${file}.babylon`, data, "utf-8");
				} finally {
					const index = convertingFiles.indexOf(file);
					if (index !== -1) {
						convertingFiles.splice(index, 1);
					}

					this.props.onRefresh();
				}
			})
		);
	}

	/**
	 * 从资产浏览器显式导入 CAD 图纸，统一走预览画布的 1:1 贴地和错误日志流程。
	 */
	private async _handleImportCadDrawing(): Promise<void> {
		const selectedCadFiles = this.props.editor.layout.assets.state.selectedKeys.filter(canImportCadDrawing);
		const files = selectedCadFiles.includes(this.props.absolutePath) ? selectedCadFiles : [this.props.absolutePath];

		for (const file of files) {
			await this.props.editor.layout.preview.importCadDrawing(file);
		}
	}
}

/**
 * 判断资产浏览器模型文件是否可以直接转换为 .babylon；DWG 需要先走 CAD 自动转换入口。
 * @param file 定义需要检查的资源路径。
 */
function canConvertSceneFileToBabylon(file: string): boolean {
	return !sceneFileConversionBlockedExtensions.has(extname(file).toLowerCase());
}

/**
 * 判断资产是否是 CAD 图纸，CAD 需要走专用导入流程以保持 1:1 比例和 DWG 自动转换日志。
 * @param file 定义需要检查的资源路径。
 */
function canImportCadDrawing(file: string): boolean {
	return cadDrawingExtensions.has(extname(file).toLowerCase());
}
