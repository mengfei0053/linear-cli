# linear-cli

A Bun-based CLI for Linear.

## Install dependencies

```bash
bun install
```

## Run locally

```bash
bun run index.ts --help
```

## Link as a global command

```bash
bun link
linear-cli --help
```

## Configure

Create a project-local config in the current directory:

```bash
linear-cli init
```

Create a user-global config:

```bash
linear-cli init --global
```

`init` prompts for:

- `api_key`
- `workspace`
- `project`

Local config is written to:

```text
./linear.config.yaml
```

Global config is written to:

```text
~/.config/linear-cli/linear.config.yaml
```

Config resolution order:

1. `LINEAR_API_KEY` for `api_key` only
2. `./linear.config.yaml`
3. `~/.config/linear-cli/linear.config.yaml`

## Commands

Every subcommand supports `-h` and `--help`.

Issue commands:

```bash
linear-cli issue --help
```

List all issues in the configured project:

```bash
linear-cli issue list
```

List issues by status:

```bash
linear-cli issue list -s Todo
linear-cli issue list --status completed
```

Add an issue to the configured project. The default status is `Backlog`:

```bash
linear-cli issue add "Fix login bug"
linear-cli issue add "Fix login bug" -d "Reproduce and patch auth flow"
```

Delete an issue by Linear issue id:

```bash
linear-cli issue delete <issue-id>
```

Delete issues created on a UTC date in the configured project:

```bash
linear-cli issue delete --date 2026-06-11 --yes
```

Count all non-deleted workspace issues across all statuses:

```bash
linear-cli workspace count-issue
```

Show the authenticated user:

```bash
linear-cli viewer
```

## Development

```bash
bun run typecheck
```
