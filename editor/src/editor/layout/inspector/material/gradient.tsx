import { Component, ReactNode } from "react";

import { AbstractMesh } from "babylonjs";
import { GradientMaterial } from "babylonjs-materials";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorAlphaModeField } from "./components/alpha";
import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorGradientMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: GradientMaterial;
}

export class EditorGradientMaterialInspector extends Component<IEditorGradientMaterialInspectorProps> {
	public constructor(props: IEditorGradientMaterialInspectorProps) {
		super(props);
	}

	public render(): ReactNode {
		return (
			<>
				<EditorInspectorSectionField title="材质" label={this.props.material.getClassName()}>
					<EditorInspectorStringField label="名称" object={this.props.material} property="name" />
					<EditorInspectorSwitchField label="背面剔除" object={this.props.material} property="backFaceCulling" />

					<EditorAlphaModeField object={this.props.material} />

					<EditorMaterialInspectorUtilsComponent mesh={this.props.mesh} material={this.props.material} />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="渐变">
					<EditorInspectorColorField label={<div className="w-14">顶部</div>} object={this.props.material} property="topColor" />
					<EditorInspectorColorField label={<div className="w-14">底部</div>} object={this.props.material} property="bottomColor" />

					<EditorInspectorNumberField label="顶部颜色 Alpha" object={this.props.material} property="topColorAlpha" min={0} max={1} />
					<EditorInspectorNumberField label="底部颜色 Alpha" object={this.props.material} property="bottomColorAlpha" min={0} max={1} />

					<EditorInspectorNumberField label="缩放 (倍)" object={this.props.material} property="scale" min={-1} max={1} />
					<EditorInspectorNumberField label="偏移" object={this.props.material} property="offset" />
					<EditorInspectorNumberField label="平滑度" object={this.props.material} property="smoothness" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="杂项">
					<EditorInspectorSwitchField label="Disable Lighting" object={this.props.material} property="disableLighting" />
				</EditorInspectorSectionField>
			</>
		);
	}
}
