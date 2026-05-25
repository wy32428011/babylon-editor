import { Editor } from "../../main";

import { ICommandPaletteType } from "./command-palette";

export function getParticleSystemsCommands(editor: Editor): ICommandPaletteType[] {
	return [
		{
			text: "Reset all Particle Systems",
			key: "reset-all-particle-systems",
			label: "Reset all particle systems in the scene",
			action: () => editor.layout.preview.scene.particleSystems.forEach((ps) => ps.reset()),
		},
		{
			text: "停止所有粒子系统",
			key: "stop-all-particle-systems",
			label: "停止场景中的所有粒子系统",
			action: () => editor.layout.preview.scene.particleSystems.forEach((ps) => ps.stop()),
		},
		{
			text: "启动所有粒子系统",
			key: "start-all-particle-systems",
			label: "启动场景中的所有粒子系统",
			action: () => editor.layout.preview.scene.particleSystems.forEach((ps) => ps.start()),
		},
	];
}
