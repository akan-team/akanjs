# Pipeline

- Source: /references/cli/pipeline
- Mirror: /llms/pages/references/cli/pipeline.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Pipeline CLI (#pipeline-cli)

## Content

Pipeline

`akan pipeline [plan|validate|dry-run] [--branch <branch>] [--env <env>] [--apps <a,b>] [--trigger <trigger>] [-n <num>] [--commit <sha>] [--out <file>] [--format <text|json>]`

Plan the build pipeline declared in the workspace and app `akan.config.ts` files, without running it. Each flag is a fact about the build: a flag you give is copied into the plan as is, and a missing one comes from git and the workspace.

- action (String, default dry-run, plan | validate | dry-run): `dry-run` shows the plan, `validate` checks it, `plan` prints the envelope.

- --branch (String, default current git branch): Branch the build is for; every `when.branch` is decided against it.

- --env (String, default the branch): `AKAN_PUBLIC_ENV` the build is for.

- --apps (String, default every app): Apps the build covers, comma-separated; an unknown or repeated app is an error.

- --trigger (String, default manual, push | redeploy | initial | rebuild | manual): What started the build; every `when.trigger` is decided against it.

- --build-num (Number, default 0, -n): The build's number, a whole number of 0 or more.

- --commit (String, default HEAD): Commit the build is for.

- --out (String): Also write the envelope to this file, whole or not at all.

- --format (String, default text, text | json): `json` prints the envelope instead of text, for any action.

- nothing runs: No stage runs and nothing is uploaded; Akan Cloud runs the same planner when it builds.

- function form: `validate` runs a function-form `pipeline` for one sample context and warns that others may differ.

- exit code: 0 a plan, 1 errors with the envelope written, 2 anything else with no envelope.

Pipeline CLI

`akan pipeline` turns the pipeline declared in your `akan.config.ts` files into the plan Akan Cloud would run, and runs none of it. Check a change with it before you push.

Words Used on This Page

Term

- plan: The phases, stages and steps one build runs, as JSON that Akan Cloud executes.

- phase: Stages that run together; the next phase starts when every stage of this one ends.

- envelope: `{ ok, plan, diagnostics }`, the result `plan` prints or writes to `--out`.

- diagnostic: An error or warning about a definition, with a code such as `pipeline.action.dockerWithoutBuild`.

Three Actions

Prints

Use it for

- dry-run — The plan as a table, phase by phase. — Seeing what a build would run.

- validate — A one-line verdict and the diagnostics. — Checking a definition before you push.

- plan — The envelope as JSON. — Handing the plan to a program.

Exit Codes

Code

Means

- `0` — A plan was made. — Written, `ok: true`.

- `1` — The definition has errors. — Written, `ok: false`, with the diagnostics.

- `2` — Anything else: not a workspace root, a refused flag, a failed write. — Not written.

**Exit code 1 always comes with an envelope.** A program reading `--out` can trust the file whenever the code is 0 or 1, and treat 2 as no plan at all.

Related Pages

Build Pipeline

Add a test stage, a notification or a secret, step by step.

Every key an app's `pipeline` takes.

Workspace Config

Stages that run before, after and around every app.

## Code Examples

### pipeline

```bash
akan pipeline dry-run --branch main
akan pipeline validate --apps web,api
akan pipeline plan --branch main --trigger push --out plan.json
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

