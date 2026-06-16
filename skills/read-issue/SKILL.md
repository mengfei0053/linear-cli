---
name: read-issue
description: Use the local linear CLI to read one Linear issue, including status, URL, and markdown description.
---

# Read Linear Issue

Use this skill when the user asks to inspect or fetch details for one Linear issue with the `linear` CLI.

## Prerequisites

- Run from a directory with `linear.config.yaml`, or configure `~/.config/linear/linear.config.yaml`.
- Use a Linear issue UUID or identifier such as `ABC-123`.
- Do not print or commit API keys.

## Command

```bash
linear issue read ABC-123
```

## Output

The command prints:

```text
# ABC-123: Issue title
ID: ...
Status: Todo
URL: https://linear.app/...

Markdown description...
```

## Follow-up

After reading the issue, use `linear issue update` to modify title, description, images, or status.
