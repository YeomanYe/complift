# Project Prep Brief — complift（工作名）

> 由 project-prep 产出（2026-06-12）。作为 flow-project-bootstrap Stage 1 的输入。

## Product Intent

在任意网页上点选一个元素，把它 clone 成可实时预览、可与原页面叠加对比、可被 AI agent 持续修改且带版本历史的 React 组件。

## Target Users

- **前端开发者 / 设计工程师**：想把网页上看到的 UI 元素快速变成自己项目里的 React 组件。现状是手动 DevTools 扒 HTML+CSS，或用 DivMagic / Codelifter 等商业扩展（闭源、依赖云端 AI）。
- **AI-assisted 开发者**：用 Claude Code / Codex 等 agent 迭代 UI，需要把"页面上的真实元素"作为高质量上下文交给 agent，并让 agent 直接修改产出、可回看历史。

## Core Flow（happy path）

1. 在目标网页点扩展图标（或快捷键）进入**选取模式**
2. hover 高亮候选元素（tag / 类名 / 尺寸 tooltip），click 锁定；DOM 面包屑微调选中层级（父/子）
3. 扩展提取 `outerHTML` + computed styles（diff against defaults）+ 关键资源 → **确定性规则**生成自包含 React 组件（TSX + CSS）
4. Side Panel 工作台查看：**实时预览 + 源码 + 版本历史**
5. 开**覆盖对比**：组件渲染结果叠加在原元素上（透明度滑杆 / onion-skin），像素级比对
6. 需要时开**独立预览窗口**（多视口宽度）
7. agent 通过本地 relay（MCP）连接，读取/修改组件代码 → 每次修改自动记版本，预览实时热更新；不满意可回滚

## Main Interaction Design

**屏幕清单**：

- **S1 选取层**（content script overlay，注入目标页）：hover 高亮框 + 信息 tooltip；click 锁定；ESC 退出；DOM 面包屑选父/子
- **S2 Side Panel 工作台**（主界面）：
  - 左：本页/全部 clone 的组件列表（缩略图 + 名称 + 来源 + 版本数）
  - 右：当前组件 4 个 tab —— **Preview**（实时渲染 + 视口切换）/ **Code**（TSX + CSS，语法高亮，可编辑）/ **History**（版本列表：时间、来源 manual|agent、diff 摘要；可查看可回滚）/ **Compare**（覆盖对比控制：开关、透明度、模式）
  - 顶部状态条：agent 连接状态（connected / disconnected）、提取状态
- **S3 独立预览窗口**：单组件全屏预览，视口预设 375/768/1024/1440，跟随最新版本热更新
- **S4 本地 relay + MCP server**（无 UI）：agent 的 list / get / update / history API

**状态流转**：`idle → picking → captured → generating → ready(v1) → (agent|manual edit → vN | 回滚 → 新版本指向 vK)`；任一步 error → 显示原因 + 重试

**决策点**：

- 选取时是否包含子树全部样式（默认是，深度上限可调）
- CSS 生成策略：精简 computed-style diff（默认）vs 全量快照
- 对比模式：overlay（默认）/ side-by-side
- 回滚语义：回滚 = 新建一个内容等于旧版本的新版本（**不可变历史**）

## MVP Scope

**In scope**：

- Chrome MV3 扩展：content script 选取层 / side panel 工作台 / 独立预览窗口 / background service worker
- 确定性 DOM→React 转换（outerHTML + computed styles diff → 自包含 TSX + CSS，**不依赖 LLM**）
- 实时预览（扩展内 sandbox iframe + 本地编译）
- 覆盖对比（透明度 / onion-skin）
- 版本历史（全量快照存 IndexedDB，jsdiff 展示差异，可回滚）
- 本地 relay + MCP server（agent：列组件 / 读代码 / 写新版本 / 读历史）
- 代码复制 / 导出

**Out of scope**：

- LLM 语义化重构（交给接入的 agent 做，扩展本身不调 LLM）
- Tailwind / Vue / Svelte 输出格式
- 跨域 iframe / Canvas / WebGL / 动画捕获
- Firefox / Safari、商店上架（后续走 flow-ext-publish）
- 云端同步 / 账号体系

**Non-goals**：不做生产级采集/反爬；不替代 DevTools；不承诺 1:1 像素完美（对比工具的意义就是暴露差距）

## Primary Tech Stack

- **运行面**：Chrome Extension Manifest V3 + 本地 Node relay（agent 接入面）
- **框架**：React 19 + Vite 7；扩展框架倾向 **WXT**（开放决策 #1）
- **语言**：TypeScript
- **关键库（倾向）**：CodeMirror 6（代码查看/编辑）、esbuild-wasm（扩展内实时编译 TSX）、idb（IndexedDB）、jsdiff（版本 diff）、@modelcontextprotocol/sdk（MCP server）、ws（relay）
- **Mock 基线**：chrome.* API 与 relay 连接全部走 `PlatformAdapter` 适配器层；preview 注入 `MockPlatformAdapter` + fixture 数据

## Preview Decision

- **Status: Required**
- **Why**：主界面在 Chrome side panel / 独立窗口里，真实验证要 build + 手动 load 扩展，反馈链长；工作台 UI（4 tab、状态机、对比交互）完全可以用 mock 数据高保真走查。命中"产品主界面不在常规 web 里"。
- **Surface**：同仓库 Vite 多入口 preview 站，2 个路由：`/workbench`（side panel 模拟）+ `/standalone`（独立预览窗模拟）
- **Data strategy**：TS fixture 模块注入 MockPlatformAdapter
- **Validation sequence**：先 preview 走查信息架构 / 4 tab 流转 / 对比交互 / 空错态 → 再 Chrome 真实加载验证选取层 + 提取 + 真实站点兼容性
- **Layout & pagination plan**：workbench 单页高密度（列表 + tabs）+ standalone 单页，共 2 路由；不做超长滚动塞入
- **Mock data richness**：≥12 个 clone 组件（button / card / navbar / pricing / table / hero / footer / form / badge / modal / sidebar / chart-card），来源站点多样（中英文、长短类名、特殊字符）；每组件 0–6 个版本（agent/manual 混合、含空历史）；时间分布今天/昨天/上周/上月；代码长度 20–400 行
- **State controller**：`normal / empty / loading / error`（提取失败、agent 断连）+ agent connected/disconnected 维度；顶部调试条 dropdown + `?state=` query 双通道
- **Component reuse plan**：真实组件在 `src/sidepanel/**`、`src/preview/**`；preview 入口 `preview/` 直接 import 真实组件；`src/platform/` 抽象 chrome.storage / runtime 消息 / relay 连接；零代码阶段（Stage 1.3 mockup 为纯视觉 HTML）允许占位，Stage 2.3 落地后 MVP 第一周内切回"真实组件 + 适配器"
- **边界**：preview 不替代真实环境测试（选取层 / 真实提取必须在 Chrome 里验）

## Open Decisions

1. 扩展框架：**WXT**(推荐，Vite 系维护最活跃) vs CRXJS vs 裸 Vite 多入口
2. 扩展内实时编译：**esbuild-wasm**(推荐，sandbox iframe 内跑) vs babel-standalone vs Sandpack 自托管
3. Code tab 人工编辑：推荐**允许**（编辑 = 新版本，与 agent 修改同一历史轨道）
4. relay 端口/协议：默认 `127.0.0.1` 固定端口 + MCP（streamable HTTP）——具体端口待定
5. 项目名：工作名 **complift**（component + lift）；备选 uilift / elemforge / clonepick
6. 仓库可见性 + 部署：建议 **public GitHub repo + GitHub Pages** 部署 preview 站（零凭据负担）；私有则 Cloudflare Pages（需配 CLOUDFLARE_API_TOKEN）
