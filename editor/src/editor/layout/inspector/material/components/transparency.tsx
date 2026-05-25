import { ReactNode } from "react";

import { Material } from "babylonjs";

import { EditorInspectorListField } from "../../fields/list";

export interface IEditorTransparencyModeFieldProps {
	object: Material;
	onChange?: () => void;
}

export function EditorTransparencyModeField(props: IEditorTransparencyModeFieldProps): ReactNode {
	return (
		<EditorInspectorListField
			label="透明模式"
			object={props.object}
			property="transparencyMode"
			onChange={props.onChange}
			items={[
				{ text: "无", value: null },
				{ text: "Opaque", value: Material.MATERIAL_OPAQUE },
				{ text: "Alpha 测试", value: Material.MATERIAL_ALPHATEST },
				{ text: "Alpha 混合", value: Material.MATERIAL_ALPHABLEND },
				{ text: "Alpha 测试与混合", value: Material.MATERIAL_ALPHATESTANDBLEND },
			]}
		/>
	);
}
