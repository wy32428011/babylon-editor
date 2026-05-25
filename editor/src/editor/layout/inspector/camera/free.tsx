import { Component, ReactNode } from "react";

import { Divider } from "@blueprintjs/core";

import { FreeCamera, Node, Observer } from "babylonjs";

import { isFreeCamera } from "../../../../tools/guards/nodes";
import { onNodeModifiedObservable } from "../../../../tools/observables";

import { onGizmoNodeChangedObservable } from "../../preview/gizmo/gizmo";

import { IEditorInspectorImplementationProps } from "../inspector";

import { EditorInspectorKeyField } from "../fields/key";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorVectorField } from "../fields/vector";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSectionField } from "../fields/section";

import { ScriptInspectorComponent } from "../script/script";
import { CustomMetadataInspector } from "../metadata/custom-metadata";

import { CameraModeInspector } from "./utils/mode";
import { FocalLengthInspector } from "./utils/focal";

export class EditorFreeCameraInspector extends Component<IEditorInspectorImplementationProps<FreeCamera>> {
	/**
	 * Returns whether or not the given object is supported by this inspector.
	 * @param object defines the object to check.
	 * @returns true if the object is supported by this inspector.
	 */
	public static IsSupported(object: any): boolean {
		return isFreeCamera(object);
	}

	public render(): ReactNode {
		return (
			<>
				<div className="text-center text-3xl">自由相机</div>

				<EditorInspectorSectionField title="通用">
					<EditorInspectorStringField
						label="名称"
						object={this.props.object}
						property="name"
						onChange={() => onNodeModifiedObservable.notifyObservers(this.props.object)}
					/>
					<EditorInspectorNumberField object={this.props.object} property="speed" label="速度" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="变换">
					<EditorInspectorVectorField label={<div className="w-14">位置</div>} object={this.props.object} property="position" />
					<EditorInspectorVectorField asDegrees label={<div className="w-14">旋转</div>} object={this.props.object} property="rotation" step={0.1} />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Fov">
					<EditorInspectorNumberField object={this.props.object} property="minZ" label="Min Z" min={0.01} />
					<EditorInspectorNumberField object={this.props.object} property="maxZ" label="Max Z" />
					<FocalLengthInspector camera={this.props.object} />
				</EditorInspectorSectionField>

				<CameraModeInspector camera={this.props.object} onUpdate={() => this.forceUpdate()} />

				<EditorInspectorSectionField title="相机">
					<EditorInspectorNumberField object={this.props.object} property="speed" label="速度" min={0} />
					<EditorInspectorNumberField object={this.props.object} property="inertia" label="Inertia" min={0} max={0.99} />
					<EditorInspectorNumberField object={this.props.object} property="angularSensibility" label="角度灵敏度" min={0} />
				</EditorInspectorSectionField>

				<ScriptInspectorComponent editor={this.props.editor} object={this.props.object} />

				<EditorInspectorSectionField title="Keys">
					<EditorInspectorKeyField value={this.props.object.keysUp[0]?.toString() ?? ""} onChange={(v) => (this.props.object.keysUp = [v])} label="向前" />
					<EditorInspectorKeyField value={this.props.object.keysDown[0]?.toString() ?? ""} onChange={(v) => (this.props.object.keysDown = [v])} label="向后" />

					<EditorInspectorKeyField value={this.props.object.keysLeft[0]?.toString() ?? ""} onChange={(v) => (this.props.object.keysLeft = [v])} label="左侧" />
					<EditorInspectorKeyField value={this.props.object.keysRight[0]?.toString() ?? ""} onChange={(v) => (this.props.object.keysRight = [v])} label="右侧" />

					<Divider />

					<EditorInspectorKeyField value={this.props.object.keysUpward[0]?.toString() ?? ""} onChange={(v) => (this.props.object.keysUpward = [v])} label="上" />
					<EditorInspectorKeyField value={this.props.object.keysDownward[0]?.toString() ?? ""} onChange={(v) => (this.props.object.keysDownward = [v])} label="下" />
				</EditorInspectorSectionField>

				<CustomMetadataInspector object={this.props.object} />
			</>
		);
	}

	private _gizmoObserver: Observer<Node> | null = null;

	public componentDidMount(): void {
		this._gizmoObserver = onGizmoNodeChangedObservable.add((node) => {
			if (node === this.props.object) {
				this.props.editor.layout.inspector.forceUpdate();
			}
		});
	}

	public componentWillUnmount(): void {
		if (this._gizmoObserver) {
			onGizmoNodeChangedObservable.remove(this._gizmoObserver);
		}
	}
}
