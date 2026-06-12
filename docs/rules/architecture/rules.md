# architecture 规则

## 工程结构

- **ARC-1 包布局固定**：monorepo 只有三个顶层包——`packages/extension`（WXT + React 19 + Vite + TS）、`packages/preview`（Vite React 预览站）、`packages/relay`（Node + MCP server）。新增顶层包必须先在本条追加并说明理由，不允许"先建目录后补规则"。
- **ARC-2 依赖方向单向**：
  - 允许：`preview → extension`（workspace import 真实组件与类型）。
  - 禁止：`extension → preview`、`relay → extension` UI 代码、一切循环依赖。
  - extension 与 relay 之间只共享**协议类型**；出现第二处共享需求时才抽 `packages/shared`，不预建空壳包。
  - 校验：`pnpm -r exec depcruise` 或人工 review import 路径；任何反向 import 即返工。
- **ARC-3 包间依赖用 `workspace:*` 协议**，版本由根 `pnpm-lock.yaml` 单一锁定；不允许包内出现第二个 lockfile。
- **ARC-4 pnpm 唯一**：根 package.json 须配 `"preinstall": "npx only-allow pnpm"`（实现阶段落地）。仓库内出现 `package-lock.json` / `yarn.lock` 即错误。

## 适配器边界（PlatformAdapter）

- **ARC-5 平台 API 只进适配器**：`chrome.*`（storage / runtime 消息 / sidePanel / scripting…）与 relay 连接（ws / MCP client）只能出现在 `packages/extension/src/platform/`（`PlatformAdapter` 接口 + 实现）与 WXT entrypoints 的引导代码中。组件、hooks、状态机、转换逻辑一律只依赖 `PlatformAdapter` 接口。
  - 校验：`grep -rn "chrome\." packages/extension/src --exclude-dir=platform` 排除 entrypoints 引导后应零命中。
- **ARC-6 禁环境分支污染**：真实组件 / 业务模块内禁止 `if (PREVIEW_MODE)`、`import.meta.env` 环境判断、`typeof chrome !== 'undefined'` 探测。preview 与真实环境的全部差异 = 注入 `ChromePlatformAdapter` 还是 `MockPlatformAdapter`（+ fixture 数据），差异只活在 adapter 实现内。
- **ARC-7 接口先行**：需要新平台能力时，顺序固定——①在 `PlatformAdapter` 接口加方法 → ②补 `MockPlatformAdapter` 实现（含 fixture）→ ③写真实实现。preview 永远不允许因缺 mock 而 import 真实平台代码。
- **ARC-8 adapter 注入点唯一**：每个运行面（sidepanel / content / background / preview 站）在入口处注入一次 adapter（props / context），组件树内不得二次实例化平台实现。
