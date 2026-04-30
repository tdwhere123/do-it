#!/usr/bin/env bash
# do-it hook keyword tables. Sourced by all hook scripts.
#
# Project-level override: <cwd>/.do-it/keywords.local.sh can append additional
# words to any of these arrays without removing the defaults. Example:
#   DO_IT_INTENT_VERBS+=("微调" "审稿")

# Intent verbs — promotes prompt to at least Standard tier; triggers grill #1.
DO_IT_INTENT_VERBS=(
  "做" "实现" "写" "加" "添加" "新增" "创建" "构建" "搭" "接入" "集成" "引入"
  "改" "修改" "修" "修复" "调整" "重构" "重写" "优化" "升级" "迁移" "替换" "移除" "删除"
  "排查" "调试" "复现" "评审" "审" "检查" "测试" "设计" "规划" "切片"
  "implement" "build" "add " " add " "create" "fix" "refactor" "rewrite" "migrate"
  "remove" "delete" "debug" "review" "test " "design" "plan"
)

# Uncertainty words — triggers grill #2 (premise pressure-test).
DO_IT_UNCERTAINTY_WORDS=(
  "我想" "我觉得" "我希望" "应该" "大概" "可能" "也许" "或许"
  "是不是" "能不能" "要不要" "估计" "似乎"
  "i think" "maybe" "perhaps" "should " "probably" "could " "might "
  "wondering" "not sure" "i guess"
)

# Heavy signals — promotes to Heavy tier (overrides Standard/Light).
DO_IT_HEAVY_SIGNALS=(
  "wave" "phase" "公共接口" "公开接口" "公开 api" "api 改" "api 变" "schema"
  "协议" "多包" "跨包" "架构" "边界" "依赖方向" "循环依赖" "发布" "release"
  "migration" "迁移" "breaking change" "不兼容" "数据库" "db schema" "升版" "入口"
  "across packages" "api change" "schema change"
)

# Light signals — caps at Light tier when paired with short input.
DO_IT_LIGHT_SIGNALS=(
  "typo" "拼写" "错字" "文档" "doc " "注释" "rename" "改名" "重命名"
  "整理" "format" "lint only" "comment only"
)

# Escape words — disable router/grill/gate for the current turn.
DO_IT_ESCAPE_WORDS=(
  "skip grill" "直接做" "不用 grill" "不用grill" "我已经想清楚"
  "yolo" "just do it" "skip do-it" "skip router" "skip gate"
  "/do-it-skip"
)

# Long-input grill threshold (character count).
DO_IT_LONG_INPUT_THRESHOLD="${DO_IT_LONG_INPUT_THRESHOLD:-300}"

# Long-input topical hints — combined with length > threshold to trigger grill #3.
DO_IT_LONG_INPUT_HINTS=(
  "需求" "方案" "思路" "想法" "计划" "拆分" "拆解" "策略"
  "requirement" "approach" "idea" "strategy" "spec" "rfc"
)
