---
description: 一次性跳过 do-it 钩子（router / grill / verification-gate）。参数可选 grill / router / gate / all（默认 all）。
---

# /do-it-skip

把当前 turn 标记为 do-it 钩子的 escape：router 不再注入分级、grill 不再要求列前提、verification-gate 不再阻拦完成声明。

## 使用方式

- `/do-it-skip` — 跳过全部三个钩子（等价 `/do-it-skip all`）
- `/do-it-skip grill` — 仅跳过 grill 前提压测
- `/do-it-skip router` — 仅跳过 router 分级
- `/do-it-skip gate` — 仅跳过 verification-gate 完成门

## 行为

向当前 session 的 escape 标志目录写入对应的 skip 标志文件。do-it 的 hook 脚本检测到标志后会让路。

## 等价的隐式 escape 关键词

直接在用户输入里包含以下任一关键词，钩子会自动让路（无需运行命令）：
`skip grill` / `直接做` / `不用 grill` / `我已经想清楚` / `yolo` / `just do it`
