# complift 工程规范 — 分域索引

入口：人类看 [CONTRIBUTING.md](../../CONTRIBUTING.md)，agent 看 [AGENTS.md](../../AGENTS.md)。本目录是分域硬规则正文。每条规则带编号（`ARC-1` 等），review 按编号引用。

| 域 | 管什么 | 规则 |
|---|---|---|
| [architecture](./architecture/index.md) | monorepo 结构、包依赖方向、PlatformAdapter 适配器边界 | `ARC-*` |
| [coding](./coding/index.md) | TypeScript / React 代码风格、依赖引入 | `COD-*` |
| [testing](./testing/index.md) | Vitest、TDD 纪律、测试组织 | `TST-*` |
| [security](./security/index.md) | relay 网络面、扩展权限、sandbox 编译 | `SEC-*` |
| [ui](./ui/index.md) | 设计 token、颜色语义、字体 | `UI-*` |

修改规则本身：规则与 [design.md](../design.md) 锁定决策冲突时以 design.md 为准并修正规则；新增/修改规则条目走 PR，留变更理由。
