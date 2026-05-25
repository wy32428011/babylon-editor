import { Component, ReactNode } from "react";

import { AbstractMesh } from "babylonjs";
import { CellMaterial } from "babylonjs-materials";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorTextureField } from "../fields/texture";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorAlphaModeField } from "./components/alpha";
import { EditorTransparencyModeField } from "./components/transparency";
import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorCellMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: CellMaterial;
}

export class EditorCellMaterialInspector extends Component<IEditorCellMaterialInspectorProps> {
	public constructor(props: IEditorCellMaterialInspectorProps) {
		super(props);
	}

	public render(): ReactNode {
		return (
			<>
				<EditorInspectorSectionField title="材质" label={this.props.material.getClassName()}>
					<EditorInspectorStringField label="名称" object={this.props.material} property="name" />
					<EditorInspectorSwitchField label="背面剔除" object={this.props.material} property="backFaceCulling" />

					<EditorInspectorNumberField label="透明度" object={this.props.material} property="alpha" min={0} max={1} />
					<EditorAlphaModeField object={this.props.material} />
					<EditorTransparencyModeField object={this.props.material} />

					<EditorMaterialInspectorUtilsComponent mesh={this.props.mesh} material={this.props.material} />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Cell">
					<EditorInspectorSwitchField label="High Level" object={this.props.material} property="computeHighLevel" />
					<EditorInspectorTextureField hideLevel object={this.props.material} title="纹理" property="diffuseTexture" />
					<EditorInspectorColorField label={<div className="w-14">颜色</div>} object={this.props.material} property="diffuseColor" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="杂项">
					<EditorInspectorSwitchField label="Disable Lighting" object={this.props.material} property="disableLighting" />
				</EditorInspectorSectionField>
			</>
		);
	}
}
