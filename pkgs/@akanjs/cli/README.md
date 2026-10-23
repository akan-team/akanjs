# @akanjs/cli

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/cli/README.ko.md) | [Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/cli) | [Runtime](https://www.npmjs.com/package/akanjs)

The `akan` command for [Akan.js](https://akanjs.com), the TypeScript framework with agents included.

`akan` creates, runs, builds, tests and ships Akan workspaces — web, iOS, Android and desktop apps from one
codebase — and gives coding agents the rules and tools they work through. It is Bun-first and bundles the Akan
development tooling, so application runtimes depend only on the smaller `akanjs` package.

## Install

Starting with Claude Code or Codex? Paste the prompt from the
[quick start](https://akanjs.com/docs/intro/quickstart) and the agent sets the workspace up for you.

From a terminal:

```bash
bunx create-akan-workspace@latest
```

Or install the CLI globally:

```bash
bun install -g @akanjs/cli
akan --help
```

## Everyday Commands

```bash
akan create-workspace <workspace> --app <app>
akan create-application <app>
akan create-library <lib>
akan create-module <module>
akan create-scalar <scalar>
akan start <app> --open
akan build <app>
akan typecheck <app>
akan lint <app-or-lib-or-pkg>
akan test <app-or-lib-or-pkg>
akan logs <app>
akan update
```

- `akan start` takes several apps (`akan start a,b`, or `all`) and opens a full-screen view with a log per app.
  `--plain` prints prefixed lines instead, `--kill` frees the dev ports first, and `--share` puts each app on a
  public URL. Every session also writes `local/apps/<app>/runtime/dev.log`.
- `akan logs <app>` tails a running server, filtered by `--level`, `--grep`, `--endpoint`, `--trace` or `--origin`.

## Native Apps

```bash
akan start-ios <app>        # also start-android, start-desktop
akan build-ios <app>        # also build-android, build-desktop
akan release-ios <app>      # also release-android
akan update-keygen <app>
akan publish-update <app>
```

iOS, Android, macOS, Windows and Linux apps are built from the app's CSR bundle on the Akan native runtime,
configured in the `native` section of `akan.config.ts`.

## For Coding Agents

```bash
akan code "add a due date to tasks"   # the terminal coding agent
akan agent install all                # AGENTS.md, CLAUDE.md and Cursor rules
akan mcp-install all                  # register the Akan MCP server for Cursor, Claude Code and Codex
akan mcp --mode plan                  # the MCP server over stdio: readonly, plan or apply
akan workflow list                    # the same workflows without MCP: list, explain, plan, apply
akan guideline show ssrRule
akan context --format json
akan doctor --strict --format json
akan quality ssr
akan repair generated
```

A new workspace already has the rules and the MCP server installed. The MCP server reads in `readonly` mode,
plans workflows in `plan` mode, and in `apply` mode — the mode `mcp-install` registers — applies a plan, runs
validation and the repair tools. An agent changes code through the workflows, so it follows the workspace's rules
instead of routing around them. `akan code` is a terminal agent built on the same rules, workflows and skills.

## Akan Cloud

```bash
akan login           # sign in to Akan Cloud
akan tunnel <app>    # share a running app on a public URL
akan build <app>     # build the production artifact Akan Cloud runs
```

## Package Maintenance

Framework maintainers build and verify the Akan packages through the same executable:

```bash
akan build-package akanjs
akan build-package @akanjs/cli
akan build-package @akanjs/devkit
akan build-package create-akan-workspace
akan verify-akan-publish-packages
akan smoke-registry --test=true --tag=rc
```

Publish Akan framework packages from `dist/pkgs/*` only. `verify-akan-publish-packages` runs `npm pack --dry-run --json`
against the built packages and checks metadata that must be correct before `deploy-akan` or local registry smoke.
For repository releases, prefer `bun run release:build-packages && bun run release:verify-packages` so the CLI package
artifact is built last and is not overwritten by the root `akan` bootstrap script.

## Package Boundary

- Use `akanjs` from application and runtime code.
- Use `@akanjs/cli` as the user-facing executable package.
- `@akanjs/devkit` is bundled into the CLI for published CLI usage; it is not required as a separate
  runtime dependency for ordinary CLI users.
- The `akan code` agent follows that same split: its engine, tools and skills are a devkit facet
  (`@akanjs/devkit/codeAgent`), and `@akanjs/cli/code` is the terminal host plus the SDK entry that
  re-exports both.

## Requirements

- [Bun](https://bun.sh) `>=1.4.4`
- A TypeScript Akan workspace
- For native builds: Xcode (iOS), the Android SDK and JDK 21 (Android), or Rust (desktop)

## License

MIT
