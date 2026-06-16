---
name: create-issue
description: Use the local linear CLI to create a Linear issue, optionally with one or more uploaded images.
---

# Create Linear Issue

Use this skill when the user asks to create a Linear issue with the `linear` CLI.

## Prerequisites

- Run from a directory with `linear.config.yaml`, or configure `~/.config/linear/linear.config.yaml`.
- Do not print or commit API keys.

## Command

```bash
linear issue add "Issue title" -d "Issue description"
```

## With images

Repeat `--image` for multiple screenshots:

```bash
linear issue add "Issue title" \
  -d "Issue description" \
  --image ./before.png \
  --image ./after.png
```

Supported image types: `gif`, `jpeg`, `jpg`, `png`, `webp`.

## Verify

The command prints the created issue identifier and UUID:

```text
Created ABC-123 (...): Issue title
```
