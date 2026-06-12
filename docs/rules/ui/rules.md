# ui 规则

- **UI-1 token 单一来源**：视觉取值以 mockup-3 **Drafting Bench / 制图台** 为唯一来源，落地为 CSS 变量（实现阶段建 `tokens.css`，extension 与 preview 共用同一份）。组件样式只引用变量，**禁止散写 hex / 裸字体名**。基础 token：

  | token | 值 | 用途 |
  |---|---|---|
  | `--paper` | `#F7F5F0` | 纸白 · 背景基底 |
  | `--ink` | `#21211D` | 墨黑 · 文字/线稿 |
  | `--blueprint` | `#1E4FD8` | 钴蓝 · **静态/基线** |
  | `--safety` | `#E8743B` | 安全橙 · **变化** |
  | 字栈 | IBM Plex（Sans / Mono） | UI 文本 / 代码与刻度 |

- **UI-2 颜色语义不可混用**：钴蓝只表达"静态/基线"（原元素基线、刻度、稳定状态）；安全橙只表达"变化"（diff、新版本、agent 活动、对比差异、error 注记）。不得用橙做普通强调色、不得用蓝标记变化——语义错位即返工，这是产品"对比工具"心智的根基。
- **UI-3 token 变更走设计流程**：新增 / 修改 token 不在实现 PR 里顺手做；先经设计走查（director-design 流程）确认后更新 tokens.css + 本表。一次性的"差不多颜色"需求一律映射到现有 token。
