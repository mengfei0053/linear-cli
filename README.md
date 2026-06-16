# @fe-essential/linear-cli

A Bun-based CLI for Linear.

## Install CLI

Requires Bun in your `PATH` because the CLI is published as a Bun executable.

```bash
npm install -g @fe-essential/linear-cli
linear --help
```

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
linear --help
```

## Configure

Create a project-local config in the current directory:

```bash
linear init
```

Create a user-global config:

```bash
linear init --global
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
~/.config/linear/linear.config.yaml
```

Config resolution order:

1. `LINEAR_API_KEY` for `api_key` only
2. `./linear.config.yaml`
3. `~/.config/linear/linear.config.yaml`

## Commands

Every subcommand supports `-h` and `--help`.

Issue commands:

```bash
linear issue --help
```

List all issues in the configured project:

```bash
linear issue list
```

List issues by status:

```bash
linear issue list -s Todo
linear issue list --status completed
```

Add an issue to the configured project. The default status is `Backlog`:

```bash
linear issue add "Fix login bug"
linear issue add "Fix login bug" -d "Reproduce and patch auth flow"
```

Delete an issue by Linear issue id:

```bash
linear issue delete <issue-id>
```

Delete issues created on a UTC date in the configured project:

```bash
linear issue delete --date 2026-06-11 --yes
```

Count all non-deleted workspace issues across all statuses:

```bash
linear workspace count-issue
```

Show the authenticated user:

```bash
linear viewer
```

## Development

```bash
bun run typecheck
```

## Release

The GitHub Actions release workflow publishes to npm and creates a GitHub Release when a version tag is pushed.

1. Ensure `package.json` has the target version.
2. Create and push a matching tag, for example `v0.1.0`.
3. Configure the repository secret `NPM_TOKEN` with npm publish permissions.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag must match the package version exactly (`v${version}`).
