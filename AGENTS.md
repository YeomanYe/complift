# AGENTS.md — complift agent 常驻规则

面向所有 AI agent（Claude / Codex / 其他）。每条都是硬规则，可被 review 时按编号引用。人类工作流见 [CONTRIBUTING.md](./CONTRIBUTING.md)；分域细则见 [docs/rules/](./docs/rules/index.md)；产品/技术决策单一事实源是 [docs/design.md](./docs/design.md)。

## 必守规则（违反任一条即返工）

1. **只用 pnpm**。禁 `npm` / `yarn` 命令与 lockfile。安装依赖：`pnpm add --filter <pkg>`。
2. **TDD**：先写失败测试再写实现（superpowers:test-driven-development）。bugfix 第一步是写复现测试。合并门槛 `pnpm -r test` 全绿。
3. **适配器边界**：`chrome.*` 与 relay 连接只能出现在 `packages/extension/src/platform/`（PlatformAdapter 实现）与 WXT entrypoints 引导代码里。组件 / hooks / 业务逻辑一律只依赖 `PlatformAdapter` 接口。校验：`grep -rn "chrome\." packages/extension/src --exclude-dir=platform` 业务代码应零命中。
4. **禁 PREVIEW_MODE 分支**：真实组件内不得出现 `if (PREVIEW_MODE)`、`import.meta.env.MODE === 'preview'` 之类环境分支。preview 与真实环境的差异只能体现在注入哪个 adapter（preview 注入 `MockPlatformAdapter` + fixtures）。
5. **relay 只绑 `127.0.0.1`**。不得改成 `0.0.0.0` 或其他 interface。放开绑定属安全设计变更，必须先经用户批准（SEC-2）。
6. **Conventional Commits**：`<type>(<scope>): <subject>`，scope ∈ `extension|preview|relay|docs|repo`。
7. **不擅自改锁定决策**：技术选型（WXT / esbuild-wasm / MCP / pnpm monorepo 等）已在 docs/design.md §8 锁定。换库 / 换框架 / 加状态管理库 = 决策变更，先提出、获批、更新 design.md，再动代码。
8. **设计 token 单一来源**：颜色 / 字体取值只能引用 token（来源 mockup-3 Drafting Bench，见 [docs/rules/ui/rules.md](./docs/rules/ui/rules.md)），不得在组件里散写 hex。
9. **manifest 权限最小化**：新增 `permissions` / `host_permissions` 必须在提交说明里写明理由（SEC-3）。
10. **不碰 `docs/design.md` / `docs/prep-brief.md`** 除非任务就是更新决策记录且已获批。

## 路由表（改什么 → 先读什么）

| 任务涉及 | 必读 |
|---|---|
| 新包 / 包间 import / chrome.* / relay 客户端 | [docs/rules/architecture/rules.md](./docs/rules/architecture/rules.md)（ARC-*） |
| TS / React 代码、新依赖 | [docs/rules/coding/rules.md](./docs/rules/coding/rules.md)（COD-*） |
| 测试、bugfix | [docs/rules/testing/rules.md](./docs/rules/testing/rules.md)（TST-*） |
| relay 网络 / manifest 权限 / sandbox 内编译执行 | [docs/rules/security/rules.md](./docs/rules/security/rules.md)（SEC-*） |
| 样式、颜色、字体、组件视觉 | [docs/rules/ui/rules.md](./docs/rules/ui/rules.md)（UI-*） |

## 仓库地标

- `packages/extension` — WXT + React 19 + TS 的 MV3 扩展（content script 选取层 / side panel 工作台 / 独立预览窗 / background）
- `packages/preview` — Vite React 预览站，import extension 真实组件 + MockPlatformAdapter
- `packages/relay` — Node relay + MCP server（@modelcontextprotocol/sdk + ws）
- `.agent/jobs/` — 各阶段任务产物（mockup、报告），只读参考，勿当作生产代码
