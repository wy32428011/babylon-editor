import { useState } from "react";
import { Grid } from "react-loader-spinner";

import { Button } from "../../../ui/shadcn/ui/button";

import { wait } from "../../../tools/tools";

import { Editor } from "../../main";

import { EditorInspectorNumberField } from "../inspector/fields/number";
import { EditorInspectorSectionField } from "../inspector/fields/section";

import { NavMeshEditor } from "./editor";

export interface INavMeshEditorInspectorProps {
	editor: Editor;
	navMeshEditor: NavMeshEditor;
}

export function NavMeshEditorInspector(props: INavMeshEditorInspectorProps) {
	const parameters = props.navMeshEditor.configuration.navMeshParameters;

	const [building, setBuilding] = useState(false);

	async function handleRebuildNavMesh() {
		setBuilding(true);

		await wait(0);
		await props.navMeshEditor.updateNavMesh();

		setBuilding(false);
	}

	return (
		<div className="flex flex-col gap-2 w-80 h-full p-2">
			<div className="flex justify-center items-center">检查器</div>

			<EditorInspectorSectionField title="Parameters">
				<EditorInspectorNumberField object={parameters} property="cs" label="单元大小" min={10} step={0.1} />
				<EditorInspectorNumberField object={parameters} property="ch" label="单元高度" min={0.1} step={0.1} />

				<EditorInspectorNumberField object={parameters} property="walkableHeight" label="可行走高度" min={0.1} step={0.1} />
				<EditorInspectorNumberField object={parameters} property="walkableRadius" label="可行走半径" min={0.1} step={0.1} />
				<EditorInspectorNumberField object={parameters} property="walkableSlopeAngle" label="可行走坡度角" min={0.1} max={90} step={0.1} />
				<EditorInspectorNumberField object={parameters} property="walkableClimb" label="可攀爬高度" min={0.1} step={0.1} />

				<Button className="flex items-center gap-2" disabled={building} onClick={handleRebuildNavMesh}>
					{building && <Grid width={16} height={16} color="gray" />}
					Rebuild NavMesh
				</Button>
			</EditorInspectorSectionField>
		</div>
	);
}
