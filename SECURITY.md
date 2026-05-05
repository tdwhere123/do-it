# Security Policy

## Supported Versions

Security fixes target the latest code on `main` and the latest published npm
version of `@tdwhere/do-it`.

## Reporting A Vulnerability

Please do not open a public issue with exploit details, credential material, or
private transcript content.

Use GitHub's private vulnerability reporting flow:

https://github.com/tdwhere123/do-it/security/advisories/new

If private reporting is unavailable, open a minimal public issue asking for a
security contact, but leave out sensitive details until a private channel is
available.

Useful context:

- affected host: Codex, Claude Code, or both;
- install source: npm, GitHub, local checkout, or tarball;
- affected command, hook, skill, or installer path;
- reproduction steps without private secrets;
- whether the issue can overwrite user-owned files, leak transcript content,
  bypass verification gates, or execute unexpected commands.

## Scope

In scope:

- installer or doctor behavior that can overwrite user-owned files incorrectly;
- hook behavior that can leak sensitive transcript or prompt data;
- package contents that accidentally include machine-local files;
- workflow bypasses that allow false completion claims in normal operation.

Out of scope:

- prompts that intentionally ask an AI agent to ignore the workflow;
- vulnerabilities in Codex, Claude Code, npm, GitHub Actions, or the host OS;
- project-specific misuse that does not involve do-it behavior.
