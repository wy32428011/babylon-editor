import { Mesh, CreateBoxVertexData } from "babylonjs";

import { Editor } from "../../../../main";

import { EditorInspectorListField } from "../../fields/list";
import { EditorInspectorNumberField } from "../../fields/number";
import { EditorInspectorSectionField } from "../../fields/section";

import { getProxy } from "./proxy";

export interface IBoxMeshGeometryInspectorProps {
	object: Mesh;
	editor: Editor;
}

export function BoxMeshGeometryInspector(props: IBoxMeshGeometryInspectorProps) {
	const proxy = getProxy(props.object.metadata, () => {
		handleUpdateGeometry();
	});

	function handleUpdateGeometry() {
		props.object.geometry?.setAllVerticesData(
			CreateBoxVertexData({
				width: props.object.metadata.width,
				height: props.object.metadata.height,
				depth: props.object.metadata.depth,
				sideOrientation: props.object.metadata.sideOrientation,
			}),
			false
		);

		props.object.refreshBoundingInfo({
			updatePositionsArray: true,
		});
	}

	return (
		<EditorInspectorSectionField title="盒体">
			<EditorInspectorNumberField object={proxy} property="width" label="宽度 (m)" step={0.1} />
			<EditorInspectorNumberField object={proxy} property="height" label="高度 (m)" step={0.1} />
			<EditorInspectorNumberField object={proxy} property="depth" label="深度 (m)" step={0.1} />
			<EditorInspectorListField
				object={proxy}
				property="sideOrientation"
				label="Side Orientation"
				items={[
					{ text: "正面", value: Mesh.FRONTSIDE },
					{ text: "背面", value: Mesh.BACKSIDE },
				]}
			/>
		</EditorInspectorSectionField>
	);
}
