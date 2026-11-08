# create-akan-workspace

[한국어](https://github.com/akan-team/akanjs/blob/main/pkgs/create-akan-workspace/README.ko.md) | [Docs](https://akanjs.com/docs/intro/quickstart) | [npm](https://www.npmjs.com/package/create-akan-workspace)

Create a new [Akan.js](https://akanjs.com) workspace with one command.

```bash
bunx create-akan-workspace@latest
```

It installs the `akan` CLI (`@akanjs/cli`, at this package's own version) globally, then runs
`akan create-workspace`, which:

1. asks for a workspace name and an app name, unless you passed them,
2. creates `./<workspace>`, or fills the current folder when the name is `.`, and installs its dependencies,
3. generates the first app with a sample `task` module and pages, unless you pass `--sample false`,
4. writes `AGENTS.md`, `CLAUDE.md` and Cursor rules, and registers the Akan MCP server for Claude Code, Codex and
   Cursor,
5. makes the first git commit, as `Akan.js <noreply@akanjs.com>` when git has no identity configured. In a folder
   another git repository tracks, it commits nothing and leaves the new files for you to commit there.

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

- [Bun](https://bun.sh) `>=1.4.4`
- Git, for the first commit

## Learn More

- [Quick start](https://akanjs.com/docs/intro/quickstart)
- [`akanjs`](https://www.npmjs.com/package/akanjs), the framework
- [`@akanjs/cli`](https://www.npmjs.com/package/@akanjs/cli), the `akan` command

## License

MIT
