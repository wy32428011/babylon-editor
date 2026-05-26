# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

Babylon.js Editor 5 是一个 Yarn Classic monorepo，核心产物是基于 Electron + React + Babylon.js 的桌面 3D 场景编辑器。根 `package.json` 通过 workspaces 组织以下包：

- `editor`：Electron 桌面应用，负责 Dashboard、主编辑器窗口、菜单、IPC、场景编辑 UI、项目加载/保存和打包所需静态资源。
- `tools`：`babylonjs-editor-tools` 运行时工具库，提供场景加载、脚本装饰器、脚本实例管理、MQTT 值分发等能力，被编辑器、CLI、模板和网站复用。
- `cli`：`babylonjs-editor-cli`，用于打包/发布通过编辑器创建的场景项目。
- `plugins`：插件聚合 workspace，目前包含 Quixel 和 Fab 插件；`plugins/package.json` 负责串行或并行构建子插件。
- `templates`：Next.js、Nuxt.js、Solid.js、Vanilla JS 和 Electron 项目模板；安装后由根 `postinstall.mjs` 打包为 `editor/templates/*.tgz`。
- `website`：独立 Next.js 官网/文档站，不属于根 `yarn build` 的默认构建范围。

## 常用命令

### 安装与启动

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

安装后根 `postinstall` 会重建 Electron 原生依赖 `node-pty`、执行 `electron-builder install-app-deps`、打包模板，并调用 `scripts/localize-babylon-editors.mjs` 应用内嵌 Babylon 编辑器中文化补丁。Windows 上 `node-pty` 需要真实 Python、VS2022 C++ 工具链、Windows SDK 和 MSVC Spectre-mitigated libs；如果 `python` 命中 WindowsApps 占位程序，优先按 README 的 Windows 环境要求配置。

```powershell
$pythonPath = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
$env:PYTHON = $pythonPath
$env:npm_config_python = $pythonPath
Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

yarn build
yarn start
```

`yarn start` 等价于运行 `editor` workspace 的 `electron .`，通常需要先执行 `yarn build` 生成 `editor/build`。

开发时监听 Editor 及其 CSS/依赖：

```bash
yarn watch-editor-all
```

按 workspace 单独监听：

```bash
yarn watch-tools
yarn watch-cli
yarn watch-plugins
```

### 构建

```bash
yarn build                 # tools -> cli -> editor -> plugins
yarn build-all             # build 之后再构建 templates 和 website
yarn build-all-concurrently
```

常用 workspace 构建：

```bash
yarn build-editor
yarn build-tools
yarn build-cli
yarn build-plugins
yarn build-templates
yarn build-website
```

打包当前平台 Electron 应用：

```bash
yarn package --noSign
```

可追加 `--x64`、`--arm64` 或同时追加两个架构参数。macOS 签名需要按 README 配置 `.env` 后运行不带 `--noSign` 的打包命令。

### Lint 与格式化

```bash
yarn lint          # format-check + 所有 workspace lint
yarn lint-fix      # prettier write + eslint --fix
yarn format
yarn format-check
```

单独 lint 某个区域：

```bash
yarn lint-editor
yarn lint-tools
yarn lint-cli
yarn lint-plugins
yarn lint-templates
yarn lint-website
```

代码风格由 `prettier.config.mjs` 定义：tab 缩进、`tabWidth: 4`、双引号、分号、`printWidth: 180`。ESLint 配置在 `eslint.config.mjs`，只覆盖 `**/src/**/*.{ts,mts,tsx}`，并启用本地规则 `local/require-return-type-on-class-methods`，类方法需要显式返回类型。

### 测试

根测试只覆盖 `tools` 和 `editor`：

```bash
yarn test
```

按 workspace 运行：

```bash
yarn workspace babylonjs-editor-tools test
yarn workspace babylonjs-editor test
```

运行单个测试文件时，路径相对对应 workspace：

```bash
yarn workspace babylonjs-editor-tools test test/tools/vector.test.ts
yarn workspace babylonjs-editor test test/tools/tools.test.mts
```

按测试名过滤可继续传递 Vitest 参数：

```bash
yarn workspace babylonjs-editor test test/tools/tools.test.mts -t "test name"
```

覆盖率：

```bash
yarn coverage
```

`tools/vitest.config.ts` 匹配 `./test/**/*.test.ts`，`editor/vitest.config.ts` 匹配 `./test/**/*.test.mts`，环境均为 `node`。

### 中文化脚本

内嵌 Babylon Node Material Editor、GUI Editor、Node Particle Editor 位于 `node_modules`，依赖重装后会被覆盖。不要手改 bundle；维护翻译时更新配置并运行脚本：

```bash
node ./scripts/localize-babylon-editors.mjs
node ./scripts/localize-babylon-editors.mjs --config ./scripts/localize-babylon-editors.config.json --dry-run
```

配置文件为 `scripts/localize-babylon-editors.config.json`，翻译条目使用 `{ "source": "...", "target": "..." }` 数组以保留替换顺序并检测重复源文案。

## 高层架构

### Electron 应用启动链路

- `editor/package.json` 的 `main` 指向 `build/src/index.js`；源码入口是 `editor/src/index.ts`。
- `editor/src/index.ts` 在主进程中注册菜单、自动更新、全局快捷键、协议、OAuth、Assimp、node-pty 和 IPC 事件模块，并根据命令行项目路径决定打开 Dashboard 或 Editor。
- Dashboard 窗口由 `editor/src/dashboard/window.ts` 创建，预加载脚本是 `editor/src/dashboard/preload.ts`，React 入口是 `editor/src/dashboard/main.tsx`。
- 主编辑器窗口由 `editor/src/editor/window.ts` 创建，预加载脚本是 `editor/src/editor/preload.ts`，React 入口是 `editor/src/editor/main.tsx`。创建编辑器窗口时会同时显示 splash 窗口，等待 `did-finish-load` 和 `editor:ready` 后关闭 splash。
- 自定义编辑器子窗口通过 `createCustomWindow` 加载同一个 `index.html`，再发送 `editor:window-launch-data` 指定入口脚本和参数；子窗口预加载脚本是 `editor/src/editor/windows/preload.tsx`。
- 窗口都加载构建后的 `index.html`，渲染侧通过各自的 `main.tsx` 区分 Dashboard、Editor 和 Splash。

### 构建输出与打包关系

- `editor`、`tools`、`cli` 都用 TypeScript 编译到 `build`，声明输出到 `declaration`；各自还通过 `esbuild.mjs` 打包 Node/CommonJS 或浏览器侧依赖。
- `editor` 构建额外运行 Tailwind：`tailwindcss -i ./index.css -o ./build/index.css`。
- 根 `build.mjs` 调用 `electron-builder`，实际 `projectDir` 是 `./editor`，输出目录为 `editor/electron-packages/`。
- Electron 打包包含 `editor/build/**`、`editor/fonts/**`、`editor/assets/**`、`editor/index.html`，并额外复制 `bin/**` 与 `templates/**`。
- `postinstall.mjs` 会把各模板 `yarn pack` 后复制为 `editor/templates/{nextjs,nuxtjs,solidjs,vanillajs,electron}.tgz`，因此模板改动需要关注打包产物如何被编辑器消费。

### 场景脚本与模型外挂脚本

README 记录的模型外挂脚本是当前维护重点之一：

- 模型同目录参数脚本命名为 `模型名.params.ts` 或 `模型名.params.tsx`。
- 动画驱动脚本命名为 `模型名.anim.动画名.ts` 或 `模型名.anim.动画名.tsx`。
- 同时存在 `.ts` 与 `.tsx` 时优先 `.ts`。
- 导入外部模型时，编辑器会把模型目录复制到项目 `assets/模型名/` 下，保持 `.gltf/.obj`、贴图、`.bin/.mtl` 与外挂脚本在同一模型包中。
- 参数脚本复用 `tools` 中的脚本装饰器，动画选择保存到模型根节点 `metadata.modelSidecar.selectedAnimationKey`，并同步 `metadata.scripts` 的启用状态。
- `dispatchMqttValueToObject` 是把外部实时值分发到当前动画驱动脚本的入口；当前仓库不内置 MQTT 客户端、订阅或 broker 配置。

相关入口集中在 `tools/src` 的脚本加载/分发逻辑、`cli/src/pack/scripts.mts` 的打包导出，以及各模板的 `src/scripts.ts`。批量生成示例 sidecar 的脚本是 `scripts/generate-glb-sidecars.cjs`。

### 中文界面维护边界

README 明确当前中文化范围包括 `editor/src` 内桌面编辑器菜单、Dashboard、创建项目、偏好设置、命令面板、资产浏览器、Inspector、弹窗、toast、文件选择器文案，以及内嵌 Babylon Node Material Editor、GUI Editor、Node Particle Editor。

继续保留英文的内容包括 Babylon.js/API 名、环境变量、文件扩展名、快捷键、协议名、包名、命令参数和内部序列化字段。`website`、`templates`、`cli`、`tools` 当前不属于中文化范围，除非需求明确要求扩展。

### Workspace 职责边界

- 修改桌面 UI、Electron IPC、项目窗口、Dashboard 或菜单时，优先从 `editor/src/index.ts`、`editor/src/electron/events/*`、`editor/src/dashboard/*`、`editor/src/editor/*` 追踪主进程到渲染进程的数据流。
- 修改场景加载、脚本装饰器、运行时脚本实例、MQTT 分发或模板运行时能力时，优先检查 `tools/src`，并同步确认 `cli/src/pack/*` 与 `templates/*/src/scripts.ts` 是否需要导出同一能力。
- 修改模板时，除了对应 `templates/<name>` 的源码，还要考虑 `postinstall.mjs` 打包模板到 `editor/templates/*.tgz` 的流程。
- 修改插件时，通过 `plugins/package.json` 的聚合脚本理解 Quixel 与 Fab 的构建关系；Fab 还会构建 Tailwind CSS。
- 修改网站时使用 `website` workspace 的 Next.js 命令；根 `yarn build` 不构建 website，`yarn build-all` 才会包含它。
