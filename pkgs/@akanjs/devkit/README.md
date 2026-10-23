# @akanjs/devkit

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/devkit/README.ko.md) | [Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/devkit) | [Runtime](https://www.npmjs.com/package/akanjs)

Development tooling primitives for Akan.js.

`@akanjs/devkit` contains the build runners, workspace executors, config loaders, dependency scanners,
frontend artifact builders, command decorators, prompts, and release helpers used by the Akan CLI and by
framework-level tooling. It is intended for tools and package authors, not for application runtime code.

## Install

Most users should install the CLI instead:

```bash
bun install -g @akanjs/cli
```

Install `@akanjs/devkit` directly only when building Akan-aware tooling:

```bash
bun add -d @akanjs/devkit
```

## Usage

```ts
import { ApplicationBuildRunner } from "@akanjs/devkit/applicationBuildRunner";
import { AppExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";

const workspace = WorkspaceExecutor.fromRoot();
const app = AppExecutor.from(workspace, "my-app");
const runner = new ApplicationBuildRunner(app);

await runner.typecheck();
await runner.build();
```

Import values from the facet that owns them (`@akanjs/devkit/executors`, `@akanjs/devkit/akanConfig`,
`@akanjs/devkit/workflow`, …). The root `@akanjs/devkit` entry exports types only, so loading a tool does not pull
every facet into the process.

## What It Provides

- Workspace, app, library, package, and module executors.
- `akan.config.ts` loading and normalization.
- Application build, typecheck, SSR, CSR, and release runners.
- Dependency scanning and package metadata generation helpers.
- Frontend build transforms and RSC/SSR artifact builders.
- Command/script decorators used by `@akanjs/cli`.
- Guidelines, code generation, and the plan-then-apply workflows behind `akan workflow` and the Akan MCP server.
- The shared Biome config (`@akanjs/devkit/biome.base.json`) and the grit lint rules every workspace extends.
- Native app builds on the Akan native runtime (iOS, Android, macOS, Windows, Linux), store releases, and signed
  update releases.
- The `akan code` agent engine, the tools it is given, and the shipped akan skills (`@akanjs/devkit/codeAgent`).

## Dev Server Sizing

The dev server bounds its own memory by recycling the processes that grow, and every threshold it uses
can be set from the environment. [`DEV_RUNTIME_KNOBS.md`](https://github.com/akan-team/akanjs/blob/main/pkgs/@akanjs/devkit/DEV_RUNTIME_KNOBS.md) lists them with their
defaults, the shares they derive from `AKAN_MEMORY_LIMIT`, and what a small container should expect.

## Package Boundary

- Runtime code should import from `akanjs`, including shared config types such as `AppConfig`, `LibConfig`,
  `AppInfo`, and `LibInfo`.
- CLI users should install `@akanjs/cli`; the published CLI bundles this devkit internally.
- Tooling authors can import `@akanjs/devkit` directly when they need Akan workspace introspection or build APIs.

## Requirements

- [Bun](https://bun.sh) `>=1.4.4`
- TypeScript
- `react` is an optional peer, needed only by the features that render.

## License

MIT
