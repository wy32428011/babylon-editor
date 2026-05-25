import { Light } from "babylonjs";

import { EditorInspectorListField } from "../../fields/list";
import { EditorInspectorNumberField } from "../../fields/number";

export interface IEditorLightPBRInspectorProps {
	object: Light;
}

export function EditorLightPBRInspector(props: IEditorLightPBRInspectorProps) {
	return (
		<>
			<EditorInspectorListField
				object={props.object}
				property="intensityMode"
				label="Intensity Mode"
				items={[
					{ text: "自动", value: Light.INTENSITYMODE_AUTOMATIC },
					{ text: "光通量", value: Light.INTENSITYMODE_LUMINOUSPOWER, label: "流明 (lm)" },
					{ text: "发光强度", value: Light.INTENSITYMODE_LUMINOUSINTENSITY, label: "坎德拉 (lm/sr)" },
					{ text: "照度", value: Light.INTENSITYMODE_ILLUMINANCE, label: "勒克斯 (lm/m^2)" },
					{ text: "亮度", value: Light.INTENSITYMODE_LUMINANCE, label: "尼特 (cd/m^2)" },
				]}
			/>

			<EditorInspectorNumberField label="半径" object={props.object} property="radius" />
		</>
	);
}
