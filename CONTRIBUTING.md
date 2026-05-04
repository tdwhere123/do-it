# Contributing to do-it

[English](#english) | [中文](#中文)

---

## English

### Two hard rules

#### 1. Dogfood first

You must have actually used `do-it` in your own project, hit a concrete
problem, made the change, and confirmed in hindsight that the change makes
`do-it` better — *before* you open a PR.

Theory-only ideas, "what if we also did X," and refactors with no observed
need do not qualify. They belong in an Issue, not a PR.

#### 2. Issue first

For any change that is not on the exception list below, open an Issue *before*
writing the PR. The Issue should answer:

- **What you hit** — the concrete problem, ideally with a transcript snippet
  or `.do-it/grill/<task>.md` reference.
- **Your project** — language, scale, AI-collaboration scenario. A link if
  the project is public; an anonymized description otherwise.
- **What you want to change** — the proposed change, and *why this should
  land in `main` instead of staying in your fork*.

Wait for a maintainer to reply with `accepted for PR` before opening the PR.
This protects you from writing a PR in a direction we will not accept.

### Exceptions (open a PR directly, no Issue needed)

- Typo / wording fix in docs
- Translation
- Obvious bug fix that comes with reproducible steps

### PR template (required for non-exception changes)

When opening the PR, include the following sections:

```markdown
### Your project
- Link or anonymized description (language, scale, scenario)
- How long you have been using do-it
- Which skills are part of your real workflow

### The real problem that triggered this change
- Which skill / which step in the flow
- What do-it did, and why it was not good enough
- (Optional) Transcript snippet or .do-it/ file link

### What this change does
- Behavior before vs. after (one or two sentences)
- Result of re-testing in your own project

### Why this belongs in do-it
- Is this problem specific to your project, or do most projects hit it?
- Why a fork is not enough — what makes this a `main`-worthy change?

### Linked Issue
- #<issue number>  (the Issue that received `accepted for PR`)
```

### What we will push back on

- A change "for completeness" with no observed problem.
- Splitting an obviously coupled change into many "small" PRs to look
  reviewable.
- Adding a new skill that overlaps an existing one without saying so.
- Removing a guardrail because it inconvenienced a single workflow.

### What we welcome

- Surprising failure modes you observed in real use.
- Concrete tightening of an existing skill's trigger conditions or output
  shape.
- New review lenses that came out of a real incident.
- Documentation that closes a gap your team actually hit.

---

## 中文

### 两条硬规则

#### 1. 先 dogfood

你必须真实在自己项目里用过 `do-it`、撞到了具体问题、改完之后回看确认这个
改动让 `do-it` 更好 —— *然后才能* 开 PR。

理论上的好主意、「要不要顺手加个 X」、没有观察到需求的重构，都不算。请走
Issue，不走 PR。

#### 2. 先 Issue

除「例外清单」以外的所有改动，请在 *写 PR 之前* 先开 Issue。Issue 里要回答：

- **你撞到了什么** —— 具体问题，最好附 transcript 片段或
  `.do-it/grill/<task>.md` 链接。
- **你的项目** —— 语言、规模、AI 协作场景。公开项目给链接；非公开给匿名描述。
- **你想怎么改** —— 改动方案，以及 *为什么这个改动要进 `main`，而不是留在
  你自己的 fork 里*。

等 maintainer 回复 `accepted for PR` 之后再开 PR。这条规则是保护你的：
避免你写完 PR 才发现方向不对。

### 例外清单（直接 PR，不需要 Issue）

- 文档 typo / 措辞修复
- 翻译
- 带可复现步骤的明显 bug fix

### PR 模板（非例外类改动必填）

开 PR 时，包含以下内容：

```markdown
### 你的项目
- 链接或匿名描述（语言、规模、场景）
- 你用 do-it 多久了
- 哪些 skill 是你真实工作流的一部分

### 触发这次改动的真实问题
- 哪个 skill / 流程的哪一步
- 当时 do-it 是怎么做的，为什么不够好
- （可选）transcript 片段或 .do-it/ 文件链接

### 这次改动做了什么
- 修改前 vs 修改后的行为差异（一两句）
- 在你自己项目里复测的结果

### 为什么这个改动应该进 do-it
- 这是你项目特有的问题，还是大多数项目都会撞？
- 为什么 fork 不够 —— 什么让它值得进 `main`？

### 关联 Issue
- #<编号>  （拿到 `accepted for PR` 的那个 Issue）
```

### 我们会推回的

- 「为了完整性」加的改动，但没有观察到问题。
- 把明显耦合的改动拆成多个「小 PR」装好审查。
- 加新 skill 但不说和现有 skill 的边界冲突。
- 因为某一个工作流不方便就拆掉护栏。

### 我们欢迎的

- 你在真实使用中观察到的、出乎意料的失败模式。
- 对现有 skill 触发条件或返回形态的具体收紧。
- 来自真实事故的新 review lens。
- 填补你团队真实撞过的盲区的文档。
