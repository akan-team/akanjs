# create-akan-workspace

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/create-akan-workspace/README.ko.md) | [Docs](https://akanjs.com/docs/intro/quickstart) | [npm](https://www.npmjs.com/package/create-akan-workspace)

Create a new [Akan.js](https://akanjs.com) workspace with one command.

```bash
bunx create-akan-workspace@latest
```

On a host with only Node and npm, run it through npx. It puts nothing on `PATH`; the `akan` CLI goes to Bun's
global folder (`~/.bun` by default) ([details](#with-only-node-and-npm)):

```bash
npx -y bun@1.4.4 x create-akan-workspace@latest
```

## What It Does

All of it, so a coding agent has nothing to read from the package before running it:

- **One global install.** `bun install -g @akanjs/cli@<this package's version>` puts the `akan` CLI in Bun's global
  folder (`~/.bun` by default), then `akan create-workspace` does the rest. Nothing else is written outside the
  workspace folder.
- **Files, in the workspace folder only.** `./<workspace>`, or the folder itself when the name is `.`. It gets the
  root config (`package.json`, `.env`, `.gitignore`, `tsconfig.json`, `biome.json`, editor settings), the first app in
  `apps/<app>/` with a sample `task` module and pages unless you pass `--sample false`, and the coding-agent files:
  `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.cursor/`, `.codex/config.toml` and `.mcp.json`, which register
  the Akan MCP server for Claude Code, Codex and Cursor. A file already there is never overwritten: the command stops
  and names it. Your home folder and a filesystem root are refused.
- **One command in it.** `bun install`, unless you pass `--init false`. It builds nothing and starts no server.
- **Network.** The npm registry, or the one `--registry` names: the CLI, the workspace's dependencies and one
  version lookup. `--libs true` also fetches the Akan.js repository when the installed `akanjs` package does not carry the
  two libraries.
- **Git.** In a folder no repository tracks, `git init` and a first commit, as `Akan.js <noreply@akanjs.com>` when git has
  no identity configured. In a folder another git repository tracks, no `git init` and no commit: the new files are
  left for you to commit there.
- **Questions.** A workspace name and an app name, each asked only when it was not passed.

Then start the app. It opens on `http://localhost:8282`.

```bash
cd <workspace>
akan start <app> --open
```

## With Your Coding Agent

Pass both names and nothing is asked, so a coding agent can run it on its own:

```bash
bunx create-akan-workspace@latest my-company --app web
```

The [quick start](https://akanjs.com/docs/intro/quickstart) has a prompt to paste into Claude Code or Codex that
checks Bun, runs this, and starts the app. Reopen the agent inside the new workspace afterwards: its MCP server and
rules load from there.

## With Only Node and npm

The creator needs Bun, and npx can supply it for the one run. Pass the names so nothing is asked:

```bash
npx -y bun@1.4.4 x create-akan-workspace@latest . --app <app> --dir <folder> --sample false
```

That Bun is not on `PATH` afterwards, nor is the `akan` it installed, so the creator lists `bun` in the workspace's
`dependencies` and writes two package scripts. Build with `npm run build`, start the build with
`PORT=3000 npm start`, and run any other command as `npx akan …`.

```json
"build": "akan build <app>",
"start": "cd dist/apps/<app> && bun main.js"
```

A fresh clone builds as is: the env files stay gitignored and `akan` writes the ones it lacks, so commit none. The
build carries the env it needs, and a variable set at start overrides it.

## In an Existing Folder

Name the workspace `.` to create it in the current folder, or in `--dir` itself, instead of a new subfolder. The
workspace takes the folder's name. The folder may already hold files the workspace does not write, such as `.git` or
notes. When it holds one the workspace would overwrite, such as `package.json` or `README.md`, nothing is written and
the command names the files to move away.

```bash
bunx create-akan-workspace@latest . --app web                # the current folder
bunx create-akan-workspace@latest . --app web --dir app      # ./app
bunx create-akan-workspace@latest my-company --app web --sample false   # no sample module or pages
```

## Options

| Option | Description | Default |
| --- | --- | --- |
| `[org]` | Workspace (organization) name, or `.` for `--dir` itself | asked |
| `-a, --app <name>` | First application name | asked |
| `-d, --dir <path>` | Directory to create the workspace in, as `<dir>/<org>` | `.` |
| `-l, --libs <boolean>` | Also install the `shared` and `util` libraries (admin, user, file, and more) | `false` |
| `-i, --init <boolean>` | Install the workspace's dependencies | `true` |
| `-s, --sample <boolean>` | Generate the sample `task` module, pages and helpers in the first app | `true` |
| `-r, --registry <url>` | npm registry for the Akan packages (or `AKAN_NPM_REGISTRY`) | npmjs |
| `-o, --owner <name>` | Owner of the workspace | — |

## Requirements

- [Bun](https://bun.sh) `>=1.4.4`, or Node with npx to run it [as above](#with-only-node-and-npm)
- Git, for the first commit

## Learn More

- [Quick start](https://akanjs.com/docs/intro/quickstart)
- [`akanjs`](https://www.npmjs.com/package/akanjs), the framework
- [`@akanjs/cli`](https://www.npmjs.com/package/@akanjs/cli), the `akan` command

## License

MIT
