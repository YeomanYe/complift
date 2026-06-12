# engineering-rules — director-architect Land 报告

- task_id: 2026-06-12-complift-eng-rules
- slot: engineering-rules
- phase: land（Approval Gate 由上游继承——用户已显式委托"按最推荐的实现"，design.md:4 留痕）
- 日期: 2026-06-12

## 1. Research 摘要

### 现状盘点（Step 1）

Greenfield：项目无任何规则文档。现有文件仅 `docs/design.md`、`docs/prep-brief.md`（均为只读输入）、`preview/`（mockup 静态页）、`.github/workflows/deploy-pages.yml`、`.agent/jobs/`（mockup 产物）。无 CONTRIBUTING.md / AGENTS.md / RULE.md / package.json。

### 技术栈识别（Step 2，上游已锁定，design.md §4/§8 为硬输入）

`["pnpm-monorepo", "typescript", "react19", "vite", "wxt(chrome-mv3)", "vitest", "node-relay", "mcp", "esbuild-wasm-sandbox"]`

### 联合评估匹配（Step 3-4）

| skill | 来源 | 采纳情况 |
|---|---|---|
| `react-best-practices` | ~/.claude/skills/react-best-practices | 采纳通用 React 项（派生值不进 effect、effect 仅外部副作用 → COD-3）；Next.js/RSC/数据获取部分**不适用**（本项目无 Next、无服务端渲染） |
| `test-driven-development` | ~/.claude/skills/_obra-superpowers__skills__test-driven-development | 上游硬约束，全量采纳 → TST-2（先失败测试、bugfix 先复现） |
| `developing-preact` | 本地存在 | **不采纳**——项目是 React 19 非 Preact，硬套属误配 |
| stack-checklist（skill 自带） | references/stack-checklist.md | Monorepo 条目 → ARC-2/3；TypeScript 条目 → COD-1/2；React 条目部分适用 |

**显式缺口（stack-checklist 未覆盖栈，规则由 design.md 硬约束手写）**：
- Chrome MV3 / WXT 扩展（→ 手写 SEC-3 权限最小化、SEC-4 sandbox CSP、ARC-5 entrypoints 约定）
- esbuild-wasm 扩展内编译（→ 手写 SEC-4）
- MCP / relay 本地服务（→ 手写 SEC-1/2/5、TST-5 接口测试）
- 本地无 Chrome extension / MCP 专项 best-practice skill，建议后续如有再回评一轮（不阻塞）。

## 2. 落地结构（rules_structure_diff）

全部为新增，无迁移/删除（greenfield）：

```
CONTRIBUTING.md                      人类入口：环境、命令约定、工作流、commit/分支、PR checklist、规则地图
AGENTS.md                            agent 常驻规则：10 条必守 + 路由表 + 仓库地标
docs/rules/index.md                  分域索引（5 域 + 规则变更流程）
docs/rules/architecture/{index,rules}.md   ARC-1~8：包布局/依赖方向/workspace 协议/pnpm 唯一 + 适配器边界 4 条
docs/rules/coding/{index,rules}.md         COD-1~6：TS strict/类型归属/React 19/命名/新依赖门槛/lint 单一事实源
docs/rules/testing/{index,rules}.md        TST-1~6：Vitest 唯一/TDD 硬序/组织/mock 边界=adapter 边界/转换 fixture 快照/合并门槛
docs/rules/security/{index,rules}.md       SEC-1~5：relay loopback/放开=批准/manifest 最小权限/sandbox 编译/数据本地化
docs/rules/ui/{index,rules}.md             UI-1~3：Drafting Bench token 表/蓝橙语义不可混/token 变更走设计流程
```

14 文件（含本报告）。每条规则带编号可在 review 中引用；含校验命令的条目：ARC-4/5、SEC-1、TST-6、CONTRIBUTING PR checklist。

## 3. 决策记录（冲突自决，强制留痕）

| # | 冲突/权衡 | 备选 | 选定 | 理由 |
|---|---|---|---|---|
| D1 | testing 独立分域 vs 并入 coding | 合入 coding（文件更少） | **独立 testing 域** | TDD 是上游锁定硬纪律，"写测试"是高频独立场景，必须 30 秒可路由；合入会被代码风格条目淹没 |
| D2 | 适配器边界独立分域 vs 归 architecture | 独立 adapter 域 | **归 architecture（ARC-5~8）** | 它本质是依赖方向规则的延伸；独立域会造成"architecture 和 adapter 都要翻"的双开销。可发现性由 AGENTS.md 规则 3/4 直接点名补足 |
| D3 | skill 默认 `ai-guide` 域 | 建 docs/rules/ai-guide/ | **不建，AGENTS.md 即 agent 入口** | 同时存在 AGENTS.md 与 ai-guide 域 = 双轨规则入口（skill 红线）；MEMORY 显示用户生态以 AGENTS.md 为 agent 约定落点 |
| D4 | commit/分支规范放哪 | 独立 workflow 域 | **CONTRIBUTING（人）+ AGENTS 第 6 条（agent 摘要）** | 工作流是入口文档属性，没人会去 docs/rules/workflow/ 找 commit 格式 |
| D5 | react-best-practices 与本项目栈错位 | 全量照搬 | **只取通用 React 项，RSC/Next 部分标不适用** | 该 skill 是 Vercel/Next 向；扩展无服务端，照搬会产生大量死规则 |
| D6 | lint/format 工具未被上游锁定 | 不写（留空）/ 锁死 | **COD-6 给默认（Prettier + typescript-eslint）并显式标注"换工具改本条即可，不算决策变更"** | 完全留空会导致三个包各自为政；锁死又越权（上游未锁）。中间态：定默认、降级变更成本 |
| D7 | `<all_urls>` host 权限 | 直接允许（产品要任意网页选取）/ 直接禁止 | **SEC-3：优先 activeTab+scripting，确需 `<all_urls>` 先在 design.md 留痕** | 产品需求可能成立但属权限决策，留痕后放行而非规则里预批 |
| D8 | packages/shared 预建 | 现在建 | **ARC-2：出现第二处共享需求再抽** | greenfield 预建空壳包是典型过度结构 |

## 4. 与硬约束的一致性核对

- pnpm only → ARC-4、AGENTS-1、CONTRIBUTING 环境段 ✅
- 三包 monorepo → ARC-1 ✅（与 design.md:40 一致）
- Vitest + TDD → TST-1/2 ✅
- PlatformAdapter / 禁 PREVIEW_MODE → ARC-5~8、AGENTS-3/4 ✅（与 prep-brief.md:73,85 一致）
- Drafting Bench token（#F7F5F0/#21211D/#1E4FD8/#E8743B + IBM Plex）→ UI-1/2 ✅（与 design.md:53、preview-mockup-3/meta.json 一致）
- conventional commits → CONTRIBUTING 工作流 3、AGENTS-6 ✅
- relay 只绑 127.0.0.1 → SEC-1/2、AGENTS-5 ✅
- 未生成任何 package.json/tsconfig 等工程文件 ✅（规则中以"实现阶段落地"标注）
- 未触碰 forbidden 路径（packages/** preview/** src/** .github/** docs/design.md docs/prep-brief.md）✅；工作区另有 `preview/index.html` 改动与 `.github/` 未跟踪项，属其他 slot，未触碰。

## 5. 可读性 dry-run

以"半年后新工程师要改 relay 端口"自测：CONTRIBUTING 规则地图 → security → SEC-1/2，两跳 <30 秒。以"agent 要写组件样式"自测：AGENTS 路由表 → ui/rules.md token 表，一跳。全部相对链接经脚本校验可解析（0 broken）。

## 6. Audit 评分（references/audit-rubric.md 7 维基线 + 本 skill 增维）

- 维度1 scope：5（规则体系从零扫齐，输入文档全读，引用 design.md/prep-brief/meta.json ≥10 处）
- 维度3 决策证据：5（每条硬规则锚定 design.md/prep-brief 行级来源；决策表 8 条含备选+理由）
- 维度4 可执行性：5（每文件 add 含理由；规则含校验命令）
- 维度8 联合评估广度：4（覆盖本地全部相关 skill；MV3/MCP 无本地 skill，已显式标缺口而非硬套）
- 维度9 参考项目对齐：n/a（无 reference_project）
- 维度10 与现规则一致性：5（greenfield 无冲突；唯一入口、无双轨）
- **aggregate ≈ 4.8 → verdict: ready-to-land（已落地）**

```json
{
  "verdict": "ready-to-land",
  "aggregate": 4.8,
  "must_fix": [],
  "should_fix": ["MVP 实现期若装入 Chrome-extension/MCP 专项 best-practice skill，回评 security/testing 两域一轮"],
  "artifact_path": ".agent/jobs/engineering-rules/output.md",
  "rules_structure_diff": "新增 13 个规范文件（2 入口 + docs/rules 5 域 ×(index+rules) + 总索引），0 迁移 0 删除",
  "affected_domains": ["architecture", "coding", "testing", "security", "ui"],
  "migration_count": 0,
  "phase": "land"
}
```
