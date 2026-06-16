---
name: list-issue
description: Use the local linear CLI to list Linear issues in the configured project, optionally filtered by status.
---

# List Linear Issues

Use this skill when the user asks to list, browse, or find issues in the configured Linear project with the `linear` CLI.

## Prerequisites

- Run from a directory with `linear.config.yaml`, or configure `~/.config/linear/linear.config.yaml`.
- Do not print or commit API keys.

## List all issues

```bash
linear issue list
```

## Filter by status

```bash
linear issue list -s Todo
linear issue list --status completed
```

Status can be a workflow state name or type.

## Output

The command prints a tab-separated table:

```text
Identifier ID Date Status Title
ABC-123    ... 2026-06-16 Todo Example issue
```

Use the `Identifier` or `ID` with `linear issue read` or `linear issue update`.
