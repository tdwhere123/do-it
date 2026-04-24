# do-it Workflow

[English](./README.md) | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@tdwhere/do-it.svg)](https://www.npmjs.com/package/@tdwhere/do-it)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`do-it` 是面向 Codex 的智能体软件交付工作流包。它把一套可执行的工程习惯打包起来：先判断任务类型，检查当前事实，再按风险决定规划深度；实现时保持切片边界，交付后审查和修复，最后只用刚刚验证过的证据说明完成状态。

默认安装目标是 `~/.codex`。包会把工作流技能安装到 `~/.codex/skills`，把可移植的智能体定义安装到 `~/.codex/agents`。Claude Code 和其他运行环境可以通过适配说明复用同一套策略，但 Codex 是这个仓库的主要发布目标。

## 这个包提供什么

- `Light`、`Standard`、`Heavy` 三层任务路由模型。
- do-it 原生技能：规划、切片、前提压力测试、实现、TDD、调试、审查、修复循环、验证门、worktree 隔离、分支收口、视觉规划和技能编写。
- 可移植的 Codex 智能体定义：代码路径映射、计划挑战、正确性审查、架构审查、红队审查、规格合规、领域语言检查、安装/发布审查、文档、测试和专项技术审查。
- 基于复制的安装器和 doctor 命令，用 `manifest.json` 校验 Codex home 中的受管文件。
- 可从本地 checkout、打包产物、GitHub 仓库或 npm registry 使用的发布入口。

## 路由模型

`do-it` 不要求所有任务都走同一套流程，而是按风险选择强度：

1. `Light`：小型文档修改、机械修复、窄范围命令检查。通常本地完成，用针对性验证收口。
2. `Standard`：普通功能、Bug 修复、重构和范围明确的策略更新。需要先做修改地图，再实现、验证，并在有风险时进行审查。
3. `Heavy`：wave、phase、公共接口、架构变更、发布任务或高风险改动。父智能体负责计划、切片边界、审查栈、修复循环、复审和收口证据。

完整策略见 [docs/routing-matrix.md](./docs/routing-matrix.md)。

## 从 npm 安装

全局安装 CLI，然后运行 setup：

```bash
npm install -g @tdwhere/do-it
do-it setup
```

`do-it setup` 会先执行 `do-it install`，再执行 `do-it doctor`。

- `do-it install` 会把受管技能和智能体复制到 `CODEX_HOME`。
- `do-it doctor` 会检查已安装文件和安装状态是否与包内 manifest 一致。
- `CODEX_HOME` 默认是 `~/.codex`。

测试安装行为时，建议使用临时 Codex home：

```bash
CODEX_HOME=/tmp/do-it-codex-test do-it setup
```

安装器不会静默覆盖用户自己的技能或智能体文件。如果目标文件没有被标记为 do-it 受管文件，安装会停止。只有在你明确要替换这些目标时，才设置 `DO_IT_FORCE=1`。

## registry 发布前的安装方式

如果包暂时托管在 GitHub：

```bash
npm install -g github:OWNER/codex-workflow
do-it setup
```

如果要测试本地打包产物：

```bash
npm pack
npm install -g ./tdwhere-do-it-0.3.0.tgz
do-it setup
```

## 本地开发

在仓库 checkout 中，优先使用包入口：

```bash
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
```

也可以使用等价的 package scripts：

```bash
npm run setup
npm run install:do-it
npm run doctor
npm run do-it -- doctor
```

保留的 shell wrapper 用于直接测试安装器，它们委托给同一套受管安装逻辑：

```bash
./install/install.sh
./install/doctor.sh
```

这个包不会通过 npm lifecycle scripts 自动修改 `~/.codex`。只有操作者显式运行 `do-it setup` 或 `do-it install` 时，才会安装到 Codex。

## 仓库结构

```text
agents/          可移植的 Codex 智能体 TOML 定义
bin/             全局 do-it CLI 入口
docs/            路由、维护、来源映射和发布说明
install/         安装器、doctor 和 shell wrapper 入口
skills/custom/   默认不安装的本地技能示例
skills/do-it/    会被安装的 do-it 原生技能目录
manifest.json    安装清单和目标路径
package.json     npm 包元数据和 CLI scripts
```

私有 `.do-it/` 目录用于本地计划、笔记和临时材料。它被 Git 忽略，也不会被安装。

## 维护说明

修改技能、智能体、安装器或包元数据时，参考 [docs/maintenance.md](./docs/maintenance.md)。简要规则如下：

1. 修改仓库中的受维护副本。
2. 安装清单变化时同步更新 `manifest.json`。
3. 路由或收口策略变化时同步更新 `docs/routing-matrix.md`。
4. 用临时 `CODEX_HOME` 验证安装和 doctor。
5. 发布前确认打包产物包含预期文件。

常用发布检查：

```bash
npm pack --dry-run
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it doctor
```

## 致谢

`do-it` 吸收并重写了 Superpowers 技能生态中有价值的工作流思想，并把它们整理为面向 Codex 的原生包。公开名称、路由模型、安装器和收口策略都以这个仓库为维护来源。
