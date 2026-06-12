# Contributing to complift

complift：在任意网页点选元素，clone 成可实时预览、可叠加对比、可被 AI agent 经 MCP 持续修改且带版本历史的 React 组件。Chrome MV3 扩展 + 本地 relay 的 pnpm monorepo。

本文面向**人类贡献者**。AI agent 的常驻规则在 [AGENTS.md](./AGENTS.md)。分域硬规则在 [docs/rules/](./docs/rules/index.md)。产品与技术决策的单一事实源是 [docs/design.md](./docs/design.md)（改决策先改它，再改代码）。

## 环境要求

- Node.js ≥ 20 LTS
- **pnpm**（唯一包管理器，禁 npm / yarn）。出现 `package-lock.json` / `yarn.lock` 即为错误，删除并改用 pnpm。
- Chrome（开发期 `chrome://extensions` → Load unpacked 验证扩展本体）

## 仓库结构

```
packages/extension   Chrome MV3 扩展（WXT + React 19 + Vite + TS）
packages/preview     Vite React 预览站（mock 数据走查 UI，部署 GitHub Pages）
packages/relay       本地 relay + MCP server（Node，只绑 127.0.0.1）
docs/                design.md（决策）/ prep-brief.md / rules/（工程规范）
```

包间依赖方向与适配器边界是硬规则，见 [docs/rules/architecture/rules.md](./docs/rules/architecture/rules.md)。

## 常用命令（约定脚本名，实现阶段在各 package.json 落地）

```bash
pnpm install                          # 安装全部 workspace 依赖
pnpm --filter extension dev           # WXT 开发模式（HMR）
pnpm --filter preview dev             # 预览站本地开发
pnpm --filter relay dev               # 本地 relay + MCP server
pnpm -r test                          # 全仓 Vitest（合并门槛，必须全绿）
pnpm -r build                         # 全仓构建
```

## 开发工作流

1. **从分支开始**：`feat/<topic>`、`fix/<topic>`、`chore/<topic>`、`docs/<topic>`。不直接提交主分支。
2. **TDD**：先写失败测试，再写实现（见 [docs/rules/testing/rules.md](./docs/rules/testing/rules.md)）。bugfix 必须先有复现测试。
3. **Commit 用 Conventional Commits**：
   - 格式：`<type>(<scope>): <subject>`
   - type：`feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `build` / `ci`
   - scope 枚举：`extension` / `preview` / `relay` / `docs` / `repo`（跨包改动用 `repo`）
   - subject 用祈使句、不句号、≤ 72 字符。
4. **提交前自检**（PR checklist 同此）：
   - [ ] `pnpm -r test` 全绿
   - [ ] 无 `package-lock.json` / `yarn.lock` 混入
   - [ ] 业务代码无直接 `chrome.*` 调用（适配器边界，ARC-5）
   - [ ] 真实组件无 `PREVIEW_MODE` 类分支（ARC-6）
   - [ ] relay 监听地址仍是 `127.0.0.1`（SEC-1）
   - [ ] manifest 新增权限已在 PR 描述列明理由（SEC-3）
   - [ ] 颜色 / 字体未绕过设计 token（UI-1）

## 规则地图（按场景打开）

| 你在做什么 | 打开 |
|---|---|
| 加包 / 调包间依赖 / 碰 chrome.* 或 relay 连接 | [architecture](./docs/rules/architecture/rules.md) |
| 写 TS / React 代码、引新依赖 | [coding](./docs/rules/coding/rules.md) |
| 写测试 / 修 bug | [testing](./docs/rules/testing/rules.md) |
| 碰 relay 网络面 / manifest 权限 / sandbox 编译 | [security](./docs/rules/security/rules.md) |
| 写样式 / 用颜色字体 | [ui](./docs/rules/ui/rules.md) |

规则条目带编号（如 `ARC-5`），code review 时直接引用编号。
