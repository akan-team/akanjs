# @akanjs/cli

[Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/cli) | [Runtime](https://www.npmjs.com/package/akanjs)

Command-line tooling for Akan.js workspaces.

`@akanjs/cli` provides the `akan` executable used to create, build, test, lint, release, and maintain Akan
applications, libraries, and framework packages. It is a Bun-first CLI package and bundles Akan development
tooling internally so application runtimes can depend on the smaller `akanjs` package.

## Install

Create a new workspace:

```bash
bunx create-akan-workspace@latest
```

Or install the CLI globally:

```bash
bun install -g @akanjs/cli@latest
akan --help
```

## Common Commands

```bash
akan create-workspace <workspace-name>
akan start <app-name>
akan build <app-name>
akan test <app-or-lib-or-pkg>
akan lint <app-or-lib-or-pkg>
akan create-application <app-name>
akan create-library <lib-name>
akan create-module <module-name>
akan create-scalar <scalar-name>
```

## Agent And MCP Commands

```bash
akan context --format markdown
akan context --format json --module <module-name>
akan doctor --format json
akan guideline list
akan guideline show framework
akan agent install cursor
akan mcp
```

These commands expose Akan workspace structure, module abstracts, diagnostics, and guideline instructions for
coding agents. The MCP server is read-only and is intended to provide context rather than edit files directly.

Package maintenance commands are also exposed through the same executable:

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

## Requirements

- [Bun](https://bun.sh) `>=1.3.13`
- A TypeScript Akan workspace

## License

MIT
