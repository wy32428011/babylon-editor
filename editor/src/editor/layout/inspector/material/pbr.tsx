import { Component, ReactNode } from "react";

import { PBRMaterial, AbstractMesh } from "babylonjs";

import { registerSimpleUndoRedo } from "../../../../tools/undoredo";

import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorBlockField } from "../fields/block";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorTextureField } from "../fields/texture";
import { EditorInspectorSectionField } from "../fields/section";

import { EditorAlphaModeField } from "./components/alpha";
import { EditorDetailMapInspector } from "./components/detail";
import { EditorTransparencyModeField } from "./components/transparency";
import { EditorMaterialInspectorUtilsComponent } from "./components/utils";

export interface IEditorPBRMaterialInspectorProps {
	mesh?: AbstractMesh;
	material: PBRMaterial;
}

export interface IEditorPBRMaterialInspectorState {
	subSurfaceEnabled: boolean;
}

export class EditorPBRMaterialInspector extends Component<IEditorPBRMaterialInspectorProps, IEditorPBRMaterialInspectorState> {
	public constructor(props: IEditorPBRMaterialInspectorProps) {
		super(props);

		this.state = {
			subSurfaceEnabled: this.props.material.subSurface.isRefractionEnabled || this.props.material.subSurface.isTranslucencyEnabled,
		};
	}

	public render(): ReactNode {
		const scene = this.props.material.getScene();

		return (
			<>
				<EditorInspectorSectionField title="材质" label={this.props.material.getClassName()}>
					<EditorInspectorStringField label="名称" object={this.props.material} property="name" />
					<EditorInspectorSwitchField label="背面剔除" object={this.props.material} property="backFaceCulling" />

					<EditorInspectorNumberField label="透明度" object={this.props.material} property="alpha" min={0} max={1} />
					<EditorAlphaModeField object={this.props.material} />
					<EditorTransparencyModeField object={this.props.material} />

					<EditorMaterialInspectorUtilsComponent mesh={this.props.mesh} material={this.props.material} />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Material Textures">
					<EditorInspectorTextureField object={this.props.material} title="反照率纹理" property="albedoTexture" onChange={() => this.forceUpdate()}>
						{this.props.material.albedoTexture && (
							<>
								<EditorInspectorSwitchField label="使用 Alpha" object={this.props.material} property="useAlphaFromDiffuseTexture" />
								<EditorInspectorNumberField label="Alpha 截断" object={this.props.material} property="alphaCutOff" min={0} max={1} />
							</>
						)}
					</EditorInspectorTextureField>

					<EditorInspectorTextureField object={this.props.material} title="凹凸纹理" property="bumpTexture" onChange={() => this.forceUpdate()}>
						{this.props.material.bumpTexture && (
							<>
								<EditorInspectorSwitchField label="Inverse X" object={this.props.material} property="invertNormalMapX" />
								<EditorInspectorSwitchField label="Inverse Y" object={this.props.material} property="invertNormalMapY" />
								<EditorInspectorSwitchField label="使用对象空间法线贴图" object={this.props.material} property="useObjectSpaceNormalMap" />
								<EditorInspectorSwitchField label="使用视差" object={this.props.material} property="useParallax" onChange={() => this.forceUpdate()} />

								{this.props.material.useParallax && (
									<>
										<EditorInspectorSwitchField label="使用视差遮蔽" object={this.props.material} property="useParallaxOcclusion" />
										<EditorInspectorNumberField label="Parallax Scale Bias" object={this.props.material} property="parallaxScaleBias" />
									</>
								)}
								<EditorInspectorSwitchField label="Disable Bump Map" object={this.props.material} property="disableBumpMap" onChange={() => this.forceUpdate()} />
							</>
						)}
					</EditorInspectorTextureField>

					{!this.props.material.metallicTexture && (
						<>
							<EditorInspectorTextureField
								object={this.props.material}
								title="Reflectivity Texture"
								property="reflectivityTexture"
								onChange={() => this.forceUpdate()}
							/>
							<EditorInspectorTextureField
								object={this.props.material}
								title="Micro Surface Texture"
								property="microSurfaceTexture"
								onChange={() => this.forceUpdate()}
							/>
						</>
					)}

					<EditorInspectorTextureField object={this.props.material} title="环境纹理" property="ambientTexture" onChange={() => this.forceUpdate()}>
						{this.props.material.ambientTexture && (
							<>
								<EditorInspectorSwitchField label="使用灰度" object={this.props.material} property="useAmbientInGrayScale" />
								<EditorInspectorNumberField label="强度" object={this.props.material} property="ambientTextureStrength" min={0} />
								<EditorInspectorNumberField
									label="Impact On Analytical Lights"
									object={this.props.material}
									property="ambientTextureImpactOnAnalyticalLights"
									min={0}
									max={1}
								/>
							</>
						)}
					</EditorInspectorTextureField>

					<EditorInspectorTextureField object={this.props.material} title="Opacity Texture" property="opacityTexture" />
					<EditorInspectorTextureField
						object={this.props.material}
						title="反射纹理"
						property="reflectionTexture"
						acceptCubeTexture
						onChange={() => this.forceUpdate()}
					/>

					<EditorInspectorTextureField object={this.props.material} title="金属度纹理" property="metallicTexture" onChange={() => this.forceUpdate()}>
						{this.props.material.metallicTexture && (
							<>
								<EditorInspectorSwitchField label="从 Alpha 使用粗糙度" object={this.props.material} property="useRoughnessFromMetallicTextureAlpha" />
								<EditorInspectorSwitchField label="从绿色通道使用粗糙度" object={this.props.material} property="useRoughnessFromMetallicTextureGreen" />
								<EditorInspectorSwitchField label="从蓝色通道使用金属度" object={this.props.material} property="useMetallnessFromMetallicTextureBlue" />
								<EditorInspectorSwitchField
									label="从红色通道使用环境光"
									object={this.props.material}
									property="useAmbientOcclusionFromMetallicTextureRed"
									onChange={() => this.forceUpdate()}
								/>

								{this.props.material.useAmbientOcclusionFromMetallicTextureRed && (
									<EditorInspectorNumberField label="环境强度" object={this.props.material} property="ambientTextureStrength" min={0} />
								)}
							</>
						)}
					</EditorInspectorTextureField>

					<EditorInspectorTextureField
						object={this.props.material}
						title="Metallic Reflectance Texture"
						property="metallicReflectanceTexture"
						onChange={() => this.forceUpdate()}
					>
						{this.props.material.metallicReflectanceTexture && (
							<>
								<EditorInspectorSwitchField
									label="仅从金属反射纹理使用金属度"
									object={this.props.material}
									property="useOnlyMetallicFromMetallicReflectanceTexture"
									onChange={() => this.forceUpdate()}
								/>
							</>
						)}
					</EditorInspectorTextureField>

					<EditorInspectorTextureField object={this.props.material} title="自发光纹理" property="emissiveTexture" />
					<EditorInspectorTextureField object={this.props.material} title="Lightmap Texture" property="lightmapTexture">
						{this.props.material.lightmapTexture && (
							<>
								<EditorInspectorSwitchField label="将光照贴图用作阴影贴图" object={this.props.material} property="useLightmapAsShadowmap" />
							</>
						)}
					</EditorInspectorTextureField>
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Material Colors">
					<EditorInspectorColorField label={<div className="w-14">反照率</div>} object={this.props.material} property="albedoColor" />
					<EditorInspectorColorField label={<div className="w-14">反射率</div>} object={this.props.material} property="reflectivityColor" />
					<EditorInspectorColorField label={<div className="w-14">反射</div>} object={this.props.material} property="reflectionColor" />
					<EditorInspectorColorField label={<div className="w-14">环境光</div>} object={this.props.material} property="ambientColor" />
					<EditorInspectorColorField label={<div className="w-14">自发光</div>} object={this.props.material} property="emissiveColor" />
					{this.props.material.metallic !== null && (
						<EditorInspectorColorField label={<div className="w-14">Metallic Reflectance</div>} object={this.props.material} property="metallicReflectanceColor" />
					)}
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Metallic / Roughness">
					<EditorInspectorNumberField label="Metallic F0 Factor" object={this.props.material} property="metallicF0Factor" />
					<EditorInspectorNumberField label="基础权重" object={this.props.material} property="baseWeight" min={0} max={1} />

					<EditorInspectorSwitchField
						label="金属度"
						object={{ checked: this.props.material.metallic !== null }}
						property="checked"
						noUndoRedo
						onChange={(v) => {
							registerSimpleUndoRedo({
								object: this.props.material,
								property: "metallic",
								oldValue: this.props.material.metallic,
								newValue: v ? 1 : null,
								executeRedo: true,
							});

							this.forceUpdate();
						}}
					/>

					{this.props.material.metallic !== null && <EditorInspectorNumberField label=" " object={this.props.material} property="metallic" min={0} max={1} />}

					<EditorInspectorSwitchField
						label="粗糙度"
						object={{ checked: this.props.material.roughness !== null }}
						property="checked"
						noUndoRedo
						onChange={(v) => {
							registerSimpleUndoRedo({
								object: this.props.material,
								property: "roughness",
								oldValue: this.props.material.roughness,
								newValue: v ? 1 : null,
								executeRedo: true,
							});

							this.forceUpdate();
						}}
					/>

					{this.props.material.roughness !== null && <EditorInspectorNumberField label=" " object={this.props.material} property="roughness" min={0} max={1} />}
				</EditorInspectorSectionField>

				{this.props.material.metallic === null && this.props.material.roughness === null && (
					<EditorInspectorSectionField title="Micro Surface">
						<EditorInspectorNumberField label="Microsurface" object={this.props.material} property="microSurface" min={0} max={1} />
						{this.props.material.reflectivityTexture && (
							<>
								<EditorInspectorSwitchField
									label="从反射率贴图自动使用微表面"
									object={this.props.material}
									property="useAutoMicroSurfaceFromReflectivityMap"
								/>
								<EditorInspectorSwitchField
									label="从反射率贴图 Alpha 使用微表面"
									object={this.props.material}
									property="useMicroSurfaceFromReflectivityMapAlpha"
								/>
							</>
						)}
					</EditorInspectorSectionField>
				)}

				<EditorDetailMapInspector material={this.props.material} />

				<EditorInspectorSectionField title="次表面">
					<EditorInspectorSwitchField
						noUndoRedo
						object={this.state}
						property="subSurfaceEnabled"
						label="启用"
						onChange={(v) => this._handleSubSurfaceEnabledChange(v)}
					/>

					{this.state.subSurfaceEnabled && (
						<>
							<EditorInspectorColorField label={<div className="w-14">染色</div>} object={this.props.material.subSurface} property="tintColor" />

							<EditorInspectorTextureField scene={scene} object={this.props.material.subSurface} property="thicknessTexture" title="厚度纹理">
								<EditorInspectorSwitchField
									label="从厚度纹理使用遮罩"
									object={this.props.material.subSurface}
									property="useMaskFromThicknessTexture"
								/>
								<EditorInspectorNumberField label="Minimum Thickness" object={this.props.material.subSurface} property="minimumThickness" min={0} />
								<EditorInspectorNumberField label="Maximum Thickness" object={this.props.material.subSurface} property="maximumThickness" min={0} />
							</EditorInspectorTextureField>

							<EditorInspectorBlockField>
								<div className="font-semibold text-base text-center">折射</div>
								<EditorInspectorSwitchField
									label="启用"
									object={this.props.material.subSurface}
									property="isRefractionEnabled"
									onChange={() => this.forceUpdate()}
								/>

								{this.props.material.subSurface.isRefractionEnabled && (
									<>
										<EditorInspectorNumberField label="强度" object={this.props.material.subSurface} property="refractionIntensity" min={0} />
										<EditorInspectorNumberField label="Index of Refraction" object={this.props.material.subSurface} property="indexOfRefraction" min={0} />
									</>
								)}
							</EditorInspectorBlockField>

							<EditorInspectorBlockField>
								<div className="font-semibold text-base text-center">半透明</div>
								<EditorInspectorSwitchField
									label="启用"
									object={this.props.material.subSurface}
									property="isTranslucencyEnabled"
									onChange={() => this.forceUpdate()}
								/>

								{this.props.material.subSurface.isTranslucencyEnabled && (
									<>
										<EditorInspectorNumberField label="强度" object={this.props.material.subSurface} property="translucencyIntensity" min={0} />
									</>
								)}
							</EditorInspectorBlockField>
						</>
					)}
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="虹彩">
					<EditorInspectorSwitchField label="启用" object={this.props.material.iridescence} property="isEnabled" onChange={() => this.forceUpdate()} />

					{this.props.material.iridescence.isEnabled && (
						<>
							<EditorInspectorNumberField label="强度" object={this.props.material.iridescence} property="intensity" min={0} />
							<EditorInspectorNumberField label="Index of Refraction" object={this.props.material.iridescence} property="indexOfRefraction" min={0} />
							<EditorInspectorNumberField label="Minimum Thickness" object={this.props.material.iridescence} property="minimumThickness" min={0} />
							<EditorInspectorNumberField label="Maximum Thickness" object={this.props.material.iridescence} property="maximumThickness" min={0} />

							<EditorInspectorTextureField scene={scene} object={this.props.material.iridescence} property="texture" title="Intensity Texture" />
							<EditorInspectorTextureField scene={scene} object={this.props.material.iridescence} property="thicknessTexture" title="厚度纹理" />
						</>
					)}
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="光泽">
					<EditorInspectorSwitchField label="启用" object={this.props.material.sheen} property="isEnabled" onChange={() => this.forceUpdate()} />

					{this.props.material.sheen.isEnabled && (
						<>
							<EditorInspectorNumberField label="强度" object={this.props.material.sheen} property="intensity" min={0} />
							<EditorInspectorColorField label={<div className="w-14">颜色</div>} object={this.props.material.sheen} property="color" />

							<EditorInspectorTextureField scene={scene} object={this.props.material.sheen} property="texture" title="染色纹理">
								<EditorInspectorSwitchField
									label="从主纹理使用粗糙度"
									object={this.props.material.sheen}
									property="useRoughnessFromMainTexture"
									onChange={() => this.forceUpdate()}
								/>
							</EditorInspectorTextureField>

							{!this.props.material.sheen.useRoughnessFromMainTexture && (
								<EditorInspectorTextureField scene={scene} object={this.props.material.sheen} property="textureRoughness" title="Roughness Texture" />
							)}
						</>
					)}
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="Intensity Properties">
					<EditorInspectorNumberField label="Direct Intensity" object={this.props.material} property="directIntensity" min={0} />
					<EditorInspectorNumberField label="Environment Intensity" object={this.props.material} property="environmentIntensity" min={0} />
					<EditorInspectorNumberField label="Emissive Intensity" object={this.props.material} property="emissiveIntensity" min={0} />
					<EditorInspectorNumberField label="高光强度" object={this.props.material} property="specularIntensity" min={0} />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="杂项">
					<EditorInspectorSwitchField label="无光照" object={this.props.material} property="unlit" />
					<EditorInspectorSwitchField label="Disable Lighting" object={this.props.material} property="disableLighting" />
					<EditorInspectorSwitchField label="Enable Specular Anti Aliasing" object={this.props.material} property="enableSpecularAntiAliasing" />
					<EditorInspectorSwitchField label="Force Irradiance In Fragment" object={this.props.material} property="forceIrradianceInFragment" />
					<EditorInspectorSwitchField label="使用辐射遮蔽" object={this.props.material} property="useRadianceOcclusion" />
					<EditorInspectorSwitchField label="使用地平线遮蔽" object={this.props.material} property="useHorizonOcclusion" />
					<EditorInspectorSwitchField label="使用物理光衰减" object={this.props.material} property="usePhysicalLightFalloff" />
					<EditorInspectorSwitchField label="使用球谐" object={this.props.material.brdf} property="useSphericalHarmonics" />
					<EditorInspectorSwitchField label="在 Alpha 上使用辐射" object={this.props.material} property="useRadianceOverAlpha" />
					<EditorInspectorSwitchField label="在 Alpha 上使用高光" object={this.props.material} property="useSpecularOverAlpha" />
					<EditorInspectorSwitchField label="独立剔除通道" object={this.props.material} property="separateCullingPass" />
					<EditorInspectorSwitchField label="Force Alpha Test" object={this.props.material} property="forceAlphaTest" />
					<EditorInspectorNumberField label="Z Offset" object={this.props.material} property="zOffset" />
					<EditorInspectorNumberField label="Z Offset Units" object={this.props.material} property="zOffsetUnits" />
					<EditorInspectorSwitchField label="Fog Enabled" object={this.props.material} property="fogEnabled" />
					<EditorInspectorSwitchField label="使用对数深度" object={this.props.material} property="useLogarithmicDepth" />
				</EditorInspectorSectionField>
			</>
		);
	}

	private _handleSubSurfaceEnabledChange(v: boolean): void {
		if (!v) {
			this.props.material.subSurface.isRefractionEnabled = false;
			this.props.material.subSurface.isTranslucencyEnabled = false;
		}

		this.setState({
			subSurfaceEnabled: v,
		});
	}
}
