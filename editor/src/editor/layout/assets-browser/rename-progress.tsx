import { Component, ReactNode } from "react";

import { Grid } from "react-loader-spinner";

export class EditorAssetsBrowserRenameProgressComponent extends Component {
	public render(): ReactNode {
		return (
			<div className="flex gap-5 items-center w-full">
				<Grid width={24} height={24} color="gray" />

				<div className="font-semibold">正在更新资源链接...</div>
			</div>
		);
	}
}
