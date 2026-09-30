# Structure

- Source: /conventions/workspace/structure
- Mirror: /llms/pages/conventions/workspace/structure.md
- Section: conventions
- Category: Workspace
- Priority: P1

## Headings

- Workspace Anatomy (#workspace-anatomy)
- Workspace Commands (#workspace-commands)

## Content

Structure

Workspace Anatomy

An Akan workspace is one Bun-first monorepo. The top-level folder a piece of code sits in says what it is: a product you run, a library apps share, or a package.

A workspace root looks like this:

Which folder does my code go in?

Code

apps/

libs/

pkgs/

- Runs as one product

  - customer site · admin portal · brand app: A product you run and deploy on its own.

  - business code one app uses: Its pages, modules and UI stay inside that app.

- Shared by several apps

  - auth · upload · billing · notification: A common domain that more than one product needs.

  - shared utilities and UI: Helpers and components that several apps import.

- Akan itself, or an installable package

  - framework · CLI · devkit · runtime: Code that belongs to Akan itself, and package-level tooling.

  - a standalone package: Code that should behave like a package you install.

Goes here

Not here

**Start in `apps/`.** Code that belongs to one product stays in its app. Move it to `libs/` once a second app needs it.

**Reach for `pkgs/` last.** Use it only when the code has to stand alone, like a package someone installs.

**`libs/` and `pkgs/` appear when you need them.** A new workspace starts with one app; `create-library` and `create-package` add the other two.

Files at the root

File

- .env: Workspace-wide settings such as `AKAN_PUBLIC_ENV` and the serve domain, kept out of git.

- package.json: Root dependencies and the `bun run` scripts such as `dev`, `lint`, `test` and `build`.

- tsconfig.json: TypeScript settings and the `@apps/*` and `@libs/*` import aliases.

- biome.json: One set of format, import and lint rules for every app, lib and package.

- bunfig.toml: Bun's own config, which adds the Tailwind plugin and the `AKAN_PUBLIC_*` browser env prefix.

- AGENTS.md, CLAUDE.md: Coding-agent guide; `CLAUDE.md` points to `AGENTS.md`, which `akan agent install` refreshes.

`.akan/`, `dist/` and `node_modules/` are written by the tools and gitignored, so you do not edit them by hand.

Workspace Commands

Workspace commands act on the monorepo as a whole. They create the workspace and its apps, libraries and packages, then keep them linted and in sync.

The ones you will use most:

bunx create-akan-workspace@latest # a new workspace and its first app akan create-application myapp # adds apps/myapp akan create-library shared # adds libs/shared akan create-package --name renderer # adds pkgs/renderer akan lint myapp # sync and lint one app, lib or package akan lint-all # sync and lint everything akan sync-all # sync every lib, then every app

Creating

Command

What you get

- akan create-workspace <name> — A new workspace folder with its first app, agent rules and MCP config.

- akan create-application <app-name> — A runnable app in `apps/<app-name>/`.

- akan create-library <lib-name> — A library that apps can share, in `libs/<lib-name>/`.

- akan create-package --name <pkg-name> — `pkgs/<pkg-name>/`, plus a `<pkg-name>` import alias in `tsconfig.json`.

**`bunx create-akan-workspace@latest` is the first step.** It installs the `akan` CLI and runs `akan create-workspace` for you. `--libs true` also installs the `util` and `shared` libraries.

**A missing name is asked for.** Leave out the name and the CLI prompts for it. Names are lowercased, and spaces become `-`.

Lint and sync

sync

lint

- One target

  - akan lint <target>: One app, lib or package; a package is linted without a sync.

- Whole workspace

  - akan lint-all: Syncs every app and lib, then lints every app, lib and package.

  - akan sync-all: Syncs every lib, then every app, without linting.

Runs

Skipped

**`sync` refreshes an app or library.** It rescans the source and rewrites its generated files, dependencies and configuration.

**Command names are kebab-case.** It is `akan lint-all`, not `akan lintAll`.

**Run these commands from the workspace root.** That is the folder holding `package.json`, `tsconfig.json` and `.env`; anywhere else the command stops with an error. `create-workspace`, which makes that folder, is the exception.

Workspace CLI

Every option of `create-workspace`, `lint`, `lint-all` and `sync-all`.

Format & Lint

What `akan lint` checks, and how to fix the first errors you meet.

Folder Rule

The folders inside an app or library, and when code moves outward.

## Code Examples

### my-workspace/

```bash
.
├── apps/
│   └── myapp/
├── libs/
│   └── shared/
├── pkgs/
├── .env
├── package.json
├── tsconfig.json
├── biome.json
├── bunfig.toml
├── AGENTS.md
└── CLAUDE.md
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

