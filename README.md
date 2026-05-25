# Babylon.js Editor 5

**少写代码，专注创作。**

## 简介

Babylon.js Editor 是一款桌面应用，用于基于 Babylon.js 框架创建和编辑 3D 场景。编辑器支持 Windows 和 macOS。

项目内置多个模板，包括 Next.js 模板，可以跳过繁琐的初始化流程，直接开始构建项目。

网站地址：https://editor.babylonjs.com

文档地址：https://editor.babylonjs.com/documentation

## 中文化说明

当前仓库按中文界面维护桌面编辑器体验，范围包括：

- `editor/src` 内的桌面编辑器菜单、Dashboard、创建项目、偏好设置、命令面板、资产浏览器、Inspector、弹窗、toast 和文件选择器文案。
- 内嵌的 Babylon Node Material Editor、GUI Editor、Node Particle Editor。
- 保留 Babylon.js、API 名、环境变量、文件扩展名、快捷键、协议名、包名、命令参数和内部序列化字段。
- 当前中文化范围不包含 `website`、`templates`、`cli`、`tools`，这些目录继续保持原有面向开发者或模板消费方的输出。

第三方内嵌编辑器位于 `node_modules`，依赖重装后会被覆盖。仓库通过 `scripts/localize-babylon-editors.mjs` 做可重复执行的字符串补丁，并已在根 `postinstall.mjs` 末尾自动调用。脚本只负责读取参数和执行替换，包名、bundle 文件和翻译映射维护在 `scripts/localize-babylon-editors.config.json`，避免把中文化参数写死在执行代码里。参数文件使用 `{ "source": "...", "target": "..." }` 数组格式，便于保留替换顺序并检测重复文案。

需要单独重新应用时，运行：

```bash
node ./scripts/localize-babylon-editors.mjs
```

需要使用其他参数文件或只预览替换数量时，可运行：

```bash
node ./scripts/localize-babylon-editors.mjs --config ./scripts/localize-babylon-editors.config.json --dry-run
```

## 模型外挂脚本

编辑器支持模型同目录外挂参数脚本和动画驱动脚本。模型拖入场景画布后，会按固定命名规则自动识别同目录脚本，并绑定到本次导入模型的根节点上。

命名规则如下：

- 参数脚本：`模型名.params.ts` 或 `模型名.params.tsx`
- 动画驱动脚本：`模型名.anim.动画名.ts` 或 `模型名.anim.动画名.tsx`
- 当同一脚本同时存在 `.ts` 和 `.tsx` 时，优先使用 `.ts`

示例目录：

```text
assets/car/
  car.glb
  car.params.ts
  car.anim.open.ts
  car.anim.close.ts
```

可以从资产浏览器把项目内模型拖入画布，也可以从系统文件管理器拖入外部模型。外部模型会把模型所在文件夹复制到项目 `assets/模型名/` 下，确保 `.gltf/.obj` 的贴图、`.bin/.mtl` 和外挂脚本保持在同一模型包内。

导入后，右侧属性面板会出现“模型外挂脚本”区域：

- 参数脚本复用现有脚本装饰器，例如 `@visibleAsNumber`、`@visibleAsString`，字段会显示在属性面板中。
- 如果存在多个动画驱动脚本，可在属性面板中选择当前启用的动画脚本。
- 选择结果会保存到模型根节点的 `metadata.modelSidecar.selectedAnimationKey`，并同步 `metadata.scripts` 中动画脚本的启用状态。

动画驱动脚本通过 `onMqttValue` 接收外部实时值。当前版本只提供驱动入口，不内置 MQTT 连接、订阅和 broker 配置。后续接入 MQTT 客户端时，收到消息后调用 `dispatchMqttValueToObject` 即可把值分发给当前选中的动画驱动脚本。

```ts
import { IMqttDriverContext } from "babylonjs-editor-tools";

export default class DoorDriver {
	/**
	 * 创建门模型动画驱动脚本实例。
	 * @param node 定义当前脚本绑定的模型根节点。
	 */
	public constructor(public node: any) {}

	/**
	 * 接收 MQTT 或外部实时值，并驱动模型动画。
	 * @param value 定义外部传入的驱动值。
	 * @param context 定义当前驱动调用的上下文信息。
	 */
	public onMqttValue(value: unknown, context: IMqttDriverContext): void {
		const openRatio = Number(value);
		if (!Number.isFinite(openRatio)) {
			return;
		}

		this.node.rotation.y = openRatio;
	}
}
```

## 下载

**v5.4.0**

- Windows x64: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor%20Setup%205.4.0.exe
- macOS Apple Chip: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor-5.4.0-arm64.dmg
- macOS Intel Chip: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/x64/BabylonJS%20Editor-5.4.0.dmg
- Linux x64: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor-5.4.0.AppImage
- Linux arm64: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor-5.4.0-arm64.AppImage

## 环境要求

### Windows

Windows 需要 Python 和 C++ 编译工具。旧版环境可用管理员 PowerShell 运行：

```bash
# 更多信息见 https://github.com/felixrieseberg/windows-build-tools
npm install --global --production windows-build-tools
```

较新的 Windows 环境建议安装 Python 3 和 Visual Studio Build Tools 2022，并勾选 C++ build tools 工作负载。安装 Python 后重新打开终端，确认 `python --version` 能解析到真实解释器。如果仍解析到 WindowsApps 占位程序，可执行：

```bash
yarn config set python "C:\Path\To\python.exe"
```

还需要安装：

- [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-10-sdk)：只需安装 "Desktop C++ Apps" 相关组件。
- Spectre-mitigated libraries：如遇到 `MSB8040: Spectre-mitigated libraries are required for this project`，打开 Visual Studio Installer，点击 Modify，在 "Individual components" 中搜索 "Spectre"，安装类似 "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)" 的组件。具体名称取决于 Visual Studio 版本和系统架构。

### macOS

macOS 需要安装 Xcode，用于编译编辑器依赖的原生模块。可从 [App Store](https://apps.apple.com/fr/app/xcode/id497799835?mt=12) 安装。

### Linux (apt)

```bash
sudo apt install -y make python build-essential
```

## 安装与构建

先安装依赖。本仓库使用 Yarn Classic。

```bash
yarn install
```

### 依赖解析说明

`electron-builder` 会通过 `app-builder-lib` 间接拉取 `@electron/rebuild`。根 `resolutions` 将 `@electron/node-gyp` 固定到 npm 发布的 `10.2.0-electron.1`，避免使用 `@electron/rebuild@3.7.x` 声明的 GitHub URL。

保留该 resolution 可以规避部分 Windows 环境拉取 Git 依赖时的 SSL/TLS 失败，同时不改变 `electron-builder` 期望的 `@electron/rebuild` 版本。

如果 `yarn start` 报 `Electron failed to install correctly`，说明 Electron npm 包已安装，但二进制缺失。可在仓库根目录运行：

```bash
node node_modules\electron\install.js
```

也可以只删除 `node_modules\electron` 后重新运行 `yarn install`。

构建编辑器和相关工具：

```bash
yarn build
```

## 运行

在仓库根目录运行：

```bash
yarn build
yarn start
```

开发者工具会自动打开。

## 开发

监听 Editor 和依赖：

```bash
yarn watch-editor-all
```

使用 Visual Studio Code 时，也可以通过 `Ctrl+Shift+B`（macOS 为 `Cmd+Shift+B`）选择 `watch-all-editor` 任务。

提交前请确保格式和代码规范通过检查：

```bash
yarn lint
```

自动修复可修复问题：

```bash
yarn lint-fix
```

## 打包

由于存在原生依赖，macOS 构建必须在 macOS 上执行，Windows 构建必须在安装完整要求的 Windows 上执行。

打包当前平台：

```bash
# 当前平台和架构
yarn package --noSign

# 指定目标架构
yarn package --noSign --x64

# 同时构建两个架构
yarn package --noSign --arm64 --x64
```

该命令会重新安装依赖，构建 Editor 和相关工具，最后为目标平台打包 Electron 应用。

如需在 macOS 签名应用，需要在仓库根目录创建 `.env` 并设置：

```env
APPLE_ID=
APPLE_APP_SPECIFIC_PASSWORD=
APPLE_TEAM_ID=
```

然后运行不带 `--noSign` 的打包命令：

```bash
# 当前平台和架构
yarn package

# 指定目标架构
yarn package --x64

# 同时构建两个架构
yarn package --arm64 --x64
```
