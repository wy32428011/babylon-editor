import { ReactNode } from "react";

import { StandardMaterial, AbstractMesh } from "babylonjs";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorTextureField } from "../fields/texture";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorAlphaModeField } from "./components/alpha";
import { EditorDetailMapInspector } from "./components/detail";
import { EditorTransparencyModeField } from "./components/transparency";
import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorStandardMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: StandardMaterial;
}

export function EditorStandardMaterialInspector(props: IEditorStandardMaterialInspectorProps): ReactNode {
	return (
		<>
			<EditorInspectorSectionField title="材质" label={props.material.getClassName()}>
				<EditorInspectorStringField label="名称" object={props.material} property="name" />
				<EditorInspectorSwitchField label="背面剔除" object={props.material} property="backFaceCulling" />

				<EditorInspectorNumberField label="透明度" object={props.material} property="alpha" min={0} max={1} />
				<EditorAlphaModeField object={props.material} />
				<EditorTransparencyModeField object={props.material} />

				<EditorMaterialInspectorUtilsComponent mesh={props.mesh} material={props.material} />
			</EditorInspectorSectionField>

			<EditorInspectorSectionField title="Material Textures">
				<EditorInspectorTextureField object={props.material} title="Diffuse Texture" property="diffuseTexture" onChange={() => {}}>
					<EditorInspectorSwitchField label="使用 Alpha" object={props.material} property="useAlphaFromDiffuseTexture" />
				</EditorInspectorTextureField>

				<EditorInspectorTextureField object={props.material} title="凹凸纹理" property="bumpTexture" onChange={() => {}}>
					<EditorInspectorSwitchField label="Invert X" object={props.material} property="invertNormalMapX" />
					<EditorInspectorSwitchField label="Invert Y" object={props.material} property="invertNormalMapY" />
					<EditorInspectorSwitchField label="使用视差" object={props.material} property="useParallax" onChange={() => {}} />

					{props.material.useParallax && (
						<>
							<EditorInspectorSwitchField label="使用视差遮蔽" object={props.material} property="useParallaxOcclusion" />
							<EditorInspectorNumberField label="Parallax Scale Bias" object={props.material} property="parallaxScaleBias" />
						</>
					)}
				</EditorInspectorTextureField>

				<EditorInspectorTextureField object={props.material} title="高光纹理" property="specularTexture" />
				<EditorInspectorTextureField object={props.material} title="环境纹理" property="ambientTexture" onChange={() => {}}>
					{props.material.ambientTexture && (
						<>
							<EditorInspectorSwitchField label="使用灰度" object={props.material} property="useAmbientInGrayScale" />
							<EditorInspectorNumberField label="强度" object={props.material} property="ambientTextureStrength" min={0} />
						</>
					)}
				</EditorInspectorTextureField>
				<EditorInspectorTextureField object={props.material} title="Opacity Texture" property="opacityTexture" />
				<EditorInspectorTextureField object={props.material} title="自发光纹理" property="emissiveTexture" />

				<EditorInspectorTextureField object={props.material} title="反射纹理" property="reflectionTexture" acceptCubeTexture onChange={() => {}} />
			</EditorInspectorSectionField>

			<EditorInspectorSectionField title="Material Colors">
				<EditorInspectorColorField label={<div className="w-14">Diffuse</div>} object={props.material} property="diffuseColor" />
				<EditorInspectorColorField label={<div className="w-14">高光</div>} object={props.material} property="specularColor" />
				<EditorInspectorColorField label={<div className="w-14">环境光</div>} object={props.material} property="ambientColor" />
				<EditorInspectorColorField label={<div className="w-14">自发光</div>} object={props.material} property="emissiveColor" />
			</EditorInspectorSectionField>

			<EditorInspectorSectionField title="高光属性">
				<EditorInspectorNumberField label="高光指数" object={props.material} property="specularPower" min={0} />
				<EditorInspectorNumberField label="Direct Intensity" object={props.material} property="directIntensity" min={0} />
				<EditorInspectorNumberField label="Environment Intensity" object={props.material} property="environmentIntensity" min={0} />
				<EditorInspectorNumberField label="Emissive Intensity" object={props.material} property="emissiveIntensity" min={0} />
				<EditorInspectorNumberField label="高光强度" object={props.material} property="specularIntensity" min={0} />
			</EditorInspectorSectionField>

			<EditorDetailMapInspector material={props.material} />

			<EditorInspectorSectionField title="杂项">
				<EditorInspectorSwitchField label="Disable Lighting" object={props.material} property="disableLighting" />
				<EditorInspectorSwitchField label="在 Alpha 上使用高光" object={props.material} property="useSpecularOverAlpha" />
				<EditorInspectorSwitchField label="独立剔除通道" object={props.material} property="separateCullingPass" />
				<EditorInspectorNumberField label="Z Offset" object={props.material} property="zOffset" />
				<EditorInspectorNumberField label="Z Offset Units" object={props.material} property="zOffsetUnits" />
				<EditorInspectorSwitchField label="Fog Enabled" object={props.material} property="fogEnabled" />
			</EditorInspectorSectionField>
		</>
	);
}
