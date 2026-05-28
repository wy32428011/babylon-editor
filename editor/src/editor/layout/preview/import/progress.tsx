import { basename } from "path/posix";

import { Component, ReactNode } from "react";

import { Progress } from "../../../../ui/shadcn/ui/progress";

export interface IEditorPreviewConvertProgressProps {
	absolutePath: string;
}

export interface IEditorPreviewConvertProgressState {
	value: number;
}

export class EditorPreviewConvertProgress extends Component<IEditorPreviewConvertProgressProps, IEditorPreviewConvertProgressState> {
	public constructor(props: IEditorPreviewConvertProgressProps) {
		super(props);

		this.state = {
			value: 0,
		};
	}

	public render(): ReactNode {
		return (
			<div className="flex flex-col gap-2">
				<div>Converting scene {basename(this.props.absolutePath)}...</div>
				<Progress value={this.state.value} />
			</div>
		);
	}
}

export interface IEditorPreviewCadImportProgressProps {
	absolutePath: string;
	message: string;
	value: number;
	error?: boolean;
}

/**
 * CAD 图纸导入进度条，使用分阶段进度让复制、转换、加载和落地过程都有可见反馈。
 */
export class EditorPreviewCadImportProgress extends Component<IEditorPreviewCadImportProgressProps> {
	public render(): ReactNode {
		return (
			<div className="flex flex-col gap-2 min-w-[280px]">
				<div className={this.props.error ? "text-red-500" : ""}>
					{this.props.message}：{basename(this.props.absolutePath)}
				</div>
				<Progress value={this.props.value} />
			</div>
		);
	}
}
