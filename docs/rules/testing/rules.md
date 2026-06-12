# testing 规则

- **TST-1 框架唯一**：所有包用 Vitest。不引第二个 test runner（Jest / node:test 均禁）。
- **TST-2 TDD 顺序硬性**：先写失败测试 → 看它失败 → 写最小实现 → 看它通过 → 重构（superpowers:test-driven-development）。**bugfix 的第一个 commit 必须含复现该 bug 的失败测试**；没有复现测试的 bugfix PR 不收。
- **TST-3 测试组织**：测试文件与被测文件同目录、命名 `*.test.ts(x)`。fixture 数据放就近 `__fixtures__/`。一个测试只断言一个行为，描述写"行为"不写"函数名"（`it('回滚后产生指向旧内容的新版本')`，不是 `it('test rollback')`）。
- **TST-4 mock 边界 = adapter 边界**：单测不 mock 全局 `chrome.*`（那是在测 Chrome，不是测我们的代码）。被测代码依赖 `PlatformAdapter` 接口（ARC-5），测试注入 `MockPlatformAdapter` 或测试替身即可。选取层 / 真实提取 / 真实站点兼容性属于 Chrome load-unpacked 手动验证，不假装能被单测覆盖。
- **TST-5 确定性转换必须有 fixture 快照测试**：DOM→TSX+CSS 转换是产品核心且**确定性**（不调 LLM），必须建立 `输入 HTML+computed styles fixture → 期望 TSX/CSS 输出` 的快照测试集；每修一个转换 bug 就把该案例固化为新 fixture。relay 的 MCP API（list / get / update / history）同理需接口级测试。
- **TST-6 合并门槛**：`pnpm -r test` 全绿才能合并。跳过的测试（`it.skip`）必须带 issue 引用或 TODO 注释 + 负责人，不允许裸 skip。
