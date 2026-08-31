---
description: 在当前项目里铺一份精简 .do-it/handbook/ 骨架（invariants / architecture / glossary / worklog-template），仅补齐缺失文件，不覆盖已有 CONTEXT / handbook / plan。
---

# /do-it-handbook

为当前项目铺设长期有效的项目级文档骨架，让后续决策、编码与审查从同一份稳定事实出发。模板来源于 `skills/do-it/do-it-handbook/templates/`，全部是占位骨架，需要项目所有者填充实际内容。每天/每目标的过程记录写到 `.do-it/worklog/`，不要塞进 handbook。`.do-it/plans/` 只放 durable execution contracts（Goal / Decisions / Boundary / Acceptance），不是进度日志。

## 调用方式

- `/do-it-handbook` 或 `/do-it-handbook init` — 增量补齐缺失模板（推荐默认）
- `/do-it-handbook list` — 只列出当前项目缺失的模板，不写入
- `/do-it-handbook check` — 校验已有 handbook 文件名/位置是否对齐 do-it 模板列表

## 行为

1. 加载 `do-it-handbook` skill。
2. 检查 `.do-it/handbook/` 是否存在；不存在则创建。
3. 对比模板列表与项目现状，**只写缺失的文件**——已存在的不覆盖、不合并。
4. 同时确保 `.do-it/worklog/` 与 `.do-it/plans/` 有 `.gitkeep`，且 `.do-it/CONTEXT.md` 存在——缺失时按
   `do-it-context` 的三段骨架（Terms / Invariants / Relationships）写入，绝不覆盖
   已有 CONTEXT / handbook / plan。缺失时写入 `.do-it/.gitignore`（runtime /
   adaptive / events / sessions），不覆盖已有 ignore。不要创建
   `.do-it/brainstorm/` 或 `.do-it/grill/`；若用户目录已有内容，原样保留、不再推荐。
   只有任务确实需要持久化时，才按 `do-it-decide` 写入 execution contract。
5. 打印写入的文件清单 + "next steps" 提示，先填 `invariants.md` 与 `glossary.md`。

`list` / `check` 只对照 handbook 模板、CONTEXT、worklog、plans 与本地 ignore；缺失 brainstorm/grill 不算缺口。

## 不做什么

- 不自动 `git add` / `git commit`。
- 不覆盖任何已存在的 CONTEXT、handbook 文件或 plan。
- 不创建 brainstorm/grill，不删除用户已有 artifact。
- 不把 progress checkbox 写进 plan。
- 不基于代码自动生成项目特定内容——占位是有意的，等用户来填。
- 不改仓库根 `.gitignore`。

## 后续

填好 invariants 与 glossary 后，`do-it-decide`、`do-it-code-quality` 和 `do-it-review` 会在需要时读取它们。代码位置用 `rg` 或临时 `code-mapper` 重新发现；每日进展、证据和可复用经验写到 `.do-it/worklog/YYYY-MM-DD.md` 或 `.do-it/worklog/<goal>.md`。计划文件只在挣来时按 execution contract 持久化。
