---
description: 一次性跳过 do-it 钩子（router / grill / verification-gate）。参数可选 grill / router / gate / all（默认 all）。
---

# /do-it-skip

把当前 turn 标记为 do-it 钩子的 escape：router 不再注入分级建议、grill 不再发送前提压测提醒、verification-gate 不再发送证据提醒。Skip 只在**本 turn** 有效；Stop 后 verification-gate 会清除全部 skip 标志。

## 使用方式

- `/do-it-skip` — 跳过全部三个钩子（等价 `/do-it-skip all`）
- `/do-it-skip grill` — 仅跳过 grill 前提压测
- `/do-it-skip router` — 仅跳过 router 分级
- `/do-it-skip gate` — 仅跳过 verification-gate 证据提醒

## 行为

向当前 session 写入对应的 skip 标志文件。do-it 的 hook 脚本检测到标志后会让路；partial 目标只写对应 flag，不会连带跳过其它钩子。

## 等价的隐式 escape 关键词

直接在用户输入里包含以下关键词，钩子会自动让路（无需运行命令）：

**Partial（只跳过指定钩子）**

- `skip grill` / `/do-it-skip grill` / `不用 grill` / `不用grill` → 仅 grill
- `skip router` / `/do-it-skip router` → 仅 router
- `skip gate` / `/do-it-skip gate` → 仅 gate

**Full（跳过 router + grill + gate）**

- `/do-it-skip` / `/do-it-skip all`
- `yolo` / `just do it` / `直接做` / `我已经想清楚` / `skip do-it`
- `随便聊` / `先聊聊` / `just thinking`

若同一条 prompt 里出现多个 partial 目标（如 `skip grill` 与 `skip gate`），会合并去重。Partial 优先于 full：只要写了 partial 目标，就不会因其它 full 词而全跳过。
