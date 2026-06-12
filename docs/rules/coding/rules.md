# coding 规则

## TypeScript

- **COD-1 strict 全开**：所有包 `tsconfig` 必含 `"strict": true` + `"noUncheckedIndexedAccess": true`。禁 `any`（用 `unknown` + 类型收窄）；`as` 断言必须带一行注释说明为什么类型系统推不出来。`@ts-ignore` 禁用，确需压制用 `@ts-expect-error` + 理由。
- **COD-2 类型归属**：跨包共享的只有协议/数据类型（组件 schema、版本记录、MCP 消息），放将来 `packages/shared` 或 relay 的 `types` 导出；包内私有类型不导出到包边界外。

## React 19

- **COD-3 函数组件 + hooks**：禁 class 组件。派生值直接计算，不用 `useEffect` 同步 state（effect 只用于真正的外部副作用——经 adapter 的订阅、定时器、DOM 测量）。组件状态优先局部，跨组件状态用 context；**引入状态管理库 = 选型变更，先改 design.md §8 再动手**。
- **COD-4 文件与命名**：组件 `PascalCase.tsx` 一文件一组件；hooks `useXxx.ts`；非组件模块 `camelCase.ts`；测试与被测文件同目录（`Foo.test.tsx`）。运行面入口按 WXT 约定放 `entrypoints/`，可复用 UI 放 `src/`。

## 依赖与工具

- **COD-5 新依赖对照清单**：design.md §4 已锁定关键库（CodeMirror 6 / esbuild-wasm / idb / jsdiff / @modelcontextprotocol/sdk / ws）。新增 runtime 依赖必须在 PR 描述写明：解决什么、为什么不能用已有库或手写、包体积影响（extension 是分发产物，体积敏感）。devDependencies 不受此限但同样禁重复造轮子。
- **COD-6 格式化与 lint 单一事实源**：仓库根统一 Prettier + ESLint（typescript-eslint）配置，包级不得覆盖风格规则（默认选型，实现阶段落地；若换工具改本条即可，无需上升为决策变更）。格式问题交给工具，code review 不讨论格式。
