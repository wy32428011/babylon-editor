import { Component, ReactNode } from "react";

import { AbstractMesh } from "babylonjs";
import { NormalMaterial } from "babylonjs-materials";

import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorNormalMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: NormalMaterial;
}

export class EditorNormalMaterialInspector extends Component<IEditorNormalMaterialInspectorProps> {
	public constructor(props: IEditorNormalMaterialInspectorProps) {
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
			</>
		);
	}
}
