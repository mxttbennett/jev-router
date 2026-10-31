---
name: jev-codex
description: Turn Jev model routing on or off for Codex, or check its current state.
---

When invoked, use the argument after `$jev-codex` as the action. Run:

```bash
node "$HOME/.agents/skills/jev-codex/toggle.mjs" <action>
```

For example, `$jev-codex off` runs `node "$HOME/.agents/skills/jev-codex/toggle.mjs" off`. Only `on`, `off`, and `status` are valid actions. Return the command output without other changes. The toggle affects future prompts in Jev-enabled Codex sessions; the prompt that invokes this skill is handled using the mode that was active when it started.
