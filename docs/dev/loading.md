# 加载与冒烟自测 · loading.md

本地把 complift 跑起来的全流程：构建扩展 → load unpacked → 启动 relay →
把 Claude Code 接到 MCP → 一条端到端冒烟清单。面向开发者，非商店安装路径。

> 自动化说明：在 MV3 沙箱化环境里**无法可靠自动化**“load unpacked 扩展 + 打开
> side panel + 跨域 sandbox iframe 实时编译 + 另起 relay 进程 + 外部 agent 经 MCP
> 改码”这条完整链路（`chrome://extensions` 需手动开发者模式、side panel 与 opaque
> origin sandbox 无法 headless 驱动）。因此本文档提供**人工冒烟清单**，每一步都给出
> 可肉眼核对的预期现象。详见报告中的 smoke 路径说明。

## 0. 前置

- Node ≥ 20、pnpm（仓库锁定，禁 npm/yarn）
- Chrome / Chromium（支持 `chrome://extensions` 开发者模式与 Side Panel）
- 仓库根目录已 `pnpm install`

## 1. 构建扩展

```bash
pnpm --filter extension build
```

产物在 `packages/extension/.output/chrome-mv3/`（含 `manifest.json`、`sidepanel.html`、
`sandbox.html`、`standalone.html`、`esbuild.wasm` 等）。开发期也可用 `pnpm --filter
extension dev`（WXT dev server + HMR），但本冒烟流程以 build 产物为准。

## 2. load unpacked

1. Chrome 打开 `chrome://extensions`
2. 右上角打开 **Developer mode / 开发者模式**
3. 点 **Load unpacked / 加载已解压的扩展程序**
4. 选择目录 `packages/extension/.output/chrome-mv3`
5. 扩展卡片出现 “complift”，无红色报错

权限说明（来自 `wxt.config.ts`，最小化原则 SEC-3）：`sidePanel` `storage`
`scripting` `activeTab` `tabs` + `host_permissions: <all_urls>`（任意页选取元素需要）。
sandbox 页用独立 CSP 允许 `wasm-unsafe-eval`（esbuild-wasm 实时编译）。

## 3. 启动 relay（agent 接入面，可选但 MCP 步骤需要）

relay = 本地 Node 进程：WS hub（**只绑 `127.0.0.1:8765`**，SEC-2）+ MCP stdio server。

先构建，再起进程：

```bash
pnpm --filter relay build           # 产出 packages/relay/dist/
pnpm --filter relay exec complift-relay
# 等价：node packages/relay/dist/index.js
```

stderr 打印 `ws hub listening on 127.0.0.1:8765` 即就绪（stdout 留给 MCP 协议）。
端口可用 `COMPLIFT_PORT` 覆盖。扩展会主动向该 hub 拨号。

## 4. 把 Claude Code 接到 MCP

relay 的 `bin` 名是 `complift-relay`，dist 入口是 `packages/relay/dist/index.js`
（见 `packages/relay/package.json`）。在仓库根目录执行：

```bash
claude mcp add complift -- node packages/relay/dist/index.js
```

接好后 agent 可见 5 个工具：`complift_list_components`、`complift_get_component`、
`complift_get_history`、`complift_update_component`、`complift_rollback`。

> 同一个 `complift-relay` 进程既是 WS hub 又是 MCP server。用 `claude mcp add` 时
> Claude Code 会自己 spawn 它（stdio），因此**不要**同时手动再起一个 relay 抢
> 8765 端口；若你已手动起了 relay 做扩展连接观测，让 agent 连那个的方式是用
> 同一条命令——MCP server 与 hub 同进程，第二次 spawn 会因端口占用失败。开发期
> 二选一：要么手动起 relay 看连接状态，要么交给 `claude mcp add` 托管。

## 5. 端到端冒烟清单（人工）

按顺序核对，每步括号内为预期现象；任一不符即记为失败。

| # | 操作 | 预期现象 |
|---|---|---|
| 1 | 在 `chrome://extensions` load unpacked 上述目录 | 卡片出现 “complift”，无报错 |
| 2 | 打开任意普通网页，点扩展 action 图标 | 进入选取模式，页面元素 hover 时出现高亮框 + tag/尺寸 tooltip |
| 3 | 点选一个元素 | 选取层锁定该元素 |
| 4 | 打开 side panel（Drafting Bench 工作台） | 顶部胶片条出现该组件，Stage 网格纸上渲染出克隆组件 |
| 5 | 切到 Code tab，把某个 `font-size` 改大，点 Save | Stage 实时热更新（首帧 render 由 iframe `load` 把关，不靠 15s 超时兜底）；History tab 多出一个新版本 |
| 6 | 启动 relay：`pnpm --filter relay exec complift-relay` | 顶部 StatusBar 的连接圆点由灰/红转**绿**（PLOTTER: ONLINE） |
| 7 | `claude mcp add complift -- node packages/relay/dist/index.js`，让 agent 调 `complift_update_component` 改该组件 | 工作台无需刷新即实时更新（Stage 热更 + History 增版本）；若独立预览窗开着也同步热更 |
| 8 | 回看 History，点某个旧版本 → Rollback | 产生一条 rollback 新版本，Stage 渲染回滚后的内容 |
| 9 | Stage 工具沿开 “OVERLAY ON PAGE”，调透明度/Difference | 原页面上叠加克隆组件做像素对比 |
| 10 | Stage 工具沿点 “OPEN WINDOW” | 弹出独立预览窗，视口预设 375/768/1024/1440/Fit 可切；跟随最新版本热更 |

### 已知边界（冒烟时不计为缺陷）

- 跨域 iframe、`<canvas>`/WebGL、CSS 动画/伪元素**不捕获**（确定性提取范围之外）
- 不承诺 1:1 像素完美——overlay 对比工具的意义正是暴露差距
- 仅 Chrome MV3；Firefox/Safari 不在范围

## 6. 排障

- **StatusBar 一直不绿**：确认 relay 在跑且监听 `127.0.0.1:8765`；端口被占时换 `COMPLIFT_PORT` 并保持扩展侧默认或一致。
- **Stage 空白/超时**：sandbox 页需 `wasm-unsafe-eval` CSP 与 `esbuild.wasm` 资源都在产物里；重新 `pnpm --filter extension build` 再 reload 扩展。
- **agent 改码不生效**：确认 `claude mcp add` 用的是 `node packages/relay/dist/index.js`（已 `pnpm --filter relay build`），且没有第二个 relay 抢端口。
