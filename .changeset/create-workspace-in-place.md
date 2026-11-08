---
"@akanjs/cli": patch
"@akanjs/devkit": patch
"create-akan-workspace": patch
---

`akan create-workspace` and `bunx create-akan-workspace` can now create a workspace in a folder you already have, leave out the sample code, and make the first commit on a machine with no git identity. Before, a coding agent that had to put the workspace in a given folder created it elsewhere, copied it over and deleted the sample by hand.

- **In place.** Name the workspace `.` to create it in the current folder, or in `--dir` itself, instead of a new `<dir>/<name>` subfolder. The workspace takes that folder's name.

  ```bash
  bunx create-akan-workspace . --app web             # the current folder
  bunx create-akan-workspace . --app web --dir app   # ./app
  ```

  The folder may already hold files the workspace does not write, such as `.git`, `.vscode/launch.json` or notes. When it holds one the workspace would overwrite, such as `package.json`, `README.md`, `.gitignore` or `apps/<app>`, the command writes nothing and lists them. The same check now guards `<dir>/<name>`, which was overwritten without a word before. It also refuses your home folder and a filesystem root, where the first commit would take in every file and the agent and MCP settings would overwrite your global ones. And it refuses a folder whose path ends the way a path it writes begins, such as `apps`, `patches`, or `apps/web` with `--app web`, since the files would land in the wrong place.
- **`--sample false`** creates the first app without the sample: the `task` module and its pages, the `_noti` service, the `workHistory` scalar, and the sample helpers in `common/`, `webkit/`, `srvkit/` and `ui/`. It defaults to `true`, as before.

  ```bash
  bunx create-akan-workspace my-company --app web --sample false
  ```

- **Git.** When git has no identity configured, as in many containers and CI images, the first commit is made as `Akan.js <noreply@akanjs.com>` instead of failing; once `user.name` and `user.email` are set, `git commit --amend --reset-author` makes it yours. In a folder another git repository tracks, the scaffold no longer runs `git init`, which made the outer repository record a gitlink instead of the files, and it commits nothing there: the new files are left for you to commit in that repository. A folder that repository ignores, as `app/` or `app/*` does, still gets its own repository and commit.
- **`@akanjs/devkit`**: `applyTemplate` takes `dryRun` to list the files a template would write without writing them, and `WorkspaceExecutor.commit` takes an `identity` to commit under.
