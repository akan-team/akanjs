---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A coding agent now checks its work with one command, and the guide it reads on every turn in a new workspace is about 11 KB instead of about 83 KB. The rest moves into path rules and skills that load only when they apply.

**Upgrade note.** After upgrading, run `akan agent install` and commit what it writes: `AGENTS.md`, the scoped `AGENTS.md` files, `.claude/rules/akan/`, `.claude/skills/akan-*`, `.agents/skills/akan-*` and `.cursor/rules/akan-*.mdc`. Your existing `CLAUDE.md` and `.cursor/rules/akan.mdc` pointers are kept. A workspace created before this release can delete `docs/AI-DEVELOPMENT.md` and `docs/GENERATED.md`, which nothing reads anymore; `akan doctor` reports them.

- **`akan verify [targets]`** syncs, lints with fixes, typechecks, fast-builds and checks SSR over what git reports as changed in one run. It prints a single header line plus one line per diagnostic, so a clean run is one line.
  - With no target, the scope is the changed files under `apps/`, `libs/` and `pkgs/`. A changed library is typechecked too, and a framework package is typechecked against its own `tsconfig.json`.
  - Typecheck runs alongside lint. The build runs only when nothing failed before it, and skips its own typecheck.
  - Repeated diagnostics are folded into one line, errors print before warnings, and output stops at 20 lines (`--max <n>`, `0` for all).
  - Each code comment added since the last commit is an `akan.comment.added` warning, so the agent looks at it again before it finishes. `--lint-only` skips this check.
  - `--files` replaces the git scope with an explicit list, `--lint-only` and `--no-build` shorten the run, and `--format json` prints the result as one JSON line. Exit code 0 means it passed, 1 means it failed, 2 means a target is unknown.
  - `akan code` runs it for its `akan_verify` tool and its end-of-turn check. A typecheck failure now reaches the model with its error line; before, the workspace's verbose log level pushed the error out of the output the model saw.
  - Workflow plans validate with `akan verify <target>` instead of `akan sync` then `akan lint`, so `akan workflow apply` and MCP `run_validation` typecheck and build too.
- **`AGENTS.md`** keeps only the rules that apply everywhere and stays under 12 KB. It lists what each path rule and skill covers.
  - A rule enforced by a lint plugin or a maintainability gate names it in parentheses, so a diagnostic's code leads back to its rule.
  - 16 path rules load when a matching file is touched: Claude Code reads `.claude/rules/akan/<area>.md` (`paths:`) and Cursor reads `.cursor/rules/akan-<area>.mdc` (`globs:`).
  - 16 skills hold the procedures: `.claude/skills/akan-*/SKILL.md`, and `.agents/skills/akan-*/` with `references/` holding the full guidelines.
  - `akan agent install` gains the targets `rules`, `skills` and `hooks`. `agents-md` and `all` also write the rules and skills.
  - `akan agent install --check` writes nothing, lists the files install would create, change or remove, and exits 1 if there are any. It ignores the version stamp, so it fits a CI step.
  - A generated file carries an `<!-- akan:generated -->` marker. A file without the marker is yours, so it is never removed and is overwritten only with `--force`. Generated files a newer CLI no longer produces are removed.
  - A new workspace's `.gitignore` keeps `.claude/settings.local.json`, `.claude/worktrees/` and `.claude/scheduled_tasks.lock` out of git.
- **`akan agent install hooks`** adds opt-in Claude Code hooks to `.claude/settings.json`, keeping every other hook in the file. All three hooks run `bun run --silent akan agent hook <event>`.
  - **Before an edit:** an edit to a generated file is refused, with a pointer to edit its source and run `akan sync`.
  - **After an edit:** the file is linted with fixes, and a remaining lint error is sent back.
  - **Before stopping:** what the session edited is checked with `akan verify`. A failure, or a comment added since the last commit, is sent back once.
  - `all` never installs hooks.
- **`akan doctor`** warns with `agent-guide-oversized` when `AGENTS.md` plus the largest app or library `AGENTS.md` passes 80 % of the 32 KiB that Codex reads, and with `agent-guide-leftover` while `docs/AI-DEVELOPMENT.md` or `docs/GENERATED.md` remains or `AGENTS.md` still points to one.
- The `workspaceOnboarding` guideline and the `docs/AI-DEVELOPMENT.md` / `docs/GENERATED.md` workspace templates are removed. The rules from the conventions guideline now come from one source file per area, and `akan guideline show <name>` still prints any guideline.
