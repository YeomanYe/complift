# complift · 总设计文档

> flow-project-bootstrap Stage 1 产出（2026-06-12）。
> 决策模式：用户已委托（"直接按最推荐的实现，最后告知选项与选择"，2026-06-12），本文档记录每项决策的候选与选定理由。
> 前置准备简报：[docs/prep-brief.md](./prep-brief.md)

## 1. MVP & 用户

- **产品意图**：在任意网页上点选一个元素，把它 clone 成可实时预览、可与原页面叠加对比、可被 AI agent 持续修改且带版本历史的 React 组件。
- **目标用户**：前端开发者/设计工程师（替代手动 DevTools 扒样式、DivMagic/Codelifter 商业扩展）；AI-assisted 开发者（把页面真实元素作为上下文交给 Claude Code 等 agent 并让其直接迭代产出）。
- **核心流**：进入选取模式 → hover 高亮 + click 锁定（面包屑调层级）→ 确定性提取 outerHTML + computed styles → 生成自包含 TSX+CSS → side panel 实时预览/查源码 → 覆盖对比原元素 → agent 经本地 relay(MCP) 改代码自动记版本 → 回看/回滚。
- **In scope**：Chrome MV3（content script 选取层 / side panel 工作台 / 独立预览窗 / background）、确定性 DOM→React 转换（不调 LLM）、sandbox iframe 实时预览、覆盖对比（透明度/onion-skin）、版本历史（IndexedDB 全量快照 + diff 展示 + 回滚）、本地 relay + MCP server、代码复制导出。
- **Out of scope**：扩展内调 LLM 做语义重构（交给接入的 agent）、Tailwind/Vue/Svelte 输出、跨域 iframe/Canvas/WebGL/动画捕获、Firefox/Safari、商店上架（→ flow-ext-publish）、云端同步/账号。
- **Non-goals**：不做生产级采集/反爬；不替代 DevTools；不承诺 1:1 像素完美（对比工具的意义就是暴露差距）。

## 2. 主流程图

```
[网页] → (点扩展/快捷键) → [选取模式] → (hover 高亮/click 锁定) → ⟨选中层级 OK?⟩
   ─no→ (面包屑调父/子) ─┘                                          │yes
[提取 DOM+computed styles] → [确定性生成 TSX+CSS v1] → [工作台 ready]
[工作台] → (看预览/源码) → (覆盖对比原元素) → ⟨满意?⟩ ─yes→ [复制/导出]
                └─no→ (agent 经 MCP 改码 / 手动编辑) → [新版本 vN] → (实时预览热更) ─┐
                      (不满意可回滚 → 新版本指向旧内容) ←──────────────────────────┘
```

## 3. 主交互设计

- **S1 选取层**（content script overlay）：hover 高亮框 + tag/类名/尺寸 tooltip；click 锁定；ESC 退出；DOM 面包屑选父/子。
- **S2 Side Panel 工作台**（主界面，按 Drafting Bench 布局）：上 40–45% 网格纸 stage 常驻渲染当前组件（四周尺寸刻度 + 宽高标注，Compare 透明度滑杆/onion-skin 嵌在 stage 工具沿）；stage 顶部横向组件胶片条（切换组件）；下方 inspector 收 Code / History 两 tab（版本史 = 带编号刻度的时间轴）；顶部状态条含 agent 连接指示。
- **S3 独立预览窗口**：单组件全屏预览，视口预设 375/768/1024/1440，跟随最新版本热更新。
- **S4 本地 relay + MCP server**（无 UI）：agent 的 list / get / update / history API。
- **状态流转**：`idle → picking → captured → generating → ready(v1) → (agent|manual edit → vN | 回滚 → 新版本指向 vK)`；error 显示原因 + 重试。
- **决策点**：子树样式提取深度（默认全量，上限可调）；CSS 生成策略（默认 computed-style diff 精简）；对比模式（默认 overlay）；回滚 = 不可变历史新版本。

## 4. 主要技术栈

- **运行面**：Chrome Extension Manifest V3 + 本地 Node relay（agent 接入面）
- **框架**：React 19 + Vite（扩展框架 WXT）/ TypeScript
- **仓库形态**：pnpm monorepo —— `packages/extension`（WXT）+ `packages/preview`（预览站）+ `packages/relay`（relay + MCP server）
- **关键库**：CodeMirror 6（代码查看/编辑）、esbuild-wasm（扩展内 sandbox 实时编译 TSX）、idb（IndexedDB）、jsdiff（版本 diff）、@modelcontextprotocol/sdk（MCP）、ws（relay）
- **适配器层**：`PlatformAdapter` 抽象 chrome.storage / runtime 消息 / relay 连接；preview 注入 MockPlatformAdapter

## 5. 设计方向 + Preview Mockup

- **Status**: Required（理由见 prep-brief：主界面在 side panel，真实验证反馈链长；UI 可 mock 高保真走查）
- **3 路 mockup 路径**（全量保留，可对比）:
  - `.agent/jobs/preview-mockup-1/` — style: Panel Native / 面板原生（DevTools 同族，安静档）
  - `.agent/jobs/preview-mockup-2/` — style: Quiet Ops Console / 静默操作台（Linear-look 暗色，中性档）
  - `.agent/jobs/preview-mockup-3/` — style: Drafting Bench / 制图台（工程蓝图，大胆档）
- **方向卡**: `.agent/jobs/director-design-variants/directions.md`
- **飞书推送**: skipped（non-feishu CLI 会话，路径已在对话贴出）
- **用户选定**: **mockup-3（Drafting Bench / 制图台）** —— 用户委托决策（2026-06-12），选定理由：① 预览、像素对比、agent 活动指示常驻 C 位，直接对应产品三大核心需求（clone 对比 / agent 迭代 / 实时预览）；② stage+inspector 垂直分屏适配窄高 side panel；③ 记忆点最强，与同类商业产品差异化。已知代价：stage 常驻占 40% 垂直空间 → 以 stage 折叠快捷键兜底；亮纸底贴暗站刺眼 → 后续可加暗色 stage 皮肤。
- **Component reuse plan**（mockup-3 meta.json）：零代码阶段纯视觉占位；Stage 2.3 落地时由 preview 入口直接 import `packages/extension` 真实组件，适配器层切 PlatformAdapter；切回 deadline = MVP 第一周。
- **预览页地址**: `<PREVIEW_URL>`（Stage 2.4 部署后回填）

## 6. 部署方案

- **Repo visibility**: public（开源工具型项目，无敏感数据；与参考产品 playwriter/MarkLayer 同生态位）
- **部署目标**: GitHub Pages（public 仓库默认路由；零凭据负担，git push 即触发）
- **偏离默认的理由**: 无偏离
- **凭据就绪状态**:
  - 所需环境变量: 无（GitHub Pages 经 Actions 部署，gh 已登录 YeomanYe 账号）
  - 检测时间: 2026-06-12
  - 状态: ✅ ready（n/a — 无需 token）
- **扩展本体分发**: 开发期 `chrome://extensions` load unpacked；商店上架延后（→ flow-ext-publish）

## 7. 后续规划（post-MVP roadmap）

- Tailwind 输出格式；Vue/Svelte 目标框架
- 扩展内可选 LLM 辅助语义化重构（组件拆分/props 提取）
- React Fiber / source map 检测：在自己项目上定位真实组件源码（Whipped 思路）
- 动画/伪元素捕获增强；跨域 iframe 受限场景的降级提示
- 多 agent 并发 session（参考 playwriter 的 session 隔离模型）
- Chrome Web Store 上架（flow-ext-publish）
- 规模预期：个人/小团队开发工具，本地优先，无服务端

## 8. Stage 1 决策锁定记录

> 用户已于 2026-06-12 显式委托："直接按最推荐的实现，最后告诉我有哪些选项、选择了什么"。以下按委托选定：

- [x] **MVP 切片**：接受第 1 节切片（确定性转换不调 LLM、agent 走 MCP 接入、版本历史不可变快照）
- [x] **Preview mockup**：选定 mockup-3 Drafting Bench（候选 3 套全量保留于 `.agent/jobs/`，理由见第 5 节）
- [x] **部署方案**：public repo + GitHub Pages（理由见第 6 节）
- [x] **后续规划**：按第 7 节方向（本期不展开）

**其余技术选型（委托选定，候选与理由）**：

| 决策 | 候选 | 选定 | 理由 |
|---|---|---|---|
| 扩展框架 | WXT / CRXJS / 裸 Vite 多入口 | **WXT** | Vite 系维护最活跃、MV3 一等支持、内置 HMR 与多 entrypoint |
| 实时编译 | esbuild-wasm / babel-standalone / Sandpack 自托管 | **esbuild-wasm** | MV3 CSP 下 sandbox iframe 内可跑、体积与速度优于 babel-standalone、无 Sandpack 的远端 bundler 依赖 |
| Code tab 人工编辑 | 只读 / 可编辑 | **可编辑** | 编辑 = 新版本，与 agent 修改同一历史轨道 |
| agent 协议 | 自定义 WS / MCP | **MCP（streamable HTTP）+ WS relay** | agent 生态标准接口；relay 仿 playwriter 本地架构 |
| 仓库形态 | 单包多入口 / pnpm monorepo | **pnpm monorepo** | extension/preview/relay 三运行面隔离依赖；preview 经 workspace 复用扩展组件 |
| 项目名 | complift / uilift / elemforge / clonepick | **complift**（工作名） | component + lift；如需改名告知即可，目录与仓库同步重命名 |
