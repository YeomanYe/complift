# complift MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome MV3 扩展——点选网页元素 → 确定性生成自包含 React 组件（TSX+CSS）→ side panel 实时预览/覆盖对比/版本历史 → 本地 relay + MCP 让 agent 读改组件代码。

**Architecture:** pnpm monorepo：`packages/extension`（WXT + React 19，含 content 选取层 / background 单一数据所有者 / sidepanel 工作台 / sandbox 编译预览页）+ `packages/relay`（Node：MCP stdio server + WS hub，extension 主动外连）。所有 chrome.* 与 relay 依赖经 `PlatformAdapter` 接口隔离。存储单写者 = background（IndexedDB），UI 与 relay 全部走 typed RPC。

**Tech Stack:** WXT ^0.20 / React 19 / TypeScript 5 / Vitest 3 + fake-indexeddb + jsdom / esbuild-wasm / idb / diff(jsdiff) / @uiw/react-codemirror (CM6) / zustand / ws / @modelcontextprotocol/sdk。安装时取各库最新 stable。

**全局纪律**（来自 AGENTS.md / docs/rules/）：
- 包管理只用 **pnpm**；conventional commits；每个 Task 结束必须 `pnpm -r test` + `pnpm -r typecheck` 全绿再 commit
- 纯逻辑（extractor / generator / store / relay 协议）一律 TDD：先写失败测试
- 禁止 `if (PREVIEW_MODE)` 进组件；mock 只能注入到 `PlatformAdapter` 实现层
- relay 只绑 `127.0.0.1`

---

## File Structure（全量地图）

```
complift/
├── package.json                  # private, workspaces 脚本: test/typecheck/build
├── pnpm-workspace.yaml           # packages/*
├── tsconfig.base.json
├── packages/
│   ├── extension/
│   │   ├── package.json
│   │   ├── wxt.config.ts         # WXT + react module + sandbox/web_accessible_resources manifest
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts      # environment: jsdom
│   │   ├── entrypoints/
│   │   │   ├── background.ts             # 数据所有者 + 消息路由 + relay client
│   │   │   ├── picker.content.ts         # 选取层（matches: <all_urls>, 按需注入）
│   │   │   ├── overlay.content.ts        # 覆盖对比层（按需注入）
│   │   │   ├── sidepanel/index.html      # 工作台
│   │   │   ├── sidepanel/main.tsx
│   │   │   ├── standalone/index.html     # 独立预览窗（extension page）
│   │   │   ├── standalone/main.tsx
│   │   │   └── sandbox/index.html        # MV3 sandbox: esbuild-wasm 编译+渲染
│   │   │   └── sandbox/main.ts
│   │   ├── src/
│   │   │   ├── lib/types.ts              # ClonedComponent / ComponentVersion / CaptureResult …
│   │   │   ├── lib/messages.ts           # typed RPC + 事件协议（含 runtime guard）
│   │   │   ├── lib/extract/extractor.ts  # DOM+computed styles → CaptureIR（纯函数,注入 doc/win）
│   │   │   ├── lib/extract/defaults.ts   # 每 tag 默认样式基线（隐藏 iframe 内取）
│   │   │   ├── lib/generate/generator.ts # CaptureIR → {tsx, css}（纯函数,确定性）
│   │   │   ├── lib/generate/naming.ts    # 类名分配/PascalCase 组件名
│   │   │   ├── lib/store/component-store.ts  # idb 封装,不可变版本历史
│   │   │   ├── lib/sandbox-protocol.ts   # iframe postMessage 协议（compile/render/result）
│   │   │   ├── platform/adapter.ts       # PlatformAdapter 接口
│   │   │   ├── platform/chrome-adapter.ts
│   │   │   ├── platform/mock-adapter.ts  # fixtures 注入（preview/测试用）
│   │   │   ├── background/router.ts      # RPC dispatch（纯函数,可测）
│   │   │   ├── background/relay-client.ts# WS 外连 relay + 断线重连
│   │   │   ├── picker/picker-ui.ts       # shadow-root 高亮框/面包屑/tooltip
│   │   │   ├── overlay/overlay-ui.ts     # 定位 iframe + opacity/difference
│   │   │   └── ui/                       # Drafting Bench 工作台组件
│   │   │       ├── Workbench.tsx         # 布局: Filmstrip + Stage + Inspector + StatusBar
│   │   │       ├── Filmstrip.tsx
│   │   │       ├── Stage.tsx             # 预览 iframe + 尺寸标注 + Compare 工具沿
│   │   │       ├── CodeTab.tsx           # CodeMirror, 保存=新版本(manual)
│   │   │       ├── HistoryTab.tsx        # 时间轴 + diff 摘要 + 回滚
│   │   │       ├── StatusBar.tsx
│   │   │       ├── store.ts              # zustand: 当前组件/版本/状态机
│   │   │       └── tokens.css            # Drafting Bench tokens(#F7F5F0/#21211D/#1E4FD8/#E8743B)
│   │   └── tests/                        # vitest（镜像 src 结构）
│   └── relay/
│       ├── package.json                  # bin: complift-relay
│       ├── tsconfig.json
│       ├── vitest.config.ts              # environment: node
│       ├── src/index.ts                  # 入口: MCP(stdio) + WS server 同进程
│       ├── src/hub.ts                    # WS hub: extension 连接管理 + 请求关联(id→promise,10s 超时)
│       ├── src/mcp.ts                    # 5 个 MCP tools → hub.request 转发
│       └── tests/hub.test.ts / mcp.test.ts
└── docs/dev/loading.md                   # load unpacked + relay 启动 + Claude Code 接 MCP 步骤
```

**消息流**：sidepanel —RPC→ background（唯一写 IndexedDB）；picker.content —capture→ background；background —broadcast(`component:changed`)→ sidepanel/standalone；relay ←WS— background（relay 的 MCP 工具调用转发为对 background 的 RPC）。

---

## 核心契约（所有 Task 共用，先于一切实现锁定）

### `src/lib/types.ts`

```ts
export interface ClonedComponent {
  id: string;                 // crypto.randomUUID()
  name: string;               // PascalCase, 生成器推断,可改
  sourceUrl: string;
  sourceSelector: string;     // 捕获时 CSS path
  capturedAt: number;         // epoch ms
  width: number;
  height: number;
  headVersionId: string;
}

export interface ComponentVersion {
  id: string;
  componentId: string;
  seq: number;                // 1..N 单调递增
  parentId: string | null;
  author: 'capture' | 'manual' | 'agent' | 'rollback';
  message: string;            // e.g. "captured from stripe.com" / agent 提交说明
  createdAt: number;
  files: { tsx: string; css: string };
}

/** 提取器输出的中间表示（与 DOM/chrome 解耦,可序列化） */
export interface CaptureIR {
  root: IRNode;
  baseUrl: string;
  pageTitle: string;
  viewport: { width: number; height: number };
  rect: { width: number; height: number };
}
export interface IRNode {
  tag: string;                          // 小写 tagName
  attrs: Record<string, string>;        // 已清洗: 无 on*/script/style 属性
  styles: Record<string, string>;       // computed style 与默认基线的 diff（kebab-case prop）
  children: (IRNode | IRText)[];
}
export interface IRText { text: string }

export interface GeneratedFiles { tsx: string; css: string; componentName: string }
```

### `src/lib/messages.ts` —— typed RPC

```ts
import type { CaptureIR, ClonedComponent, ComponentVersion } from './types';

export interface RpcMap {
  'component:list':     { req: {}; res: ClonedComponent[] };
  'component:get':      { req: { componentId: string; versionId?: string };
                          res: { component: ClonedComponent; version: ComponentVersion } };
  'component:history':  { req: { componentId: string }; res: ComponentVersion[] };
  'component:update':   { req: { componentId: string; tsx: string; css: string;
                                 author: 'manual' | 'agent'; message: string };
                          res: ComponentVersion };
  'component:rollback': { req: { componentId: string; versionId: string }; res: ComponentVersion };
  'component:delete':   { req: { componentId: string }; res: { ok: true } };
  'capture:create':     { req: { ir: CaptureIR; sourceUrl: string; sourceSelector: string };
                          res: { component: ClonedComponent; version: ComponentVersion } };
  'picker:start':       { req: { tabId?: number }; res: { ok: true } };
  'picker:cancel':      { req: {}; res: { ok: true } };
  'overlay:show':       { req: { componentId: string; opacity: number;
                                 mode: 'overlay' | 'difference' }; res: { ok: true } };
  'overlay:hide':       { req: {}; res: { ok: true } };
  'relay:status':       { req: {}; res: { connected: boolean } };
}
export type RpcMethod = keyof RpcMap;
export interface RpcRequest<M extends RpcMethod = RpcMethod> {
  kind: 'complift:rpc'; id: string; method: M; params: RpcMap[M]['req'];
}
export interface RpcResponse<M extends RpcMethod = RpcMethod> {
  kind: 'complift:rpc-result'; id: string; ok: boolean;
  data?: RpcMap[M]['res']; error?: string;
}
export type BroadcastEvent =
  | { kind: 'complift:event'; type: 'component:changed'; componentId: string }
  | { kind: 'complift:event'; type: 'component:created'; componentId: string }
  | { kind: 'complift:event'; type: 'relay:status'; connected: boolean }
  | { kind: 'complift:event'; type: 'picker:picked'; componentId: string };
export const isRpcRequest = (m: unknown): m is RpcRequest => /* kind 判别 */ ...;
export const isBroadcast = (m: unknown): m is BroadcastEvent => ...;
```

### `src/platform/adapter.ts`

```ts
import type { RpcMap, RpcMethod, BroadcastEvent } from '../lib/messages';
export interface PlatformAdapter {
  rpc<M extends RpcMethod>(method: M, params: RpcMap[M]['req']): Promise<RpcMap[M]['res']>;
  onEvent(cb: (e: BroadcastEvent) => void): () => void;   // 返回 unsubscribe
  sandboxUrl(): string;                                   // sandbox.html 的可嵌 URL
}
```

### WS relay 线协议（relay ↔ background）

```ts
// background → relay: 注册
{ kind: 'ext:hello', version: 1 }
// relay → background: 转发 MCP 工具调用（id 关联）
{ kind: 'relay:rpc', id: string, method: RpcMethod, params: unknown }
// background → relay: 结果
{ kind: 'ext:rpc-result', id: string, ok: boolean, data?: unknown, error?: string }
```
默认端口 **8765**（环境变量 `COMPLIFT_PORT` 覆盖）。

### Sandbox postMessage 协议（`src/lib/sandbox-protocol.ts`）

```ts
// host → sandbox iframe
{ kind: 'complift:render', id: string, tsx: string, css: string }
// sandbox → host
{ kind: 'complift:render-result', id: string, ok: boolean, error?: string,
  size?: { width: number; height: number } }
```

---

### Task 0: Monorepo 脚手架

**Files:** Create: `package.json` `pnpm-workspace.yaml` `tsconfig.base.json`

- [ ] root `package.json`：`private: true`，scripts `test: pnpm -r test` / `typecheck: pnpm -r typecheck` / `build: pnpm -r build`；`pnpm-workspace.yaml`: `packages: ['packages/*']`
- [ ] `tsconfig.base.json`：`strict: true, target ES2022, module ESNext, moduleResolution bundler, jsx react-jsx`
- [ ] 验证：`pnpm install` 成功（空 workspace 不报错）
- [ ] Commit `chore: monorepo scaffold`

### Task 1: extension 包脚手架（WXT + React19 编译通过）

**Files:** Create: `packages/extension/{package.json,wxt.config.ts,tsconfig.json,vitest.config.ts}` + `entrypoints/` 全部 stub（background/picker.content/overlay.content/sidepanel/standalone/sandbox 最小可编译占位）

- [ ] `pnpm create wxt@latest`（react template）后改造为 workspace 包；deps: react@19 react-dom@19；devDeps: vitest jsdom @testing-library/react fake-indexeddb typescript
- [ ] `wxt.config.ts` manifest 关键位：
  ```ts
  manifest: {
    name: 'complift', permissions: ['sidePanel', 'storage', 'scripting', 'activeTab', 'tabs'],
    host_permissions: ['<all_urls>'],
    sandbox: { pages: ['sandbox.html'] },
    content_security_policy: {
      sandbox: "sandbox allow-scripts allow-same-origin; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; object-src 'self'"
    },
    web_accessible_resources: [{ resources: ['sandbox.html', 'sandbox/*'], matches: ['<all_urls>'] }],
    side_panel: { default_path: 'sidepanel.html' },
    action: { default_title: 'complift' },
  }
  ```
  content scripts 用 `registration: 'runtime'`（按需注入,不常驻）
- [ ] 验证：`pnpm --filter extension build` 出 `.output/chrome-mv3`；`pnpm --filter extension typecheck` 绿
- [ ] Commit `feat(extension): wxt scaffold with all entrypoint stubs`

### Task 2: 契约层 types + messages（TDD）

**Files:** Create: `src/lib/types.ts` `src/lib/messages.ts`；Test: `tests/lib/messages.test.ts`

- [ ] 失败测试：`isRpcRequest` 接受合法消息/拒绝缺 kind/拒绝 null；`isBroadcast` 同理（≥6 断言）
- [ ] 按上方契约实现（一字不差的字段名）；跑测试 → PASS
- [ ] Commit `feat(extension): typed rpc/event contracts`

### Task 3: ComponentStore（TDD, fake-indexeddb）

**Files:** Create: `src/lib/store/component-store.ts`；Test: `tests/lib/component-store.test.ts`

API（全部返回 Promise）：`createFromCapture(ir-meta+files) → {component, version(seq=1, author:'capture')}`；`list()`；`get(id)`；`getVersion(versionId)`；`history(componentId)`（seq 升序）；`addVersion(componentId, files, author, message)`（seq+1, parentId=当前 head, 更新 headVersionId）；`rollback(componentId, versionId)`（**新建** author:'rollback' 的版本,内容=目标版本,历史不可变）；`remove(componentId)`（级联删版本）。

- [ ] 失败测试覆盖：创建后 head=v1 / addVersion 后 seq 递增且 head 移动 / rollback 产生新 seq 而非删除 / history 顺序 / remove 级联（≥8 用例,`import 'fake-indexeddb/auto'`）
- [ ] 用 `idb` 实现（db `complift` v1：`components` keyPath id；`versions` keyPath id + index `by-component` on componentId）
- [ ] 跑测试 PASS → Commit `feat(extension): immutable version history store`

### Task 4: 样式提取器 extractor（TDD, jsdom）

**Files:** Create: `src/lib/extract/extractor.ts` `src/lib/extract/defaults.ts`；Test: `tests/lib/extractor.test.ts`

签名：`extractElement(el: Element, opts?: {maxNodes?: number}): CaptureIR`（默认 maxNodes 500）。
算法：
1. 深拷贝遍历子树（DFS）；超 maxNodes 截断并在 attrs 加 `data-complift-truncated`
2. 每元素 `getComputedStyle(el)` 与 **同 tag 默认基线** diff（`defaults.ts`: 在隐藏容器里 createElement(tag) 取默认;按 tag 缓存;只遍历 `STYLE_ALLOWLIST` ≈ 70 个高价值属性：布局/盒模型/字体/颜色/背景/边框/阴影/flex/grid/transform 等,排除继承值等于父元素已记录值的属性）
3. 清洗 attrs：丢 `on*`、`style`、`class` 保留为 `data-original-class`；`img[src]`/`a[href]`/`background-image url()` 经 `new URL(v, baseUrl)` 绝对化
4. 丢弃节点：`script,noscript,iframe,object,embed,link,meta`；注释丢弃；`svg` 子树原样保留（attrs 不做 style diff）
5. 输出可 `structuredClone` 的纯数据

- [ ] 失败测试（jsdom 的 getComputedStyle 有限,测试聚焦结构与清洗）：① 丢 onclick/script 子节点 ② img src 绝对化 ③ class → data-original-class ④ maxNodes 截断标记 ⑤ 文本节点保序 ⑥ svg 保留（≥6 用例）
- [ ] 实现 → PASS → Commit `feat(extension): deterministic element extractor`

### Task 5: TSX/CSS 生成器 generator（TDD,本计划核心纯逻辑）

**Files:** Create: `src/lib/generate/generator.ts` `src/lib/generate/naming.ts`；Test: `tests/lib/generator.test.ts`

签名：`generate(ir: CaptureIR, hint?: {name?: string}): GeneratedFiles`。规则（**确定性**,同输入必同输出）：
1. 类名：DFS 序分配 `cl-1, cl-2…`；**styles 完全相同的节点共享类**（serialize styles → map key）
2. CSS：`.cl-N { prop: value; … }` 按分配序输出;根节点额外 `display:block` 不强加
3. TSX：
   ```tsx
   import './ComponentName.css';

   export function ComponentName() {
     return (
       <div className="cl-1">…</div>
     );
   }
   export default ComponentName;
   ```
   attr 映射：`class`→className（= 分配的 cl-N,丢 data-original-class）、`for`→htmlFor、svg 属性 camelCase（内置 ~30 个常用映射表 stroke-width→strokeWidth 等）、布尔属性 `disabled` → `disabled`、void 元素自闭合、文本转义 `{'{'}` 等特殊字符
4. 组件名：hint.name > `naming.ts` 推断（IR 根 tag + 首个有意义 class/aria-label/pageTitle 词,PascalCase,非法字符剔除,兜底 `ClonedComponent`）
5. 输出 prettier 风格 2-space 缩进（手写 printer,不引依赖）

- [ ] 失败测试：① 单 div+styles → 精确 tsx/css 字符串断言 ② 相同 styles 两节点共享类 ③ svg stroke-width camelCase ④ for→htmlFor ⑤ 文本含 `{}` 转义 ⑥ 确定性(同 IR 两次调用 === ) ⑦ 嵌套缩进正确（≥8 用例）
- [ ] 实现 → PASS → Commit `feat(extension): deterministic IR→TSX/CSS generator`

### Task 6: background router + chrome/mock adapter（TDD on router 纯函数）

**Files:** Create: `src/background/router.ts` `src/platform/{adapter.ts,chrome-adapter.ts,mock-adapter.ts}`；Modify: `entrypoints/background.ts`；Test: `tests/background/router.test.ts`

- [ ] `router.ts`：`createRouter(deps: { store: ComponentStore; generate; injectPicker(tabId); injectOverlay(tabId, payload); relayStatus(): boolean; broadcast(e: BroadcastEvent): void })` → `handle(req: RpcRequest): Promise<RpcResponse>`。`capture:create` 内部串 generate→store→broadcast `component:created`；`component:update/rollback` 后 broadcast `component:changed`。未知 method → `{ok:false,error:'unknown-method'}`
- [ ] 失败测试：deps 全用内存 fake（store 用真 ComponentStore + fake-indexeddb）覆盖每个 method 的成功路径 + 未知 method + update 触发 broadcast（≥9 用例）
- [ ] `chrome-adapter.ts`：`rpc` = `chrome.runtime.sendMessage`（带超时 reject）；`onEvent` = `chrome.runtime.onMessage` 过滤 isBroadcast；`sandboxUrl` = `chrome.runtime.getURL('sandbox.html')`。`mock-adapter.ts`：fixtures（≥3 组件,含多版本）+ 内存 router 直连
- [ ] `entrypoints/background.ts`：onMessage → router.handle；`picker:start` 用 `chrome.scripting.executeScript` 注入 content；action click → `chrome.sidePanel.open`
- [ ] `pnpm --filter extension build` + 测试绿 → Commit `feat(extension): background rpc router + platform adapters`

### Task 7: 选取层 picker content script

**Files:** Create: `src/picker/picker-ui.ts`；Modify: `entrypoints/picker.content.ts`；Test: `tests/picker/picker-ui.test.ts`

- [ ] `picker-ui.ts`（可测纯 DOM 类）：`startPicker(doc, { onPick(el), onCancel })` → 挂 shadow-root host（`position:fixed;z-index:2147483647;pointer-events:none`）内含高亮框 + tooltip（tag/class/尺寸）+ 面包屑条（pointer-events:auto）。`mousemove`（capture, rAF 节流）移动高亮；`click`（capture+preventDefault+stopPropagation）锁定 → 面包屑显示祖先链（最多 6 级）可点选父/子 → 「确认」调 onPick；ESC → onCancel；`dispose()` 清干净
- [ ] 失败测试（jsdom + 手动 dispatchEvent）：① mousemove 后高亮框跟随目标 rect ② click 阻止页面默认且进入锁定 ③ ESC 调 onCancel 且 DOM 清理 ④ 面包屑点父级换目标（≥4 用例）
- [ ] `picker.content.ts`：收 `picker:start`（或注入即启动）→ startPicker → onPick: `extractElement` + 计算 sourceSelector（id 优先,否则 nth-of-type 路径）→ sendMessage `capture:create` → 成功后 toast「已 clone → 打开 side panel」
- [ ] 测试绿 + build 绿 → Commit `feat(extension): element picker with breadcrumb`

### Task 8: sandbox 实时预览管线

**Files:** Create: `entrypoints/sandbox/main.ts` `src/lib/sandbox-protocol.ts`；Test: `tests/lib/sandbox-protocol.test.ts`

- [ ] `sandbox-protocol.ts`：宿主侧 `createSandboxClient(iframe): { render(tsx, css): Promise<RenderResult> }`（id 关联 + 15s 超时 + 连发取消旧请求）；guard 函数。失败测试：id 关联/超时 reject/乱序响应忽略（≥4 用例,iframe 用 fake postMessage 双端模拟）
- [ ] `sandbox/main.ts`：启动即 `esbuild.initialize({ wasmURL: './esbuild.wasm' })`（wasm 文件经 wxt `publicDir` 进包）；收 `complift:render` → esbuild `build`：stdin=tsx,plugin 虚拟解析 `./X.css`（注入 `<style>`）与 `react`/`react-dom/client` → 映射到 sandbox 预打包的真模块（sandbox 入口 import 并挂到全局,esbuild external+banner 桥接）→ `new Function` 执行 IIFE → `createRoot(#root).render(<Component/>)` → 回报尺寸（ResizeObserver #root）；编译/运行错误 → `{ok:false,error}` 渲染错误面板
- [ ] 手动冒烟（任务 12 的 preview harness 或 build 后真浏览器）记录在 PR notes；单测只覆盖协议层
- [ ] Commit `feat(extension): esbuild-wasm sandbox live preview`

### Task 9: Drafting Bench 工作台 UI

**Files:** Create: `src/ui/{Workbench,Filmstrip,Stage,CodeTab,HistoryTab,StatusBar}.tsx` `src/ui/store.ts` `src/ui/tokens.css`；Modify: `entrypoints/sidepanel/main.tsx`；Test: `tests/ui/workbench.test.tsx`

- [ ] `store.ts`（zustand）：`{ components, currentId, currentVersion, state: 'normal'|'empty'|'loading'|'error', relayConnected, load(adapter), select(id), saveCode(tsx,css), rollback(versionId) }`——**adapter 经 props/context 注入,组件零 chrome 依赖**
- [ ] 视觉按 mockup-3 tokens（tokens.css 引方向卡色板;IBM Plex 本地栈）：Filmstrip（横向胶片条,12+ 可滚动,选中钴蓝框）/ Stage（网格纸底 + 居中 sandbox iframe + 顶部宽度标注 + 左侧高度标注 + 工具沿: overlay opacity 滑杆/difference 切换/「Overlay on page」「Open window」按钮）/ Inspector（Code|History 两 tab）/ StatusBar（relay 圆点 + MCP :8765 + 版本号）
- [ ] `CodeTab`：@uiw/react-codemirror（javascript({jsx:true,typescript:true})）双文件切换（TSX/CSS），cmd/ctrl+S 或「Save as v(N+1)」→ `component:update`(author manual)；`HistoryTab`：版本时间轴（seq/author 徽标/message/时间）+「查看」（Stage 渲染旧版,只读提示）+「回滚到此」→ `component:rollback`
- [ ] 事件接线：`component:changed/created` → 刷新当前组件 + Stage 重渲染（= 实时热更：agent 改码即重渲）；`relay:status` → StatusBar
- [ ] 失败测试（@testing-library/react + mock-adapter）：① empty 态文案 ② fixtures 加载后 Filmstrip 条数 ③ 切组件 Stage props 变化 ④ History 条目数与回滚调用 ⑤ Save 触发 update RPC（≥5 用例;sandbox iframe 在测试里 stub 成记录 props 的占位）
- [ ] 测试+build 绿 → Commit `feat(extension): drafting-bench workbench ui`

### Task 10: 覆盖对比 overlay + 独立预览窗

**Files:** Create: `src/overlay/overlay-ui.ts` `entrypoints/standalone/main.tsx`；Modify: `entrypoints/overlay.content.ts` `src/background/router.ts`(注入接线)；Test: `tests/overlay/overlay-ui.test.ts`

- [ ] `overlay-ui.ts`：`showOverlay(doc, { selector, sandboxUrl, opacity, mode })` → 查 `selector` 定位原元素 rect → 注入绝对定位容器（iframe src=sandboxUrl,尺寸=rect,`pointer-events:none`）+ 控制浮条（opacity input range / mode 切换 / 关闭）；`mode:'difference'` 给 iframe 容器 `mix-blend-mode:difference`；scroll/resize 监听重定位；`hideOverlay()` 全清
- [ ] 失败测试：定位尺寸=目标 rect / opacity 应用 / hide 清理 / selector 失配返回 error（≥4 用例）
- [ ] `overlay.content.ts`：收 `overlay:show`（含组件当前版本 files,由 background 附带）→ showOverlay 后向 iframe `complift:render`；`standalone/main.tsx`：读 `?componentId=` → adapter 取版本 → 视口预设条（375/768/1024/1440/Fit）+ sandbox iframe + 监听 `component:changed` 热更
- [ ] Stage 工具沿两个按钮接通（`overlay:show` 带当前 tab;`chrome.windows.create` 开 standalone）
- [ ] 测试+build 绿 → Commit `feat(extension): on-page overlay compare + standalone preview window`

### Task 11: relay + MCP server（TDD）

**Files:** Create: `packages/relay/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/hub.ts,src/mcp.ts}`；Test: `tests/hub.test.ts` `tests/mcp.test.ts`；Modify: `packages/extension/src/background/relay-client.ts` + background 接线

- [ ] `hub.ts`：`createHub(port)` → ws server 绑 `127.0.0.1`;接受一条 extension 连接（新连顶旧连）；`request(method, params): Promise<unknown>`（id 关联,10s 超时,未连接 reject `extension-not-connected`）。失败测试（真 ws 回环,模拟 extension 端）：连接握手 / 请求往返 / 超时 / 未连接报错 / 顶替旧连接（≥5 用例）
- [ ] `mcp.ts`：`@modelcontextprotocol/sdk` McpServer(stdio)。tools（zod schema,description 写给 agent 看）：
  `complift_list_components()` / `complift_get_component({componentId, versionId?})` / `complift_get_history({componentId})` / `complift_update_component({componentId, tsx, css, message})`（→ `component:update` author:'agent'）/ `complift_rollback({componentId, versionId})`。全部转 `hub.request`,extension 未连返回 isError + 指引文案。失败测试：用内存 fake hub 验证 5 工具的参数透传与错误包装（≥5 用例）
- [ ] `index.ts`：`complift-relay` bin = 同进程起 hub(8765/COMPLIFT_PORT) + MCP stdio;stderr 打日志（stdout 留给 MCP）
- [ ] `relay-client.ts`（extension 侧）：background 启动即连 `ws://127.0.0.1:8765`,指数退避重连（1s→30s cap）,连接状态变化 broadcast `relay:status`;收 `relay:rpc` → router.handle → 回 `ext:rpc-result`
- [ ] `pnpm --filter relay test` 绿 + extension build 绿 → Commit `feat(relay): local ws hub + mcp server for agent access`

### Task 12: 集成验证 + 开发文档

**Files:** Create: `docs/dev/loading.md` `README.md`；Modify: 修复集成中发现的问题

- [ ] 全仓 `pnpm test` + `pnpm typecheck` + `pnpm build` 三绿（输出贴进 commit body）
- [ ] 真浏览器冒烟（能自动则用 playwriter/agent-browser,不能则在 loading.md 写人工 checklist）：load unpacked `.output/chrome-mv3` → 任意页面点 action → picker 高亮选取 → side panel 出现组件 + Stage 渲染 → Code 改字号保存 → Stage 热更 + History 多一条 → 起 `pnpm --filter relay exec complift-relay` → StatusBar 变绿 → `claude mcp add complift -- node packages/relay/dist/index.js` 后 agent 调 `complift_update_component` → 工作台实时变化
- [ ] `README.md`：定位/三包结构/快速开始/MCP 接入示例（claude mcp add）/已知边界（跨域 iframe、canvas、动画不捕获）
- [ ] Commit `docs: dev loading guide + readme` → 汇报

---

## Self-Review 结论

- 设计文档 §1 MVP in-scope 逐项对照：选取层(T7)/提取(T4)/生成(T5)/实时预览(T8,T9)/覆盖对比(T10)/历史回滚(T3,T9)/relay+MCP(T11)/独立窗(T10)/导出复制(T9 CodeTab 自带可复制;显式按钮并入 T9 工具沿)——✅ 全覆盖
- 类型一致性：RpcMap 字段与 router/store/mcp 各任务引用名一致（component:update / capture:create …）✅
- 无 TBD/占位 ✅（UI 像素细节授权 mockup-3 为准源,非占位）
- preview 包(设计文档 §5 reuse plan)：用户已明示「不管部署/设计」,mock-adapter(T6) 已保证组件可脱离 chrome 运行,独立 preview 站点延后——记录为有意裁剪,非遗漏
```
