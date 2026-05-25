import { Component, ReactNode } from "react";

import { AbstractMesh } from "babylonjs";
import { GridMaterial } from "babylonjs-materials";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorVectorField } from "../fields/vector";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorGridMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: GridMaterial;
}

export class EditorGridMaterialInspector extends Component<IEditorGridMaterialInspectorProps> {
	public constructor(props: IEditorGridMaterialInspectorProps) {
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

				<EditorInspectorSectionField title="Grid">
					<EditorInspectorVectorField object={this.props.material} property="gridOffset" label="偏移" />
					<EditorInspectorNumberField object={this.props.material} property="gridRatio" label="Ratio" min={0} max={10} />
					<EditorInspectorNumberField object={this.props.material} property="majorUnitFrequency" label="Major Unit Frequency" min={0} max={100} />
					<EditorInspectorNumberField object={this.props.material} property="minorUnitVisibility" label="Minor Unit Visibility" min={0} max={1} />
					<EditorInspectorNumberField object={this.props.material} property="gridVisibility" label="可见性" min={0} max={1} />
					<EditorInspectorNumberField object={this.props.material} property="opacity" label="不透明度" min={0} max={1} />
					<EditorInspectorSwitchField object={this.props.material} property="preMultiplyAlpha" label="Pre-multiply Alpha" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="颜色">
					<EditorInspectorColorField object={this.props.material} property="mainColor" label="Main" />
					<EditorInspectorColorField object={this.props.material} property="lineColor" label="Line" />
				</EditorInspectorSectionField>
			</>
		);
	}
}
