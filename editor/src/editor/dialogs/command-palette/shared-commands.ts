import { ICommandPaletteType } from "./command-palette";

export type CommandItem = Omit<ICommandPaletteType, "action">;

export const cameraCommandItems = {
	freeCamera: {
		text: "自由相机",
		label: "向场景添加新的自由相机",
		key: "add-free-camera",
		ipcRendererChannelKey: "free-camera",
	} as CommandItem,
	arcRotateCamera: {
		text: "弧形旋转相机",
		label: "向场景添加新的弧形旋转相机",
		key: "add-arc-rotate-camera",
		ipcRendererChannelKey: "arc-rotate-camera",
	} as CommandItem,
};

export const lightCommandItems = {
	pointLight: {
		text: "点光源",
		label: "向场景添加新的点光源",
		key: "add-point-light",
		ipcRendererChannelKey: "point-light",
	} as CommandItem,
	directionalLight: {
		text: "方向光",
		label: "向场景添加新的方向光",
		key: "add-directional-light",
		ipcRendererChannelKey: "directional-light",
	} as CommandItem,
	spotLight: {
		text: "聚光灯",
		label: "向场景添加新的聚光灯",
		key: "add-spot-light",
		ipcRendererChannelKey: "spot-light",
	} as CommandItem,
	hemisphericLight: {
		text: "半球光",
		label: "向场景添加新的半球光",
		key: "add-hemispheric-light",
		ipcRendererChannelKey: "hemispheric-light",
	} as CommandItem,
};

export const nodeCommandItems = {
	transformNode: {
		text: "变换节点",
		label: "向场景添加新的变换节点",
		key: "add-transform-node",
		ipcRendererChannelKey: "transform-node",
	} as CommandItem,
};

export const meshCommandItems = {
	box: {
		text: "盒体网格",
		label: "向场景添加新的盒体网格",
		key: "add-box-mesh",
		ipcRendererChannelKey: "box-mesh",
	} as CommandItem,
	plane: {
		text: "平面网格",
		label: "向场景添加新的平面网格",
		key: "add-plane-mesh",
		ipcRendererChannelKey: "plane-mesh",
	} as CommandItem,
	ground: {
		text: "地面网格",
		label: "向场景添加新的地面网格",
		key: "add-ground-mesh",
		ipcRendererChannelKey: "ground-mesh",
	} as CommandItem,
	sphere: {
		text: "球体网格",
		label: "向场景添加新的球体网格",
		key: "add-sphere-mesh",
		ipcRendererChannelKey: "sphere-mesh",
	} as CommandItem,
	capsule: {
		text: "胶囊体网格",
		label: "向场景添加新的胶囊体网格",
		key: "add-capsule-mesh",
		ipcRendererChannelKey: "capsule-mesh",
	} as CommandItem,
	cylinder: {
		text: "圆柱体网格",
		label: "向场景添加新的圆柱体网格",
		key: "add-cylinder-mesh",
		ipcRendererChannelKey: "cylinder-mesh",
	} as CommandItem,
	torus: {
		text: "圆环网格",
		label: "向场景添加新的圆环网格",
		key: "add-torus-mesh",
		ipcRendererChannelKey: "torus-mesh",
	} as CommandItem,
	torusKnot: {
		text: "环面结网格",
		label: "向场景添加新的环面结网格",
		key: "add-torus-knot-mesh",
		ipcRendererChannelKey: "torus-knot-mesh",
	} as CommandItem,
	skybox: {
		text: "天空盒网格",
		label: "向场景添加新的天空盒网格",
		key: "add-skybox-mesh",
		ipcRendererChannelKey: "skybox-mesh",
	} as CommandItem,
	emptyMesh: {
		text: "Empty Mesh",
		label: "向场景添加新的空网格",
		key: "add-empty-mesh",
		ipcRendererChannelKey: "empty-mesh",
	} as CommandItem,
};

export const spriteCommandItems = {
	spriteManager: {
		text: "精灵管理器",
		label: "向场景添加新的精灵管理器",
		key: "add-sprite-manager",
		ipcRendererChannelKey: "sprite-manager",
	} as CommandItem,
	spriteMap: {
		text: "精灵贴图节点",
		label: "向场景添加新的精灵贴图节点",
		key: "add-sprite-map-node",
		ipcRendererChannelKey: "sprite-map-node",
	} as CommandItem,
};
