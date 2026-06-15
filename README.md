# complift

> component + lift —— 在任意网页上点选一个元素，把它确定性地 clone 成可实时预览、
> 可与原页面叠加对比、可被 AI agent 持续修改且带版本历史的 React 组件。

complift 是一个 Chrome MV3 扩展 + 本地 relay。面向前端开发者 / 设计工程师
（替代手动扒 DevTools 样式），以及 AI-assisted 开发者（把页面真实元素作为上下文
交给 Claude Code 等 agent，让其经 MCP 直接迭代产出并自动记版本）。

核心流：进入选取模式 → hover 高亮 + click 锁定 → **确定性**提取 outerHTML +
computed styles（不调 LLM）→ 生成自包含 TSX+CSS → side panel “Drafting Bench”
工作台实时预览/查源码 → 覆盖对比原元素 → agent 经本地 relay(MCP) 改代码自动记
版本 → 回看 / 回滚。

## 仓库结构（pnpm monorepo）

| 包 | 角色 |
|---|---|
| `packages/extension` | WXT + React 19 + TS 的 MV3 扩展：content script 选取层 / side panel 工作台（esbuild-wasm sandbox 实时预览 + 页面叠加对比 + 版本史/回滚）/ 独立预览窗 / background |
| `packages/relay` | 本地 Node 进程：WS hub（**只绑 `127.0.0.1:8765`**，扩展主动拨号）+ MCP stdio server，暴露 5 个 `complift_*` 工具给外部 agent |

> 架构边界：`chrome.*` 与 relay 连接只出现在 `packages/extension/src/platform/`
> 适配器实现与 WXT 引导代码；业务逻辑只依赖 `PlatformAdapter` 接口。

## 快速开始

```bash
pnpm install

# 构建扩展 → load unpacked
pnpm --filter extension build
# 在 chrome://extensions 开启开发者模式，Load unpacked
# 选 packages/extension/.output/chrome-mv3

# 启动 relay（agent 接入面）
pnpm --filter relay build
pnpm --filter relay exec complift-relay   # 监听 127.0.0.1:8765
```

完整加载步骤、relay 启动、MCP 接入与人工冒烟清单见
[docs/dev/loading.md](docs/dev/loading.md)。产品/技术决策单一事实源见
[docs/design.md](docs/design.md)，agent 常驻规则见 [AGENTS.md](AGENTS.md)。

## MCP 集成（接入 Claude Code）

relay 同时是 MCP server。在仓库根目录：

```bash
claude mcp add complift -- node packages/relay/dist/index.js
```

接好后 agent 可用 5 个工具：

- `complift_list_components` — 列出已克隆的组件
- `complift_get_component` — 取某组件（默认 head 版本）的 TSX/CSS
- `complift_get_history` — 取版本时间轴
- `complift_update_component` — 改代码 → 入库为新 head 版本（工作台实时热更）
- `complift_rollback` — 回滚到某历史版本（不可变，回滚产生新版本）

agent 调 `complift_update_component` 后，side panel 工作台与独立预览窗会**无需刷新
即实时更新**。

## 已知边界

- 跨域 iframe、`<canvas>` / WebGL、CSS 动画 / 伪元素**不捕获**——超出确定性 DOM→React
  提取范围
- 不承诺 1:1 像素完美：overlay 对比工具的意义正是暴露差距
- 仅 Chrome MV3（Firefox/Safari 不在范围）；扩展内不调 LLM 做语义重构（交给接入的 agent）
- 输出仅 React TSX + 原生 CSS（Tailwind / Vue / Svelte 为 post-MVP）

## 开发

```bash
pnpm -r test        # 全仓单测
pnpm -r typecheck   # 全仓类型检查
pnpm -r build       # 全仓构建
```

贡献规则：只用 pnpm；TDD（先写失败测试）；Conventional Commits；详见
[AGENTS.md](AGENTS.md) 与 [docs/rules/](docs/rules/index.md)。
