import { Editor } from "../../main";

import {
	addPBRMaterial,
	addStandardMaterial,
	addNodeMaterial,
	addSkyMaterial,
	addGridMaterial,
	addNormalMaterial,
	addWaterMaterial,
	addLavaMaterial,
	addTriPlanarMaterial,
	addCellMaterial,
	addFireMaterial,
	addGradientMaterial,
} from "../../../project/add/material";

import { ICommandPaletteType } from "./command-palette";

export function getMaterialCommands(editor?: Editor): ICommandPaletteType[] {
	return [
		{
			text: "PBR 材质",
			label: "向场景添加新的 PBR 材质",
			key: "add-pbr-material",
			action: () => editor && addPBRMaterial(editor.layout.preview.scene),
		},
		{
			text: "标准材质",
			label: "向场景添加新的标准材质",
			key: "add-standard-material",
			action: () => editor && addStandardMaterial(editor.layout.preview.scene),
		},
		{
			text: "节点材质",
			label: "向场景添加新的节点材质",
			key: "add-node-material",
			action: () => editor && addNodeMaterial(editor.layout.preview.scene),
		},
	];
}

export function getMaterialsLibraryCommands(editor?: Editor): ICommandPaletteType[] {
	return [
		{
			text: "天空材质",
			label: "向场景添加新的天空材质",
			key: "add-sky-material",
			action: () => editor && addSkyMaterial(editor.layout.preview.scene),
		},
		{
			text: "网格材质",
			label: "向场景添加新的网格材质",
			key: "add-grid-material",
			action: () => editor && addGridMaterial(editor.layout.preview.scene),
		},
		{
			text: "法线材质",
			label: "向场景添加新的法线材质",
			key: "add-normal-material",
			action: () => editor && addNormalMaterial(editor.layout.preview.scene),
		},
		{
			text: "水材质",
			label: "向场景添加新的水材质",
			key: "add-water-material",
			action: () => editor && addWaterMaterial(editor.layout.preview.scene),
		},
		{
			text: "熔岩材质",
			label: "向场景添加新的熔岩材质",
			key: "add-lava-material",
			action: () => editor && addLavaMaterial(editor.layout.preview.scene),
		},
		{
			text: "三平面材质",
			label: "向场景添加新的三平面材质",
			key: "add-tri-planar-material",
			action: () => editor && addTriPlanarMaterial(editor.layout.preview.scene),
		},
		{
			text: "卡通材质",
			label: "向场景添加新的卡通材质",
			key: "add-cell-material",
			action: () => editor && addCellMaterial(editor.layout.preview.scene),
		},
		{
			text: "火焰材质",
			label: "向场景添加新的火焰材质",
			key: "add-fire-material",
			action: () => editor && addFireMaterial(editor.layout.preview.scene),
		},
		{
			text: "渐变材质",
			label: "向场景添加新的渐变材质",
			key: "add-gradient-material",
			action: () => editor && addGradientMaterial(editor.layout.preview.scene),
		},
	];
}
