# @akanjs/devkit

[Docs](https://akanjs.com/docs) | [npm](https://www.npmjs.com/package/@akanjs/devkit) | [Runtime](https://www.npmjs.com/package/akanjs)

Development tooling primitives for Akan.js.

`@akanjs/devkit` contains the build runners, workspace executors, config loaders, dependency scanners,
frontend artifact builders, command decorators, prompts, and release helpers used by the Akan CLI and by
framework-level tooling. It is intended for tools and package authors, not for application runtime code.

## Install

Most users should install the CLI instead:

```bash
bun install -g @akanjs/cli@latest
```

Install `@akanjs/devkit` directly only when building Akan-aware tooling:

```bash
bun add -d @akanjs/devkit
```

## Usage

```ts
import { ApplicationBuildRunner, WorkspaceExecutor } from "@akanjs/devkit";

const workspace = WorkspaceExecutor.fromRoot();
const app = await workspace.getApp("my-app");
const runner = new ApplicationBuildRunner(app);

await runner.build();
```

## What It Provides

- Workspace, app, library, package, and module executors.
- `akan.config.ts` loading and normalization.
- Application build, typecheck, SSR, CSR, and release runners.
- Dependency scanning and package metadata generation helpers.
- Frontend build transforms and RSC/SSR artifact builders.
- Command/script decorators used by `@akanjs/cli`.
- AI prompt, guideline, and code-generation support utilities.
- Capacitor and mobile release helpers.

## Dev Server Sizing

The dev server bounds its own memory by recycling the processes that grow, and every threshold it uses
can be set from the environment. [`DEV_RUNTIME_KNOBS.md`](./DEV_RUNTIME_KNOBS.md) lists them with their
defaults, the shares they derive from `AKAN_MEMORY_LIMIT`, and what a small container should expect.

## Package Boundary

- Runtime code should import from `akanjs`, including shared config types such as `AppConfig`, `LibConfig`,
  `AppInfo`, and `LibInfo`.
- CLI users should install `@akanjs/cli`; the published CLI bundles this devkit internally.
- Tooling authors can import `@akanjs/devkit` directly when they need Akan workspace introspection or build APIs.

## Requirements

- [Bun](https://bun.sh) `>=1.3.13`
- TypeScript
- Optional peers are only needed for the features that use them, such as Capacitor integration.

## License

MIT
