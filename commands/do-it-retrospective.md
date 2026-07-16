---
description: 开关本项目的本地行为反馈记录，或输出已记录问题的去敏复盘报告。参数为 on / off / status / report。
---

# /do-it-retrospective

`/do-it-retrospective on` 开启当前项目的本地、去敏反馈记录；`off` 立即停止新增记录；`status` 只报告当前状态；`report` 输出本地复盘报告。记录默认关闭，位于 `.do-it/runtime/retrospective/`，不会进入 Git。

当参数为 `on`、`off` 或 `status` 时，只确认状态并停止；不要改代码、规则文件或历史记录。无参数时显示这份用法，不自动展示报告。

`report` 时，读取本地事件并做复盘：先给出不超过三条候选经验、目标文件和精确措辞；等待用户确认后，才允许写入已有 `AGENTS.md` 或 `CLAUDE.md`。不要自动创建规则文件、提交或推送。

此 slash command 是 Claude Code 的发现入口。其它宿主只有在原始文本实际到达 prompt hook 时才支持同样的精确文本；否则用 `do-it-retrospective` skill 或明确自然语言请求。
