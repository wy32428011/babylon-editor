import { Component, ReactNode } from "react";

import { AbstractMesh } from "babylonjs";
import { LavaMaterial } from "babylonjs-materials";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorTextureField } from "../fields/texture";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorLavaMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: LavaMaterial;
}

export class EditorLavaMaterialInspector extends Component<IEditorLavaMaterialInspectorProps> {
	public constructor(props: IEditorLavaMaterialInspectorProps) {
		super(props);
	}

	public render(): ReactNode {
		return (
			<>
				<EditorInspectorSectionField title="材质" label={this.props.material.getClassName()}>
					<EditorInspectorStringField label="名称" object={this.props.material} property="name" />
					<EditorInspectorSwitchField label="背面剔除" object={this.props.material} property="backFaceCulling" />

					<EditorMaterialInspectorUtilsComponent mesh={this.props.mesh} material={this.props.material} />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="熔岩">
					<EditorInspectorTextureField hideLevel object={this.props.material} title="Diffuse Texture" property="diffuseTexture" />
					<EditorInspectorTextureField hideLevel object={this.props.material} title="Noise Texture" property="noiseTexture" />

					<EditorInspectorNumberField object={this.props.material} property="speed" label="速度" />
					<EditorInspectorNumberField object={this.props.material} property="movingSpeed" label="Moving Speed" />
					<EditorInspectorNumberField object={this.props.material} property="lowFrequencySpeed" label="Low Frequency Speed" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Fog">
					<EditorInspectorColorField object={this.props.material} property="fogColor" label="颜色" />
					<EditorInspectorNumberField object={this.props.material} property="fogDensity" label="Density" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="杂项">
					<EditorInspectorSwitchField label="无光照" object={this.props.material} property="unlit" />
					<EditorInspectorSwitchField label="Disable Lighting" object={this.props.material} property="disableLighting" />
				</EditorInspectorSectionField>
			</>
		);
	}
}
