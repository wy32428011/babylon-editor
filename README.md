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

## 空间单位约定

编辑器统一约定 `1 Babylon 世界单位 = 1 m`。位置、几何尺寸、相机距离、灯光范围、物理重力和粒子空间偏移都按米制理解；缩放 `scaling` 仍然是无量纲倍率，`1` 表示原始尺寸，`2` 表示放大 2 倍，`0.5` 表示缩小到一半。

新建项目会在 `project.bjseditor` 的 `space` 字段和场景 `config.json` 的 `metadata.space` 中写入 `{ "worldUnit": "m", "metersPerUnit": 1 }`。旧项目缺少该字段时，编辑器按同一默认值读取并在后续保存时补齐单位信息，但不会自动缩放旧模型、相机、灯光或脚本参数；如需把既有非米制项目迁移到真实米制，应显式做成独立迁移流程。

## 层级图显示

层级图默认隐藏模板自带的基础场景节点，包括 `sky`、`ground`、`box`、`sun` 和 `camera`，以便导入模型后优先展示业务模型层级。该隐藏只影响层级图列表，不改变场景渲染、节点启用状态或保存内容。需要查看这些默认节点时，可在层级图右上角设置菜单中开启“显示默认场景节点”。

预览视口默认隐藏灯光和相机的辅助图标，避免默认灯泡、相机图标遮挡模型观察。该设置只控制编辑器叠加层，不影响场景中的灯光、相机、渲染或保存内容。需要临时选择灯光或相机时，可在预览工具栏的渲染选项中开启“显示灯光/相机图标”。

## Gizmo 平面操作

预览工具栏在普通“位置”“旋转”之外提供“平面移动”和“平面旋转”模式，用于工业模型或设备布置时减少误触 Y 轴导致的高度、俯仰或翻滚变化。平面移动只保留 XZ 水平面拖拽，Y 高度保持不变；平面旋转只保留绕 Y 轴的水平旋转环。该模式只影响编辑器当前的 Gizmo 操作入口，不改变节点坐标系、单位约定、场景保存结构或运行时逻辑。

预览工具栏提供“显示/隐藏网格”按钮，默认显示 XZ 水平面辅助网格，用于摆放模型时对齐位置和间距。网格会跟随当前视口中心延伸，避免在远距离摆放时出现固定边界。该网格是编辑器运行时辅助层，不保存到项目文件、不进入层级图，也不参与场景拾取、渲染导出或运行时逻辑；关闭按钮后只隐藏辅助线，不会修改场景节点。

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

拖入 GLB/GLTF 到场景画布时，编辑器会在不修改原始模型文件的前提下，自动把本次导入的模型实例缩放到适合编辑的大小。若鼠标拖放位置命中了场景中的地面或已有模型，导入模型的底部中心会落到该命中点；若拖到空白区域，则使用当前鼠标射线与 XZ 水平面交点作为落点，使模型落在可视网格对应位置。导入后仍可在右侧“变换”面板或画布 Gizmo 中继续精确调整位置、旋转和缩放。若模型在所有软件中都存在原点偏移、朝向错误或真实比例异常，仍建议回到 Blender 等建模工具修正源模型后重新导出。

### 模型阵列

在 Graph 中右键选中模型根节点或单个网格，可以使用“创建阵列...”一次性生成线性或网格阵列。线性阵列使用总数量和 XYZ 间距连续偏移；网格阵列使用 X/Y/Z 三个方向的数量和间距生成规则排布。确认后生成的阵列节点会作为普通场景节点保存，后续可继续用变换面板、Gizmo、Graph 和撤销/重做进行编辑。

阵列支持“实例”和“克隆”两种模式。实例模式会复用源网格的几何体和材质，适合大量重复设备、货架、管线和装饰模型；从 GLB 导入的多网格模型会为每个阵列元素创建一个容器节点，并对模型层级中的实际 Mesh 创建实例。克隆模式会创建普通副本，适合需要单独调整副本材质、骨骼或脚本的场景。大量阵列会增加 Graph 刷新和运行时渲染压力，单次阵列数量被限制为 1000 个以内。

导入后，右侧属性面板会出现“模型外挂脚本”区域：

- 参数脚本复用现有脚本装饰器，例如 `@visibleAsNumber`、`@visibleAsString`，字段会显示在属性面板中。
- 如果存在多个动画驱动脚本，可在属性面板中选择当前启用的动画脚本。
- 选择结果会保存到模型根节点的 `metadata.modelSidecar.selectedAnimationKey`，并同步 `metadata.scripts` 中动画脚本的启用状态。

动画驱动脚本通过 `onMqttValue` 接收外部实时值。当前版本只提供驱动入口，不内置 MQTT 连接、订阅和 broker 配置。后续接入 MQTT 客户端时，收到消息后调用 `dispatchMqttValueToObject` 即可把值分发给当前选中的动画驱动脚本。

部分 CAD 或工业设备 GLB 会保留很大的原始世界坐标偏移，例如模型零件集中在距离原点数千单位的位置。编辑器在导入带外挂脚本的模型包时，会在不改写 `.glb` 文件的前提下，把本次导入的几何体居中到模型根节点附近，并在导入后自动聚焦该模型根节点，避免新项目画布只看到空根节点或灯光图标。

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

### GLB 模型批量外挂脚本

当前已提供 `scripts/generate-glb-sidecars.cjs`，用于整理 `E:\公司文件\数字孪生\模型文件\GLB` 下的 GLB 模型包。脚本会保留顶层原始 GLB，不移动、不删除文件，只把每个模型复制到同名文件夹，并在文件夹内生成同名参数脚本和动画驱动脚本。

执行命令：

```bash
node scripts/generate-glb-sidecars.cjs
```

生成后的目录结构示例：

```text
E:\公司文件\数字孪生\模型文件\GLB\辊道机\
  辊道机.glb
  辊道机.params.ts
  辊道机.anim.roller.ts
  辊道机.anim.motor.ts
```

本批模型的默认脚本清单如下：

- `多穿小车`：`move` 整体行走、`fork` 货叉伸缩、`load` 载货显隐。
- `辊道机`：`roller` 辊筒旋转、`motor` 电机状态。
- `链条机`：`chain` 链条循环、`motor` 电机状态。
- `GD_有电机_Optimized(1)`：`roller` 输送辊旋转、`motor` 电机状态。
- `HCTS`：`state` 设备状态高亮。
- `LED`：`blink` 灯光闪烁、`status` 灯光状态。
- `RGV`：`move` 轨道行走、`state` 整车状态。
- `Shelf`：`state` 货架状态、`slot` 库位占用。
- `Stacker`：`travel` 堆垛机行走、`lift` 载货台升降、`fork` 货叉伸缩。
- `WLTS`：`roller` 辊筒旋转、`motor` 电机状态。
- `YZJ`：`transfer` 移载动作、`roller` 辊筒旋转、`state` 整体状态。

MQTT 值约定：

- 位移、货叉、升降、移载脚本接收数字并按 `minValue` 到 `maxValue` 归一化到 0-1，再映射到 `distance`。
- 辊筒、链条、电机脚本接收数字并按归一化比例换算为持续速度，`0` 表示停止，正数表示运行。
- 状态脚本支持数字、布尔、字符串和对象。`0/false/stopped` 表示停止，`1/true/running` 表示运行，`2/fault/alarm/故障/报警` 表示故障，`3/selected/选中` 表示选中。
- 对象 payload 可使用 `{ value }`、`{ state }`、`{ status }`、`{ position }`、`{ speed }` 或 `{ ratio }` 字段，脚本会自动读取第一个可用字段。

## 下载

**v5.4.0**

- Windows x64: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor%20Setup%205.4.0.exe
- macOS Apple Chip: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor-5.4.0-arm64.dmg
- macOS Intel Chip: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/x64/BabylonJS%20Editor-5.4.0.dmg
- Linux x64: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor-5.4.0.AppImage
- Linux arm64: https://babylonjs-editor.fra1.cdn.digitaloceanspaces.com/updates/BabylonJS%20Editor-5.4.0-arm64.AppImage

## 环境要求

### Windows

Windows 需要 Node.js、Yarn Classic、Python 3、Visual Studio 2022 C++ 工具链、Windows SDK 和 MSVC Spectre-mitigated libraries。先检查当前环境：

```powershell
node --version
npm --version
yarn --version
python --version
where.exe python
where.exe cl
```

如果 `python` 指向 `C:\Users\<用户名>\AppData\Local\Microsoft\WindowsApps\python.exe`，说明命中了 Microsoft Store 占位程序，`node-gyp` 不能用它编译 `node-pty`。可用用户级安装的 Python 3.12，并显式配置给 Yarn 和后续安装命令：

```powershell
winget install --id Python.Python.3.12 -e --scope user --accept-package-agreements --accept-source-agreements

$pythonPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
& $pythonPath --version

yarn config set python "$pythonPath"
[Environment]::SetEnvironmentVariable('PYTHON', $pythonPath, 'User')
[Environment]::SetEnvironmentVariable('npm_config_python', $pythonPath, 'User')
```

`npm 10` 可能会拒绝 `npm config set python`，此时使用上面的 `PYTHON` 和 `npm_config_python` 环境变量即可。

Visual Studio 需要安装 C++ build tools、Windows SDK，以及 `node-pty` 的 winpty 工程要求的 Spectre 缓解库。若构建报 `MSB8040: Spectre-mitigated libraries are required for this project`，可在 Visual Studio Installer 的 Individual components 中安装 `MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)`，也可以用命令行安装：

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe" modify `
  --installPath "D:\Program Files\Microsoft Visual Studio\2022\Enterprise" `
  --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre `
  --passive --norestart
```

安装后可确认存在类似目录：

```powershell
Get-ChildItem "D:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC" -Recurse -Directory |
  Where-Object { $_.FullName -match 'lib\\spectre\\x64' }
```

如 Visual Studio 安装路径不同，先用下面命令查询：

```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath
```

### macOS

macOS 需要安装 Xcode，用于编译编辑器依赖的原生模块。可从 [App Store](https://apps.apple.com/fr/app/xcode/id497799835?mt=12) 安装。

### Linux (apt)

```bash
sudo apt install -y make python build-essential
```

## 安装与构建

先安装依赖。本仓库使用 Yarn Classic。Windows 下建议在仓库根目录用 PowerShell 执行，并显式带上 Python、Node/Electron 镜像和串行原生构建参数：

```powershell
$pythonPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
$env:PYTHON = $pythonPath
$env:npm_config_python = $pythonPath
$env:npm_config_disturl = 'https://npmmirror.com/mirrors/node'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:CHILD_CONCURRENCY = '1'
Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

yarn install --non-interactive --network-timeout 600000
```

这些环境变量分别用于：让 `node-gyp` 使用真实 Python、从镜像下载 Node headers、从镜像下载 Electron、避免多个 `node-pty` 同时构建时抢占 MSBuild `.tlog` 文件，以及允许 winpty 的 `GetCommitHash.bat` 从当前目录被 `cmd` 找到。

`yarn install` 成功时会继续执行根 `postinstall`：重建 Electron 版 `node-pty`、执行 `electron-builder install-app-deps`、打包 `templates/*` 到 `editor/templates/*.tgz`，并运行 `scripts/localize-babylon-editors.mjs`。成功日志中应能看到类似内容：

```text
Rebuild Complete
completed installing native dependencies
Packed template:  babylonjs-editor-nextjs-template-v0.1.0.tgz
[localize-babylon-editors] Applied ... localization replacements.
```

如果 Windows 下运行 `yarn build` 报 `'tsc' 不是内部或外部命令`，通常是 `node_modules` 中依赖包存在，但 `node_modules/.bin` 命令垫片缺失。可在仓库根目录执行：

```bash
yarn install --ignore-scripts --non-interactive
```

该命令会重新链接 workspace 依赖和 `.bin` 命令，不会执行 Electron 原生依赖重建脚本。执行后如果 `editor/node_modules` 或 `templates/*/node_modules` 下残留旧版 `babylonjs-editor-tools`、`babylonjs-editor-cli`，需要删除这些嵌套旧包，让模块解析回到根 workspace。

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

```powershell
$pythonPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
$env:PYTHON = $pythonPath
$env:npm_config_python = $pythonPath
Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

yarn build
yarn start
```

`yarn build` 会依次构建 `tools`、`cli`、`editor`、`plugins`。`yarn start` 会运行 `editor` workspace 的 `electron .`，需要先生成 `editor/build/src/index.js`。启动成功后会打开标题为“仪表盘”的 Electron 窗口，开发者工具会自动打开。

本机验证过的成功环境：Node.js `v22.16.0`、npm `10.9.2`、Yarn `1.22.22`、Python `3.12.10`、Visual Studio 2022 Enterprise `17.14`、MSVC `14.44.35207`、Windows SDK `10.0.26100.0`。

### Electron 模板项目

编辑器创建的 Electron 项目在 Windows 下可以直接运行：

```bash
npm run dev
```

Electron 模板的开发脚本使用 `cross-env DEV=1` 设置开发环境变量，避免 Windows CMD 把 Unix 风格的 `DEV=1` 识别成命令而导致项目打开失败。已生成的旧项目如果仍然报 `'DEV' 不是内部或外部命令`，需要把项目 `package.json` 中的 `dev` 脚本同步为 `cross-env DEV=1 ...`，并安装 `cross-env`。

从源码开发态启动编辑器时，新建项目会优先把 `babylonjs-editor-tools` 和 `babylonjs-editor-cli` 指向当前仓库的本地 `tools`、`cli` 工作区，确保本地新增的模型外挂脚本和 MQTT 驱动导出可以立即用于新项目。正式打包发布时仍使用模板原有的 npm 依赖声明。

### 场景加载黑屏排查

编辑器打开项目时会在加载主场景期间临时暂停预览渲染，避免半加载状态闪烁。当前加载流程已增加兜底恢复：即使某个 mesh、场景链接、环境贴图或材质编译抛出异常，也会重新打开预览渲染并关闭加载进度弹窗，避免画布永久保持黑屏。

加载项目保存的编辑器相机时，会显式把该相机恢复为 `scene.activeCamera` 并重新绑定输入控制；如果旧项目或损坏项目缺失、破坏了 `editorCamera` 配置，编辑器会回退到当前预览相机继续加载场景资源，避免因编辑器相机异常中断加载而只显示黑底。

预览画布的点击选择、双击聚焦、右键菜单和拖放落点统一使用 canvas 客户区相对 CSS 像素坐标进行 Babylon 拾取；固定 720p/1080p/4K 预览会先扣除 `object-contain` 黑边并换算到真实渲染画面坐标。这样可避免高 DPI、窗口缩放、画布 CSS 尺寸变化或固定分辨率预览后出现鼠标位置与实际场景拾取位置偏移。

如果机器显卡较弱、使用高分屏、显卡驱动不稳定，或打开项目时出现黑屏、长时间无响应，可在 Dashboard 的“偏好设置”中开启“低硬件占用/安全打开模式”。该模式打开项目时会使用更保守的预览渲染配置，并跳过阴影、粒子、后处理、材质预编译等高占用恢复步骤。该设置不会覆盖项目资源或保存场景，只影响当前机器的打开策略；加载过程中可能会补齐编辑器需要的空目录。关闭后重新打开编辑器窗口并重新打开项目，即可恢复完整渲染加载行为。安全模式下为避免覆盖未加载资源，编辑器会阻止保存；关闭该模式并重新打开编辑器窗口和项目后再保存。

如果打开项目后仍然看不到模型，优先查看编辑器底部“控制台”和开发者工具 Console。场景加载失败会输出 `Failed to load scene "..."`，后面会带上具体资源或配置错误；如果控制台显示 `Scene loaded and editor is ready.`，则说明场景已加载，问题更可能是相机位置、模型坐标偏移、资源本身不可见，或当前场景没有有效的 `activeCamera`。

### node-pty 主进程异常排查

打开项目时编辑器会用内置终端检查 Node.js 和安装项目依赖。Windows 下短命令可能在终端尺寸同步前已经退出，`node-pty` 会抛出 `Cannot resize a pty that has already exited`。主进程已经对 `write`、`resize`、`kill` 和窗口关闭清理做了兜底捕获，这类 pty 生命周期竞态只会被忽略并清理缓存，不应再弹出 “A JavaScript error occurred in the main process”。

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
