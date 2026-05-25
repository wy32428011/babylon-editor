import { Component, ReactNode } from "react";
import { Divider } from "@blueprintjs/core";

import { HemisphericLight } from "babylonjs";

import { isHemisphericLight } from "../../../../tools/guards/nodes";
import { onNodeModifiedObservable } from "../../../../tools/observables";

import { IEditorInspectorImplementationProps } from "../inspector";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorVectorField } from "../fields/vector";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSectionField } from "../fields/section";

import { ScriptInspectorComponent } from "../script/script";
import { CustomMetadataInspector } from "../metadata/custom-metadata";

export class EditorHemisphericLightInspector extends Component<IEditorInspectorImplementationProps<HemisphericLight>> {
	/**
	 * Returns whether or not the given object is supported by this inspector.
	 * @param object defines the object to check.
	 * @returns true if the object is supported by this inspector.
	 */
	public static IsSupported(object: unknown): boolean {
		return isHemisphericLight(object);
	}

	public render(): ReactNode {
		return (
			<>
				<EditorInspectorSectionField title="通用">
					<div className="flex justify-between items-center px-2 py-2">
						<div className="w-1/2">类型</div>

						<div className="text-white/50 w-full">{this.props.object.getClassName()}</div>
					</div>
					<EditorInspectorStringField
						label="名称"
						object={this.props.object}
						property="name"
						onChange={() => onNodeModifiedObservable.notifyObservers(this.props.object)}
					/>
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="变换">
					<EditorInspectorVectorField label={<div className="w-14">Direction</div>} object={this.props.object} property="direction" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="浅色">
					<EditorInspectorColorField label={<div className="w-14">地面</div>} object={this.props.object} property="groundColor" />
					<EditorInspectorColorField label={<div className="w-14">Diffuse</div>} object={this.props.object} property="diffuse" />
					<EditorInspectorColorField label={<div className="w-14">高光</div>} object={this.props.object} property="specular" />

					<Divider />

					<EditorInspectorNumberField label="强度" object={this.props.object} property="intensity" />
				</EditorInspectorSectionField>

				<ScriptInspectorComponent editor={this.props.editor} object={this.props.object} />

				<CustomMetadataInspector object={this.props.object} />
			</>
		);
	}
}
