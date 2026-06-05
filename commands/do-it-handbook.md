---
description: 在当前项目里铺一份 .do-it/handbook/ 骨架（invariants / architecture / code-map / glossary / backlog / runtime-status），仅补齐缺失文件，不覆盖已有内容。
---

# /do-it-handbook

为当前项目铺设长期有效的项目级文档骨架，让后续 grill / planning / review / code-mapper 都从同一份事实出发。模板来源于 `skills/do-it/do-it-handbook/templates/`，全部是占位骨架，需要项目所有者填充实际内容。

## 调用方式

- `/do-it-handbook` 或 `/do-it-handbook init` — 增量补齐缺失模板（推荐默认）
- `/do-it-handbook list` — 只列出当前项目缺失的模板，不写入
- `/do-it-handbook check` — 校验已有 handbook 文件名/位置是否对齐 do-it 模板列表

## 行为

1. 加载 `do-it-handbook` skill。
2. 检查 `.do-it/handbook/` 是否存在；不存在则创建。
3. 对比模板列表与项目现状，**只写缺失的文件**——已存在的不覆盖、不合并。
4. 同时确保 `.do-it/grill/`、`.do-it/plans/`、`.do-it/brainstorm/` 各有 `.gitkeep`。
5. 打印写入的文件清单 + "next steps" 提示，先填 `invariants.md` 与 `glossary.md`。

## 不做什么

- 不自动 `git add` / `git commit`。
- 不覆盖任何已存在的 handbook 文件。
- 不基于代码自动生成项目特定内容——占位是有意的，等用户来填。

## 后续

填好 invariants 与 glossary 后，下次 grill / planning 会自动消费这些文件，不再每次重导。`code-map.md` 由 `code-mapper` 子代理在被 dispatch 时自动维护其 "Current implementation locations" 段。
