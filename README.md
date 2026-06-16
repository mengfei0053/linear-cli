# @fe-essential/linear-cli

A Bun-based CLI for Linear.

## Install CLI

Install globally with Bun:

```bash
bun add -g @fe-essential/linear-cli
linear --help
```

If `linear` is not found, make sure Bun's global bin directory is in your `PATH`:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

You can also install with npm, but Bun must still be available in your `PATH` because the CLI is a Bun executable:

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
linear issue add "Fix login bug" --image ./screenshot.png
linear issue add "Fix login bug" -d "See screenshots" --image ./before.png --image ./after.png
```

Image uploads support `gif`, `jpeg`, `jpg`, `png`, and `webp`. Uploaded images are embedded in the issue description.

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

First configure the repository secret `NPM_TOKEN` with npm publish permissions.

Then run one of the release scripts from a clean working tree:

```bash
bun run release:patch  # 0.1.0 -> 0.1.1
bun run release:minor  # 0.1.0 -> 0.2.0
bun run release:major  # 0.1.0 -> 1.0.0
```

The script automatically:

1. bumps `package.json` version;
2. runs typecheck;
3. commits `chore: release v${version}`;
4. creates the matching git tag;
5. pushes the branch and tag to trigger publishing.

The tag must match the package version exactly (`v${version}`).
