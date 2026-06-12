# security 规则

## relay 网络面

- **SEC-1 loopback only**：relay（HTTP/MCP 与 ws）只允许绑定 `127.0.0.1`。代码中监听地址必须是字面量 `127.0.0.1`，禁止 `0.0.0.0`、空 host 默认值、或从环境变量读绑定地址。
  - 校验：`grep -rn "0\.0\.0\.0\|listen(" packages/relay/src`，所有 listen 调用显式带 `127.0.0.1`。
- **SEC-2 放开绑定 = 安全设计变更**：任何把 relay 暴露到 loopback 之外的改动（含 docker 桥接、`--host` 参数）必须先补鉴权方案 + 经用户显式批准 + 更新 design.md，再写代码。当前无鉴权的前提就是 loopback-only。

## 扩展权限

- **SEC-3 manifest 权限最小化**：`permissions` / `host_permissions` 每一项新增都要在 PR 描述写明"哪个功能需要、为什么没有更窄的替代"。优先 `activeTab` + `scripting` 按需注入；确需 `<all_urls>`（任意网页选取是产品核心，可能成立）必须在 design.md 留痕后才进 manifest。不申请"将来可能用到"的权限。

## sandbox 编译执行

- **SEC-4 动态代码只活在 sandbox**：esbuild-wasm 对用户页面派生 TSX 的编译与渲染执行，只能发生在 MV3 **sandbox 页面 / sandboxed iframe** 里，与扩展主上下文只通 `postMessage`。禁止：在 side panel / background / content script 主上下文 `eval` 或动态 `import` 生成代码；给非 sandbox 上下文的 CSP 加 `unsafe-eval` / `unsafe-inline`。sandbox → 主上下文的消息按不可信输入做校验。

## 数据本地化

- **SEC-5 数据不出本机**：捕获的 DOM / 样式 / 生成代码 / 版本历史只存本地（IndexedDB、经 relay 给本机 agent）。扩展与 relay 都不得加遥测、上报、远端持久化；新增任何外呼网络请求（除目标页面自身资源提取）= 设计变更，先批后做。
