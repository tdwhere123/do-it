---
description: 开关本项目的本地学习事件记录，或输出已记录观察的去敏复盘报告。参数为 on / off / status / report。报告不会自动改 adaptive profile 或 Core。
---

# /do-it-retrospective

`/do-it-retrospective on` 开启当前项目的本地、去敏学习事件记录；`off` 立即停止新增记录；`status` 只报告当前状态；`report` 输出本地复盘报告。记录默认关闭。新事件写在 `.do-it/runtime/events/learning.jsonl`，兼容副本仍在 `.do-it/runtime/retrospective/`，不会进入 Git。

当参数为 `on`、`off` 或 `status` 时，只确认状态并停止；不要改代码、规则文件、adaptive profile、Core 或历史记录。无参数时显示这份用法，不自动展示报告。

`report` 时，读取本地事件并做复盘，先判断原因（code/test、project truth、task contract、host gap、adaptive candidate），再给出不超过三条候选经验。单次事件默认 `no-action`。不要把观察当成已激活策略，也不要自动写入 `.do-it/runtime/adaptive/profile.md` 或 `do-it-core`。若要改已有 `AGENTS.md` / `CLAUDE.md`，先给出目标文件和精确措辞，等待用户确认。不要自动创建规则文件、提交或推送。

此 slash command 是 Claude Code 的发现入口。其它宿主只有在原始文本实际到达 prompt hook 时才支持同样的精确文本；否则用 `do-it-retrospective` skill 或明确自然语言请求。
