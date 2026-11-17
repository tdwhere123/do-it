# do-it-agy (0.19.2)

Antigravity plugin bundle for **@tdwhere/do-it**.

- **Skills**: 10 canonical engineering skills (`do-it-core`, `do-it-code-quality`, `do-it-review`, `do-it-decide`, `do-it-verify`, `do-it-architecture`, `do-it-audit`, `do-it-retrospective`, `do-it-context`, `do-it-skill-authoring`) + `references/`.
- **Agents**: 8 model-inheriting subagents with least-privilege AGY tool scopes.
- **Hooks**: `SessionStart`, `PreInvocation`, `PostToolUse` (write quality lint staged per session), and `PostInvocation` (injects pending advisories).
