# complift 工作台 UI — 3 个设计方向卡（variants）

> director-design `mode=variants` 产出 · task_id: 2026-06-12-complift-design-variants · 2026-06-12
> 范围：Side Panel 工作台（S2）+ 独立预览窗（S3）。只出方向卡，不含代码 / mockup。
> evidence: brief-only（绿地项目，无既有 UI 截图可采；唯一输入 = docs/prep-brief.md "Main Interaction Design" 一节）
> design_tokens_source: none（新项目尚未建立 token，三方向各自给出建 token 的起点）

## 任务理解

complift = "网页元素 → React 组件 clone" 的开发者工具。主界面是 **Chrome side panel**（典型宽度
360–500px，窄而高），含：左组件列表 + 右 4 tab（Preview / Code / History / Compare）+ 顶部状态条
（agent connected/disconnected + 提取状态），外加独立预览窗（375/768/1024/1440 视口预设）。
要求开发者工具质感、高信息密度，normal / empty / loading / error 四态 + agent 连接维度全覆盖。

**窄面板是第一设计约束**：brief 里"左列表 + 右 tabs"在 400px 宽度下不可能并排常驻——
三个方向各自给出一种对这个矛盾的不同解法，这正是布局差异化的来源。

**画像模拟**（variants 深度指引：3 种用户第一眼反应）：

- **P1 硬核前端**（住在 DevTools / 终端里）：要"像 Chrome 自带的面板"，密度最大、零学习成本，讨厌品牌感装饰
- **P2 设计工程师**（Linear / Vercel / Raycast 审美）：要"像一个被认真做过的产品"，第一眼气质分很重要
- **P3 AI-agent 工作流开发者**：盯的是"agent 正在改我的组件"的实时反馈与版本轨迹，状态可视化 > 一切

---

## 方向 1 — Panel Native「面板原生」

| 字段 | 内容 |
|---|---|
| **slot** | 1 |
| **style_name** | Panel Native / 面板原生（DevTools 同族 · Functional Brutalism）`安静` |
| **color_direction** | 近白底 `#FBFBFB` + 近黑文字 `#1A1A1A` + 1px 发丝灰线 `#E0E0E0` 分割；**唯一 accent = DevTools 蓝 `#1A73E8`**（选中态/链接/主按钮）；语义色直接借 Chrome 原生：错误红 `#D93025`、警告琥珀 `#E37400`、连接绿 `#188038`。提供跟随浏览器主题的暗色镜像（中性深灰，非蓝黑） |
| **font_combo** | `system-ui` 系统字栈（SF Pro / Segoe，UI 层，12–13px 为主力字号）+ `ui-monospace`（SF Mono / Consolas：类名、尺寸、版本号、diff、一切数据值）。**零 webfont**，面板秒开 |
| **layout_strategy** | **单列钻取（master ⇄ detail）**：列表页 = 高密度文本行（组件名 + 来源域名 + 版本数 + 相对时间，**无缩略图**，行高 ~28px，一屏 20+ 行）；点击行 → 整面板切到详情页，顶部 24px 紧凑条 = 返回箭头 + 组件名面包屑 + agent 状态点；其下一行下划线式 4 tab（Preview/Code/History/Compare）。全平面、直角（0–2px 圆角）、无阴影无卡片，全部用 1px 线分区 |
| **key_visual** | "像 Chrome 出厂自带的 Elements 旁边那块新面板"：发丝线分割的高密度等宽字数据行 + 24px 状态条上一颗绿点 `agent ●` ——克制到没有任何一个像素在自我表现 |
| **tradeoff** | P1 五星（零学习成本、密度天花板）；P2 会嫌"没有产品人格，截图发不了 Twitter"；无缩略图牺牲列表的视觉识别速度（靠域名+命名补偿）。钻取式导航比并排多一次点击。对"像素级对比"这一卖点的舞台感呈现最弱——Compare 只是四个 tab 之一 |

- **四态与 agent 状态**：empty = 居中两行字 + 快捷键提示（"点击工具栏图标开始选取 ⌘⇧K"），无插画；loading = 状态条下 2px 不确定进度条 + 文本行骨架；error = 列表内红底 banner 行（原因 + `重试` 文字链，DevTools console 报错样式）；agent 断连 = 状态点变空心灰 `○ disconnected`，连上 = 实心绿 + 一次性 toast 行。一切状态都是"行"，不弹 modal
- **独立预览窗（S3）**：同样无装饰——顶部细工具条放 375/768/1024/1440 纯文字 tab + 当前版本号，画布纯白直接渲染组件
- **锚点参考**：Chrome DevTools 面板语言；huashu 风格库「功能主义网格社区 Functional Brutalism」（Are.na / Lobsters，系统字栈+发丝灰线+信息密度优先，纯 CSS 还原 98%）+「Swiss 极致黑白」的直角锐利
- **token 起点**：spacing 4px 基；字号 11/12/13/15 四档；色板 ≤ 8 个变量

---

## 方向 2 — Quiet Ops Console「静默操作台」

| 字段 | 内容 |
|---|---|
| **slot** | 2 |
| **style_name** | Quiet Ops Console / 静默操作台（Linear-look 暗色分层 · 组件即主角）`中性` |
| **color_direction** | 近黑分层底：底板 `#08090A` → 浮层 `#101113` → 悬浮 `#17181C`（用表面层级代替线框）；暖白文字 `#EDEDEF` + 板岩次级字 `#8A8F98`；**accent = 去饱和蓝紫 `#5E6AD2`**（Linear 系，仅用于 agent 活动与选中态）；成功青 `#4CB782`、错误柔红 `#EB5757`。**明确避开禁区**：不用 `#0D1117` 蓝黑底，不做通用青紫霓虹 glow——微光只在"agent 正在写入"这一刻出现（有意图的暗色） |
| **font_combo** | Inter（UI 层，负字距 -0.01em，13px 主力）+ JetBrains Mono（Code tab、版本 hash、尺寸标注）。数字 `tabular-nums` |
| **layout_strategy** | **当前组件优先（focus + switcher），列表不占常驻宽度**：面板头部 = 组件切换器（点击展开 ⌘K 式命令面板浮层：搜索框 + 带 48px 实时缩略图的组件列表）；头部右侧 = agent 状态胶囊（`● Agent` 呼吸微光）。其下分段控件式 4 tab，主体整宽留给当前 tab 内容。History 在 agent 写入新版本时 tab 上跳出紫点 badge。卡片 6–8px 圆角、低对比 1px 内描边 |
| **key_visual** | "深色操作台上，唯一的光属于正在被 agent 改写的组件"：⌘K 切换器浮层里一排实时渲染缩略图 + 头部那颗随写入脉动的蓝紫胶囊——产品气质一眼对齐 Linear / Cursor 工作流工具 |
| **tradeoff** | P2/P3 五星（气质 + agent 反馈都到位）；P1 会抱怨"列表藏在浮层里，扫一眼全局要多按一次 ⌘K"。暗色面板贴着浅色网页时边界突兀（Compare overlay 场景常见）；实时缩略图有渲染成本（需懒加载/快照缓存）；分层暗色对 token 纪律要求高，做塌了就掉进"generic dark dashboard" |

- **四态与 agent 状态**：empty = 居中一段引导 + 唯一一颗蓝紫主按钮（"选取第一个元素"），无插画无 emoji；loading = 表面层 shimmer 骨架（缩略图位 + 代码行位）；error = tab 内容区顶端嵌入式错误条（柔红底 10% 透明度 + 原因 + 重试按钮），提取失败/编译失败共用同一组件；agent connected = 胶囊实心 + 缓慢呼吸光，disconnected = 胶囊降为灰描边 + 文案"本地 relay 未连接 → 查看接入指引"。agent 每写一个版本：History badge 脉冲一次（事件可感知但不打断） |
- **独立预览窗（S3）**：深色舞台——组件渲染在中央浮起的亮色画布上（投影分离），顶部分段控件切视口，版本号 + agent 状态沿用胶囊语言
- **锚点参考**：huashu 风格库「Linear 暗色发光+Bento Glassmorphism」（Linear / Cursor，'The Linear Look'，还原 85%）+「终端核软未来」（Cursor，炭黑×暖白）的克制版；命令面板交互 = Raycast / Linear ⌘K 惯例
- **token 起点**：surface 三层变量；accent 单一；radius 6/8；motion 120–200ms ease-out 全局统一

---

## 方向 3 — Drafting Bench「制图台」

| 字段 | 内容 |
|---|---|
| **slot** | 3 |
| **style_name** | Drafting Bench / 制图台（工程蓝图 · 视觉对比为 C 位）`大胆` |
| **color_direction** | 暖纸白底 `#F7F5F0` + 极淡制图网格线 `#E8E4D9`（仅 stage 区有网格）+ 近黑墨字 `#21211D`；**双 accent 各司其职**：结构蓝图钴蓝 `#1E4FD8`（选中/标尺/尺寸标注/链接）+ 安全橙 `#E8743B`（**专属于变化**：agent 活动、diff 增改、error 注记）。蓝 = 静态结构，橙 = 正在发生的事，色彩本身承载信息层级 |
| **font_combo** | IBM Plex Sans（UI/标注，工程制图血统）+ IBM Plex Mono（代码、坐标、尺寸值）；标注小字 11px 全大写宽字距（图纸注记味） |
| **layout_strategy** | **stage + inspector 垂直分屏（Preview 不再是 tab，是常驻舞台）**：面板上 40–45% = 制图纸 stage，当前组件永远渲染在网格纸上，四周环绕尺寸刻度线 + 宽×高标注，**Compare 的透明度滑杆/onion-skin 开关就嵌在 stage 工具沿上**（对比是常驻能力而非第四个 tab）；下 55–60% = inspector 区，tab 收为 Code / History 两个；组件切换 = stage 顶上一条横向缩略图 filmstrip（胶片条，左右滚动）。版本历史在 inspector 里呈现为带刻度的时间轴轨 |
| **key_visual** | "组件被钉在绘图纸上度量"：网格纸 stage + 环绕的尺寸刻度与标注 + 像绘图仪走针一样亮起的橙色 agent 指示——把"像素级对比"这个核心卖点直接做成产品的脸 |
| **tradeoff** | P3 五星（视觉比对 + 版本时间轴都在 C 位），评审/对比场景无敌；P1 会嫌"stage 常驻偷走我 40% 垂直空间，Code 编辑区太矮"（需给 stage 折叠快捷键兜底）；亮色纸底贴暗色网站时刺眼（无暗色镜像，是单皮肤方向）；网格+刻度装饰一旦过量就喧宾夺主，对克制力要求最高；与方向 1/2 相比工程实现量最大（标尺/刻度/胶片条都是自绘组件） |

- **四态与 agent 状态**：empty = stage 上一个虚线裁切框 + 角标注记"NO COMPONENT ON STAGE — 去页面选取一个元素"（图纸空版框语言）；loading = stage 网格上扫描线动画 + 刻度逐段点亮，inspector 出骨架行；error = 一张安全橙描边的"注记卡"盖在 stage 上（原因 + 重试 + 查看原始 HTML），像图纸上的红批注；agent connected = 头部"PLOTTER: ONLINE"橙色指示 + 写入时 stage 边缘橙色走针动效，每个新版本在时间轴轨上落一个编号刻度，回滚 = 在轨上新增指回旧刻度的标记（呼应 brief 的不可变历史语义） |
- **独立预览窗（S3）**：整窗就是一张大绘图纸——四边标尺、组件四周尺寸标注、375/768/1024/1440 做成纸面上的"印刷页签"，视口切换 = 换图幅 |
- **锚点参考**：工程制图/蓝图视觉传统 + Tufte「断言-证据」数据墨水比（注记直接贴在对象旁，零 chartjunk）+ huashu 风格库「媒体级粗野主义」的 1px 规则线高密度排版基因；字体锚 IBM Plex 工程谱系。库中无现成同款——按风格库自身定位（"弹药不是清单，好设计从真实需求长出来"），由产品核心动作（度量、比对、批注）反推出的原生方向 |
| **token 起点** | 双 accent 语义表（蓝=结构 / 橙=变化）先行；网格 8px 基；注记字号 11px 单独成档 |

---

## 差异化矩阵（红线自查：任意两两 ≥ 2 维不同 — 实际 4 维全不同）

| 维度 | 方向 1 Panel Native | 方向 2 Quiet Ops Console | 方向 3 Drafting Bench |
|---|---|---|---|
| **布局** | 单列钻取 list ⇄ detail，全 tab 化 | 单组件聚焦 + ⌘K 切换浮层 | stage 常驻 + inspector 分屏，Compare 出 tab |
| **信息层级** | 列表/代码优先，Preview 是 tab 之一 | 当前组件优先，agent 事件次之 | 视觉对比优先，Code/History 退居 inspector |
| **风格** | 亮色系统原生扁平，发丝线，直角 | 暗色三层表面，微光只给 agent 活动 | 暖纸蓝图，网格+刻度+注记 |
| **主色** | 灰阶 + 单 accent DevTools 蓝 | 近黑 + 去饱和蓝紫 | 纸白 + 钴蓝/安全橙双 accent |
| **温度** | 安静 | 中性 | 大胆 |
| **第一拥护者** | P1 硬核前端 | P2 设计工程师 / P3 | P3 agent 工作流 / 评审场景 |

## 推荐与取舍说明

- **要最快上手最稳妥** → 方向 1（实现成本最低、与 Chrome 环境零违和，但无品牌记忆点）
- **要产品气质与 agent 工作流叙事** → 方向 2（对外展示最好看，列表可达性让一步）
- **要把"像素级对比"做成差异化卖点** → 方向 3（最有记忆点也最冒险，工程量最大）
- 三方向均不依赖 LLM/生图素材，纯 CSS/DOM 可达（方向 3 的标尺/刻度为自绘 SVG/DOM）

## 委派情况与遵循原则（可追溯）

- **自做**：mode 判定、Q gate（payload 齐全未追问）、brief 研读、三方向构思与差异化校验、本文档撰写
- **调用的设计工具**：`huashu-design` 风格库（references/design-styles.md，2026-06 v3.0）作为风格锚点与温度配比依据（只读取证，未让其产 HTML——上游硬规则禁代码/mockup）；`ui-ux-pro-max` **本机未安装，不可用**，如实标注
- **遵循的设计原则**：variants ≥2 维度真差异化（实际 4 维）；温度配比"安静/中性/大胆"各一，不三连极简；避开默认审美禁区（GitHub-dark `#0D1117`+通用霓虹、紫渐变万能公式、emoji 当图标、无品牌依据的圆角卡+左彩条）；工具型产品不套 landing page 规则（信息密度 > 留白表演）；不写代码、不替项目预设设计系统（tokens=none，各给起点）
- **证据声明**：`evidence: brief-only`——本产出为方向生成而非视觉审查，未对任何已有 UI 下视觉结论

## Next Step（给上游 flow-project-bootstrap）

1. 用户三选一（或指定杂交，如"方向 1 的密度 + 方向 3 的 stage"）
2. 选定后进入 mockup 阶段：调 `huashu-design` 出 workbench + standalone 双路由高保真 HTML（覆盖四态 + agent 两态），即 brief 的 Stage 1.3 纯视觉 mockup
3. mockup 通过后 → handoff spec（含 token 表、状态矩阵、断点）交 `director-frontend` 落地
