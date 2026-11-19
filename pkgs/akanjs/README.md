# Akan.js

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/README.ko.md) | [Docs](https://akanjs.com/docs) | [v3 release note](https://akanjs.com/blog/v3release) | [npm](https://www.npmjs.com/package/akanjs)

<img width="600" alt="Akan.js — one line of business code, every face." src="https://akanjs.com/jelly/og.jpg" />

**The TypeScript framework, agents included.** Powered by Bun.

Akan.js is a full-stack TypeScript framework. One field declaration runs through the schema, service, API, client
state and UI, and the same code ships as a web app, iOS and Android apps, and desktop apps. Every guarded endpoint is
also an MCP tool and every control on screen an in-page agent tool, behind the guards people pass.

## Quick Start

### With your coding agent

Open Claude Code or Codex in an empty directory and paste this prompt. Add your workspace and app names under it,
or let the agent ask.

```text
Set up a new Akan.js workspace for me (https://akanjs.com).

1. Check that Bun 1.4.4 or newer is installed (`bun --version`). If it isn't, install or upgrade it as https://bun.sh describes.
2. Ask me for a workspace name and a first app name, short and lowercase, unless I wrote them below.
3. In this directory, run `bunx create-akan-workspace@latest <workspace> --app <app>`. It installs the akan CLI globally, creates ./<workspace> and installs its dependencies.
4. Inside ./<workspace>, start the dev server in the background with `akan start <app>` and check that the URL it prints (http://localhost:8282 by default) loads.
5. Tell me it's running, and that I should reopen you inside ./<workspace>: the project's Akan MCP server and AGENTS.md rules load from there.
```

The new workspace already carries what the agent works through: `AGENTS.md` and `CLAUDE.md`, Cursor rules, and the
Akan MCP server registered for Claude Code, Codex and Cursor. Reopen the agent inside the workspace so it loads them.

### In a terminal

Requires [Bun](https://bun.sh) `>=1.4.4`.

```bash
bunx create-akan-workspace@latest
cd <workspace-name>
akan start <app-name> --open
```

The creator asks for a workspace name and an app name, installs the `akan` CLI and the workspace's dependencies, and
generates a sample app. The app opens on `http://localhost:8282`.

### Inside an existing repository

When a task fixes where the app lives and how it runs, for example a folder in another repository, a host with only
Node and npm, or URLs given by a spec, a coding agent needs these, and nothing has to ask:

- **Create the workspace in that folder:** `bunx create-akan-workspace@latest . --app <app> --dir <folder> --sample false`.
  It writes into `<folder>` itself, refuses to overwrite a file already there, and leaves out the sample module and
  pages. Keep the `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.cursor/` and `.mcp.json` it writes: they carry
  the rules and tools an agent works through.
- **Work from `<folder>`.** `akan` runs only from the workspace root, and an agent session opened there loads the
  workspace's rules and MCP server.
- **Check each change with `akan verify <app>`.** It syncs, lints, typechecks, builds and checks SSR, and prints only
  what failed. `akan preview <app> --changed` opens the pages a change reaches.
- **Exact URLs:** pages live under `/<locale>/…`. To serve the default locale at the bare path (`/books/OL45804W`),
  set `i18n: { defaultLocale: "en", locales: ["en"], localePrefix: "as-needed" }` in `akan.config.ts`; `<Link>`
  follows.
- **A host with only Node and npm:** `npx -y bun@1.4.4 x create-akan-workspace@latest . --app <app> --dir <folder> --sample false`,
  then `npm run build` and `PORT=3000 npm start`. The
  [`create-akan-workspace` README](https://www.npmjs.com/package/create-akan-workspace#with-only-node-and-npm) has the
  scripts it writes and what a fresh clone needs.
- **Build for where it runs.** A variable set in the shell, or in a `.env.local` Bun loads, outranks the workspace `.env`
  (an empty one counts as unset, and the build names each one it took), and `--env` outranks both for `AKAN_PUBLIC_ENV`. A new workspace's `.env` says `local`, which suits your own machine or a test runner, but the
  server runs without endpoint rate limits and on local defaults. For a host others can reach, run
  `akan build <app> --env main` with `AKAN_PUBLIC_REPO_NAME` and `AKAN_PUBLIC_SERVE_DOMAIN` (the domain it serves) set
  in the shell or the workspace `.env`.

## Your First App

- **A screen** is a file under `apps/<app>/page/`: `<route>.tsx` or `_index.tsx`, `_layout.tsx` around it, `[id]/`
  for a segment. It exports one `page()` chain from `akanjs/client`. [Routing](https://akanjs.com/docs/core/routing)
- **A stored model** is a module under `lib/<model>/`, made by `akan create-module <model> <app>`. A service with no
  stored model, such as an outside API, goes under `lib/_<service>/` with `akan create-service <service> <app>`.
  [File rules](https://akanjs.com/docs/core/file-rule)
- **The rules** a coding agent follows are in the workspace: `AGENTS.md`, `.claude/rules/akan/`, and the skills in
  `.claude/skills/` and `.agents/skills/`. `akan guideline show <name>` prints any bundled guideline.
- **`akan.config.ts`** may stay empty. It grows only for routes, domains, locales, database modes or native apps.
  [Configuration](https://akanjs.com/docs/core/config)

## Build And Run

```bash
akan start <app>                            # dev server, http://localhost:8282
akan verify <app>                           # sync, lint, typecheck, build and SSR check
akan build <app>                            # production build in dist/apps/<app>
cd dist/apps/<app> && PORT=3000 bun main.js
```

[Akan Cloud](https://cloud.akanjs.com) runs Akan apps: `akan login` signs in, and `akan tunnel <app>` shares the app
you are running on a public URL.

## Learn More

- [akanjs.com](https://akanjs.com): what one line of code reaches, the screen as an agent's interface, and your server
  as an MCP server.
- [Docs](https://akanjs.com/docs), the [CLI reference](https://akanjs.com/references/cli/overview), and
  [`llms.txt`](https://akanjs.com/llms.txt). Connect a coding agent to `https://akanjs.com/mcp` to read the docs while
  it writes code.
- [MCP](https://akanjs.com/cheatsheet/interface/mcp) and the [in-page agent](https://akanjs.com/cheatsheet/interface/agent-chat):
  guards, refusals, rate limits and model setup.
- [v3 performance](https://akanjs.com/blog/v3release#v3-performance): the numbers against v2 and how they were measured.
- `akanjs` is one npm package. Its subpaths (`akanjs/base`, `akanjs/client`, `akanjs/signal`, `akanjs/ui`, …) keep
  server-only, client-only, UI and tooling code apart, and the [package reference](https://akanjs.com/references/akanjs/base)
  covers them; the tooling ships as `@akanjs/cli` and `@akanjs/devkit`.
- Changes by version: [`CHANGELOG.md`](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CHANGELOG.md) and the
  [releases](https://github.com/akan-team/akanjs/releases). The package does not carry the file.
- Contributing: [`CONTRIBUTING.md`](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CONTRIBUTING.md) and
  the [code of conduct](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/CODE_OF_CONDUCT.md). License: MIT
  ([`LICENSE`](https://github.com/akan-team/akanjs/blob/main/pkgs/akanjs/LICENSE)).
