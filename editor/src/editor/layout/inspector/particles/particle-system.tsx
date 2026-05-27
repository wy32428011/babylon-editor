import { Component, ReactNode } from "react";

import { IoPlay, IoStop, IoRefresh } from "react-icons/io5";

import {
	ParticleSystem,
	IParticleEmitterType,
	BoxParticleEmitter,
	ConeParticleEmitter,
	ConeDirectedParticleEmitter,
	CylinderParticleEmitter,
	CylinderDirectedParticleEmitter,
	SphereParticleEmitter,
	SphereDirectedParticleEmitter,
	PointParticleEmitter,
	HemisphericParticleEmitter,
	MeshParticleEmitter,
	Observer,
} from "babylonjs";

import { Button } from "../../../../ui/shadcn/ui/button";

import { registerUndoRedo } from "../../../../tools/undoredo";
import { isParticleSystem } from "../../../../tools/guards/particles";
import { onParticleSystemModifiedObservable } from "../../../../tools/observables";

import { EditorInspectorListField } from "../fields/list";
import { EditorInspectorColorField } from "../fields/color";
import { EditorInspectorBlockField } from "../fields/block";
import { EditorInspectorStringField } from "../fields/string";
import { EditorInspectorVectorField } from "../fields/vector";
import { EditorInspectorNumberField } from "../fields/number";
import { EditorInspectorSwitchField } from "../fields/switch";
import { EditorInspectorSectionField } from "../fields/section";
import { EditorInspectorTextureField } from "../fields/texture";

import { IEditorInspectorImplementationProps } from "../inspector";

import { ParticleSystemGradientInspector } from "./property-gradient";

export interface IEditorParticleSystemInspectorState {
	started: boolean;
}

export class EditorParticleSystemInspector extends Component<IEditorInspectorImplementationProps<ParticleSystem>, IEditorParticleSystemInspectorState> {
	/**
	 * Returns whether or not the given object is supported by this inspector.
	 * @param object defines the object to check.
	 * @returns true if the object is supported by this inspector.
	 */
	public static IsSupported(object: unknown): boolean {
		return isParticleSystem(object);
	}

	private _stoppedObserver: Observer<ParticleSystem> | null = null;

	public constructor(props: IEditorInspectorImplementationProps<ParticleSystem>) {
		super(props);

		this.state = {
			started: props.object.isAlive(),
		};
	}

	public componentDidMount(): void {
		this._stoppedObserver = this.props.object.onStoppedObservable.add(() => {
			this.setState({
				started: false,
			});
		});
	}

	public componentWillUnmount(): void {
		if (this._stoppedObserver) {
			this.props.object.onStoppedObservable.remove(this._stoppedObserver);
			this._stoppedObserver = null;
		}
	}

	public render(): ReactNode {
		return (
			<>
				<EditorInspectorSectionField title="通用">
					<div className="flex justify-between items-center px-2 py-2">
						<div className="w-1/2">类型</div>

						<div className="text-white/50">{this.props.object.getClassName()}</div>
					</div>

					<EditorInspectorStringField
						label="名称"
						object={this.props.object}
						property="name"
						onChange={() => onParticleSystemModifiedObservable.notifyObservers(this.props.object)}
					/>
					<EditorInspectorSwitchField object={this.props.object} property="preventAutoStart" label="阻止自动启动" />
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="操作">
					<div className="flex justify-center items-center gap-2">
						<Button
							onClick={() => this._handleStartOrStop()}
							className={`
                                w-10 h-10 bg-muted/50 !rounded-lg p-0.5
                                ${this.state.started ? "!bg-red-500/35" : "hover:!bg-green-500/35"}
                                transition-all duration-300 ease-in-out
                            `}
						>
							{this.state.started ? <IoStop className="w-6 h-6" strokeWidth={1} color="red" /> : <IoPlay className="w-6 h-6" strokeWidth={1} color="green" />}
						</Button>

						<Button onClick={() => this.props.object.reset()} className="w-10 h-10 bg-muted/50 !rounded-lg p-0.5">
							<IoRefresh className="w-6 h-6" strokeWidth={1} color="red" />
						</Button>
					</div>
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="变换">
					<EditorInspectorVectorField object={this.props.object} property="worldOffset" label="偏移 (m)" />
					<EditorInspectorVectorField object={this.props.object} property="gravity" label="重力 (m/s²)" />

					<EditorInspectorSwitchField object={this.props.object} property="isLocal" label="Is Local" onChange={() => this.forceUpdate()} />
					<EditorInspectorSwitchField object={this.props.object} property="isBillboardBased" label="Is Billboard Based" onChange={() => this.forceUpdate()} />

					{this.props.object.isBillboardBased && (
						<EditorInspectorListField
							object={this.props.object}
							property="billboardMode"
							label="Billboard Mode"
							items={[
								{ text: "全部", value: ParticleSystem.BILLBOARDMODE_ALL },
								{ text: "Y", value: ParticleSystem.BILLBOARDMODE_Y },
								{ text: "Stretched", value: ParticleSystem.BILLBOARDMODE_STRETCHED },
								{ text: "Stretched Local", value: ParticleSystem.BILLBOARDMODE_STRETCHED_LOCAL },
							]}
						/>
					)}
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="纹理">
					<EditorInspectorTextureField hideLevel hideSize object={this.props.object} property="particleTexture" title="基础纹理" />

					<EditorInspectorListField
						object={this.props.object}
						property="blendMode"
						label="混合模式"
						items={[
							{ text: "添加", value: ParticleSystem.BLENDMODE_ADD },
							{ text: "Multiply", value: ParticleSystem.BLENDMODE_MULTIPLY },
							{ text: "Multiply Add", value: ParticleSystem.BLENDMODE_MULTIPLYADD },
							{ text: "One-one", value: ParticleSystem.BLENDMODE_ONEONE },
							{ text: "标准", value: ParticleSystem.BLENDMODE_STANDARD },
						]}
					/>
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="发射">
					{this._getCapacityInspector()}

					<EditorInspectorNumberField object={this.props.object} property="emitRate" label="速率" />
					<EditorInspectorNumberField object={this.props.object} property="targetStopDuration" label="停止持续时间" min={0} step={0.01} />

					<EditorInspectorBlockField>
						<div className="px-2">Emit Power</div>
						<div className="flex items-center">
							<EditorInspectorNumberField grayLabel object={this.props.object} property="minEmitPower" label="最小值" min={0} />
							<EditorInspectorNumberField grayLabel object={this.props.object} property="maxEmitPower" label="最大值" min={0} />
						</div>
					</EditorInspectorBlockField>

					<EditorInspectorBlockField>
						<div className="px-2">Lifetime</div>
						<div className="flex items-center">
							<EditorInspectorNumberField grayLabel object={this.props.object} property="minLifeTime" label="最小值" min={0} />
							<EditorInspectorNumberField grayLabel object={this.props.object} property="maxLifeTime" label="最大值" min={0} />
						</div>
					</EditorInspectorBlockField>

					<ParticleSystemGradientInspector
						title="角速度"
						label="Use Angular Speed Gradients"
						particleSystem={this.props.object}
						getGradients={() => this.props.object.getAngularSpeedGradients()}
						createGradient={() => this.props.object.addAngularSpeedGradient(0, this.props.object.minAngularSpeed, this.props.object.maxAngularSpeed)}
						addGradient={(gradient, value1, value2) => this.props.object.addAngularSpeedGradient(gradient, value1, value2)}
						removeGradient={(gradient) => this.props.object.removeAngularSpeedGradient(gradient)}
						onUpdate={() => this.forceUpdate()}
					>
						<div className="flex items-center">
							<EditorInspectorNumberField grayLabel asDegrees object={this.props.object} property="minAngularSpeed" label="最小值" step={0.1} />
							<EditorInspectorNumberField grayLabel asDegrees object={this.props.object} property="maxAngularSpeed" label="最大值" step={0.1} />
						</div>
					</ParticleSystemGradientInspector>

					<ParticleSystemGradientInspector
						title="大小"
						label="Use Size Gradients"
						particleSystem={this.props.object}
						getGradients={() => this.props.object.getSizeGradients()}
						createGradient={() => this.props.object.addSizeGradient(0, this.props.object.minSize, this.props.object.maxSize)}
						addGradient={(gradient, value1, value2) => this.props.object.addSizeGradient(gradient, value1, value2)}
						removeGradient={(gradient) => this.props.object.removeSizeGradient(gradient)}
						onUpdate={() => this.forceUpdate()}
					>
						<div className="flex items-center">
							<EditorInspectorNumberField grayLabel object={this.props.object} property="minSize" label="最小值" min={0} />
							<EditorInspectorNumberField grayLabel object={this.props.object} property="maxSize" label="最大值" min={0} />
						</div>
					</ParticleSystemGradientInspector>
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="颜色">
					<ParticleSystemGradientInspector
						title=""
						label="Use Color Gradients"
						particleSystem={this.props.object}
						getGradients={() => this.props.object.getColorGradients()}
						createGradient={() => this.props.object.addColorGradient(0, this.props.object.color1.clone(), this.props.object.color2.clone())}
						addGradient={(gradient, value1, value2) => this.props.object.addColorGradient(gradient, value1, value2)}
						removeGradient={(gradient) => this.props.object.removeColorGradient(gradient)}
						onUpdate={() => this.forceUpdate()}
					>
						<EditorInspectorColorField object={this.props.object} property="color1" label="Color 1" />
						<EditorInspectorColorField object={this.props.object} property="color2" label="Color 2" />
						<EditorInspectorColorField object={this.props.object} property="colorDead" label="Dead" />
					</ParticleSystemGradientInspector>
				</EditorInspectorSectionField>

				{this._getEmitterTypeInspector()}

				<EditorInspectorSectionField title="动画序列帧">
					<EditorInspectorSwitchField object={this.props.object} property="isAnimationSheetEnabled" label="启用动画序列帧" onChange={() => this.forceUpdate()} />

					{this.props.object.isAnimationSheetEnabled && (
						<>
							<EditorInspectorNumberField object={this.props.object} property="startSpriteCellID" label="起始单元 ID" min={0} />
							<EditorInspectorNumberField object={this.props.object} property="endSpriteCellID" label="结束单元 ID" min={0} />
							<EditorInspectorNumberField object={this.props.object} property="spriteCellChangeSpeed" label="单元切换速度" min={0} />
							<EditorInspectorNumberField object={this.props.object} property="spriteCellWidth" label="单元宽度" min={0} />
							<EditorInspectorNumberField object={this.props.object} property="spriteCellHeight" label="单元高度" min={0} />
							<EditorInspectorSwitchField object={this.props.object} property="spriteRandomStartCell" label="随机起始单元" />
						</>
					)}
				</EditorInspectorSectionField>

				<EditorInspectorSectionField title="杂项">
					<EditorInspectorSwitchField object={this.props.object} property="useLogarithmicDepth" label="使用对数深度" />
				</EditorInspectorSectionField>
			</>
		);
	}

	private _handleStartOrStop(): void {
		if (this.state.started) {
			this.props.object.stop();
			this.setState({
				started: false,
			});
		} else {
			this.props.object.start();

			this.setState({
				started: true,
			});
		}
	}

	private _getCapacityInspector(): ReactNode {
		const o = {
			capacity: this.props.object.getCapacity(),
		};

		const onCapacityChanged = (value: number) => {
			this.props.object["_capacity"] = value >> 0;
			this.props.object.reset();
			this.props.object["_reset"]();
		};

		return (
			<EditorInspectorNumberField
				noUndoRedo
				object={o}
				property="capacity"
				label="容量"
				min={1}
				max={10_000}
				step={10}
				onFinishChange={(value) => {
					value = value >> 0;
					const oldValue = this.props.object.getCapacity();

					if (value === oldValue) {
						return;
					}

					registerUndoRedo({
						executeRedo: true,
						undo: () => onCapacityChanged(oldValue),
						redo: () => onCapacityChanged(value),
					});
				}}
			/>
		);
	}

	private _getEmitterTypeInspector(): ReactNode {
		const o = {
			particleEmitterType: this.props.object.particleEmitterType.getClassName(),
		};

		const emitter = this.props.object.particleEmitterType;

		return (
			<EditorInspectorSectionField title="发射器">
				<EditorInspectorListField
					noUndoRedo
					object={o}
					property="particleEmitterType"
					label="类型"
					items={[
						{ text: "盒体", value: "BoxParticleEmitter" },
						{ text: "Cone", value: "ConeParticleEmitter" },
						{ text: "Cone Directed", value: "ConeDirectedParticleEmitter" },
						{ text: "圆柱体", value: "CylinderParticleEmitter" },
						{ text: "Cylinder Directed", value: "CylinderDirectedParticleEmitter" },
						{ text: "球体", value: "SphereParticleEmitter" },
						{ text: "定向球体", value: "SphereDirectedParticleEmitter" },
						{ text: "Point", value: "PointParticleEmitter" },
						{ text: "Hemispheric", value: "HemisphericParticleEmitter" },
					]}
					onChange={(value) => {
						let emitterType: IParticleEmitterType | null = null;

						switch (value) {
							case "BoxParticleEmitter":
								emitterType = new BoxParticleEmitter();
								break;
							case "ConeParticleEmitter":
								emitterType = new ConeParticleEmitter();
								break;
							case "ConeDirectedParticleEmitter":
								emitterType = new ConeDirectedParticleEmitter();
								break;
							case "CylinderParticleEmitter":
								emitterType = new CylinderParticleEmitter();
								break;
							case "CylinderDirectedParticleEmitter":
								emitterType = new CylinderDirectedParticleEmitter();
								break;
							case "SphereParticleEmitter":
								emitterType = new SphereParticleEmitter();
								break;
							case "SphereDirectedParticleEmitter":
								emitterType = new SphereDirectedParticleEmitter();
								break;
							case "PointParticleEmitter":
								emitterType = new PointParticleEmitter();
								break;
							case "HemisphericParticleEmitter":
								emitterType = new HemisphericParticleEmitter();
								break;
							case "MeshParticleEmitter":
								emitterType = new MeshParticleEmitter();
								break;
						}

						if (emitterType) {
							const currentEmitter = this.props.object.particleEmitterType;
							registerUndoRedo({
								executeRedo: true,
								undo: () => (this.props.object.particleEmitterType = currentEmitter),
								redo: () => (this.props.object.particleEmitterType = emitterType),
							});

							this.forceUpdate();
						}
					}}
				/>

				{emitter.getClassName() === "BoxParticleEmitter" && (
					<>
						<EditorInspectorBlockField>
							<div className="px-2">Direction</div>
							<EditorInspectorVectorField grayLabel object={emitter} property="direction1" label="最小值" />
							<EditorInspectorVectorField grayLabel object={emitter} property="direction2" label="最大值" />
						</EditorInspectorBlockField>

						<EditorInspectorBlockField>
							<div className="px-2">Emit Box (m)</div>
							<EditorInspectorVectorField grayLabel object={emitter} property="minEmitBox" label="最小值" />
							<EditorInspectorVectorField grayLabel object={emitter} property="maxEmitBox" label="最大值" />
						</EditorInspectorBlockField>
					</>
				)}

				{(emitter.getClassName() === "ConeParticleEmitter" || emitter.getClassName() === "ConeDirectedParticleEmitter") && (
					<>
						<EditorInspectorNumberField object={emitter} property="radius" label="半径 (m)" />
						<EditorInspectorNumberField object={emitter} property="angle" label="角度" />

						<EditorInspectorNumberField object={emitter} property="radiusRange" label="半径范围 (m)" />
						<EditorInspectorNumberField object={emitter} property="heightRange" label="高度范围 (m)" />

						<EditorInspectorSwitchField object={emitter} property="emitFromSpawnPointOnly" label="仅从生成点发射" />

						{emitter.getClassName() === "ConeDirectedParticleEmitter" && (
							<>
								<EditorInspectorBlockField>
									<div className="px-2">Direction</div>
									<EditorInspectorVectorField grayLabel object={emitter} property="direction1" label="最小值" />
									<EditorInspectorVectorField grayLabel object={emitter} property="direction2" label="最大值" />
								</EditorInspectorBlockField>
							</>
						)}
					</>
				)}

				{(emitter.getClassName() === "CylinderParticleEmitter" || emitter.getClassName() === "CylinderDirectedParticleEmitter") && (
					<>
						<EditorInspectorNumberField object={emitter} property="radius" label="半径 (m)" />
						<EditorInspectorNumberField object={emitter} property="height" label="高度 (m)" />

						<EditorInspectorNumberField object={emitter} property="radiusRange" label="半径范围 (m)" />
						<EditorInspectorNumberField object={emitter} property="directionRandomizer" label="方向随机化" />

						{emitter.getClassName() === "CylinderDirectedParticleEmitter" && (
							<>
								<EditorInspectorBlockField>
									<div className="px-2">Direction</div>
									<EditorInspectorVectorField grayLabel object={emitter} property="direction1" label="最小值" />
									<EditorInspectorVectorField grayLabel object={emitter} property="direction2" label="最大值" />
								</EditorInspectorBlockField>
							</>
						)}
					</>
				)}

				{(emitter.getClassName() === "SphereParticleEmitter" || emitter.getClassName() === "SphereDirectedParticleEmitter") && (
					<>
						<EditorInspectorNumberField object={emitter} property="radius" label="半径 (m)" />
						<EditorInspectorNumberField object={emitter} property="radiusRange" label="半径范围 (m)" />
						<EditorInspectorNumberField object={emitter} property="directionRandomizer" label="方向随机化" />

						{emitter.getClassName() === "SphereDirectedParticleEmitter" && (
							<>
								<EditorInspectorBlockField>
									<div className="px-2">Direction</div>
									<EditorInspectorVectorField grayLabel object={emitter} property="direction1" label="最小值" />
									<EditorInspectorVectorField grayLabel object={emitter} property="direction2" label="最大值" />
								</EditorInspectorBlockField>
							</>
						)}
					</>
				)}

				{emitter.getClassName() === "PointParticleEmitter" && (
					<>
						<EditorInspectorBlockField>
							<div className="px-2">Direction</div>
							<EditorInspectorVectorField grayLabel object={emitter} property="direction1" label="最小值" />
							<EditorInspectorVectorField grayLabel object={emitter} property="direction2" label="最大值" />
						</EditorInspectorBlockField>
					</>
				)}

				{emitter.getClassName() === "HemisphericParticleEmitter" && (
					<>
						<EditorInspectorNumberField object={emitter} property="radius" label="半径 (m)" />
						<EditorInspectorNumberField object={emitter} property="radiusRange" label="半径范围 (m)" />
						<EditorInspectorNumberField object={emitter} property="directionRandomizer" label="方向随机化" />
					</>
				)}
			</EditorInspectorSectionField>
		);
	}
}
