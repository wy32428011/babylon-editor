import { Component, ReactNode } from "react";

import { PBRMaterial, StandardMaterial } from "babylonjs";

import { EditorInspectorSwitchField } from "../../fields/switch";
import { EditorInspectorNumberField } from "../../fields/number";
import { EditorInspectorSectionField } from "../../fields/section";
import { EditorInspectorTextureField } from "../../fields/texture";

export interface IEditorDetailMapInspectorProps {
	material: StandardMaterial | PBRMaterial;
}

export interface IEditorDetailMapInspectorState {}

export class EditorDetailMapInspector extends Component<IEditorDetailMapInspectorProps, IEditorDetailMapInspectorState> {
	public constructor(props: IEditorDetailMapInspectorProps) {
		super(props);

		this.state = {};
	}

	public render(): ReactNode {
		return (
			<EditorInspectorSectionField title="Detail Map">
				<EditorInspectorSwitchField object={this.props.material.detailMap} property="isEnabled" label="启用" onChange={() => this.forceUpdate()} />

				{this.props.material.detailMap.isEnabled && (
					<>
						<EditorInspectorTextureField hideLevel scene={this.props.material.getScene()} object={this.props.material.detailMap} property="texture" title="纹理" />
						<EditorInspectorNumberField object={this.props.material.detailMap} property="diffuseBlendLevel" label="Diffuse Blend Level" step={0.01} min={0} max={1} />
						<EditorInspectorNumberField object={this.props.material.detailMap} property="bumpLevel" label="凹凸级别" step={0.01} min={0} max={1} />
						<EditorInspectorNumberField
							object={this.props.material.detailMap}
							property="roughnessBlendLevel"
							label="Roughness Blend Level"
							step={0.01}
							min={0}
							max={1}
						/>
					</>
				)}
			</EditorInspectorSectionField>
		);
	}
}
