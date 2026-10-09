# do-it

[English](./README.md) | [中文](./README.zh-CN.md)

面向 Codex、Claude Code、Cursor、Pi 和 Grok Build 的专业编程判断插件。
do-it 提供按需技能、独立专业代理、精简上下文和有用的确定性检查，由模型选择方法。

Core 只保留稳定原则：守住用户目标、已定决策和授权边界；依据当前事实并区分假设；
在必要范围内修复因果归属层；用相关实际证据支持结论并说明缺口。自检问题只是可选
思考提示，不是强制访谈、工作流或报告。

## 安装

| 宿主 | 命令 |
| --- | --- |
| Codex | `codex plugin marketplace add tdwhere123/do-it && codex plugin add do-it@tdwhere-do-it` |
| Claude Code | `/plugin marketplace add tdwhere123/do-it` → `/plugin install do-it@do-it` |
| Cursor | `npm run install:cursor-local` → Reload Window |
| Pi | `pi install npm:@tdwhere/do-it-pi` |
| Grok Build | [生成式插件包安装](./docs/install.zh-CN.md#grok-build) |

[安装详情](./docs/install.zh-CN.md)包含宿主配置和冒烟检查。
0.18.1 源码更新尚未发布；marketplace 或 npm 安装可能获取较早版本。Codex
专业代理需要按安装指南单独安装原生角色。OpenCode 和 Kimi Code 的仓库支持已退役，
不移除本机应用或用户配置。安装后正常表达需求即可。
无需任务分级、强制 router 入口或 .do-it 脚手架。优先复用已有指令和项目文档，仅在
有助于连续工作时记录轻量任务说明。

## 专业视角

按描述直接选择能帮助当前工作的技能：

| 技能 | 提供的判断 |
| --- | --- |
| `do-it-core` | 目标、事实、因果范围和结论的稳定原则 |
| `do-it-code-quality` | 因果归属、契约连带变化和有状态失败 |
| `do-it-architecture` | 权威、边界、兼容、迁移与恢复 |
| `do-it-decide` | 能改变决策的不确定性和有意义的备选方案 |
| `do-it-review` | 分别检查需求符合性和实现质量 |
| `do-it-audit` | 显式深度检查、逐文件覆盖与独立因果综合 |
| `do-it-verify` | 相关证据以及交付结论的实际限制 |
| `do-it-context` | 项目术语与事实一致性 |
| `do-it-handbook` | 值得在现有项目文档中保存的稳定知识 |
| `do-it-retrospective` | 对实际结果按需复盘 |
| `do-it-skill-authoring` | 简洁触发条件、独特判断和必要边界 |

`do-it-router` 仅保留为显式调用的技能发现兼容别名。

独立代理上下文很重要：它们可以独立收集证据、形成结论，减少继承父代理判断造成的
锚定。交接目标、范围、已定决策和来源事实；父代理观点应标为假设。专业角色保留
只读或限定写入范围，父代理负责整合并验证整体变化。根据独立性的具体价值使用代理，
不设置默认人数配额，也不强制每个任务经过委派。

## 按需深度检查

通过宿主原生技能入口显式选择 `do-it-audit`，或直接提出：“用 do-it-audit 检查
整个仓库”“深度检查存储子系统的恢复和数据完整性”。检查范围与风险角度分别选择，
已说清楚的选项不必重新访谈。

宿主支持子智能体时，父代理在确定范围和文件清单后，主动组织正确性、架构和可维护性
的独立审查。各专业代理只接收限定的模块或契约分片及自己的检查视角，数量按任务决定。
除功能缺陷外，死代码、重复机制和安全简化也得到实质检查。

覆盖明确区分文件分配、实质检查和跨模块契约验证；有效证据可以复用，生成副本和资产
采用适合的一致性或完整性检查。新的独立上下文针对发现和因果解释做定向复核，再提出
修复建议，无需重新审查整个仓库。报告优先呈现诊断；覆盖、委派能力或独立综合的缺口
必须如实说明。默认只读，不自动修代码或生成报告文件。普通 review 保持原有范围。
这是技能指导，不是新的命令框架或运行时权限门禁。

## 运行时

默认路径提供精简上下文，并对新增源代码行进行有用的质量检查。检查为建议性；
实际宿主权限机制负责执行已配置的访问和副作用限制。

任务分类、词法 router/grill 提醒、完成措辞门禁、active-task 自动接管以及自定义
adaptive 个性化系统均已退出。持久偏好交给原生宿主指令或记忆。现有用户配置、
记忆、任务文档和运行时指针保持原样。[迁移说明](./docs/simplification-migration.zh-CN.md)
介绍兼容行为。

证据收集是显式开启的诊断功能。Pi 仅在 `DO_IT_EVIDENCE_MODE=observe`
时调用 observer；其他宿主可显式注册或调用。诊断事件不能证明任务验收。结论应说明
实际相关验证及缺口；测试通过本身不意味着整个用户目标已经实现。

代码质量数值覆盖继续作为纯数据放在被编辑仓库的 `.do-it/write-quality.local.tsv`，
环境变量优先。详见[质量检查项](./skills/do-it/references/write-quality-families.md)。

## 开发

```bash
npm run build:generated
npm run lint
npm test
```

技能源文件位于 `skills/do-it/`，代理角色位于 `agents/`，钩子源位于 `hooks/`。
Core 中标记的引导摘录生成钩子上下文，索引保留完整技能描述。Pi 代理由
`agents/*.toml` 加适配器元数据和协调指令生成；Pi 的 `extensions/` 仍为直接维护
的源文件。参见[架构说明（英文）](./docs/architecture.md)。安装、验证、测试和宿主文档位于对应目录。

参见[维护说明](./docs/maintenance.md)、[发布规则](./docs/release.md)和
[贡献规则](./CONTRIBUTING.md)。修改应解决实际遇到的问题。do-it 参考了
[mattpocock/skills](https://github.com/mattpocock/skills)、
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)和
[get-shit-done](https://github.com/gsd-build/get-shit-done)的思想，交付自身的专业指导。
[架构比较（英文）](./docs/architecture.md#upstream-comparison)记录了 0.18.1
额外参考的五个上游仓库及实际吸收的做法。感谢 Linux.do 社区提供真实使用反馈。
