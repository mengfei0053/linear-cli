---
name: update-issue
description: Use the local linear CLI to update a Linear issue title, description, images, or workflow status.
---

# Update Linear Issue

Use this skill when the user asks to update an existing Linear issue with the `linear` CLI.

## Prerequisites

- Run from a directory with `linear.config.yaml`, or configure `~/.config/linear/linear.config.yaml`.
- Use a Linear issue UUID or identifier such as `ABC-123`.
- Do not print or commit API keys.

## Replace fields

```bash
linear issue update ABC-123 -t "New title"
linear issue update ABC-123 -d "New markdown description"
```

## Append text and images

```bash
linear issue update ABC-123 \
  --append-description "Additional notes" \
  --image ./screenshot-1.png \
  --image ./screenshot-2.png
```

If only `--image` is provided, images are appended to the existing description.

## Update status

```bash
linear issue update ABC-123 -s Done
linear issue update ABC-123 --status completed
```

Status can be a workflow state name, type, or UUID.

## Verify

The command prints:

```text
Updated ABC-123 (...): Issue title
```
