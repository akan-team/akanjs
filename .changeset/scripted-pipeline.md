---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

Apps declare their build pipeline in `akan.config.ts`. `pipeline: { stages, env, after }` in an app's config lists its stages in order — the built-in `{ use: "build" | "docker" | "deploy" }` actions plus shell stages (`{ name, sh | steps }` with `when`, `env`, `secrets`, `timeout`, `retry`, `allowFailure`) — and an app without one runs build → docker → deploy as before. A new workspace-root `akan.config.ts`, typed `WorkspaceConfig`, holds the stages around every app: `pipeline: { before, after, post, env, timeout }`, with `parallel` and `matrix: "apps"` stages. `akan pipeline dry-run | validate | plan` turns both into the plan Akan Cloud runs, locally and without running anything; it exits 0 with a plan, 1 with an envelope of errors and 2 for anything else. `akanjs/common` exports the plan schema and its strict parser (`PipelinePlanSchema`).

`akan upload-secret <NAME>`, `akan list-secrets` and `akan remove-secret <NAME>` manage write-only pipeline secrets per project, optionally per branch (`--branch debug|develop|main`). A value comes from `--file`, piped stdin or a hidden prompt, never from an argument. A step lists the names it reads in `secrets`. Anyone who can push to the repository can make a step print a secret, as with GitHub Actions secrets.

Upgrade note: `akan.subspace.ts` is no longer read. Move its content under `subspace` in the workspace-root `akan.config.ts` (`const config: WorkspaceConfig = { subspace: { … } }`). The root config never travels to a subspace.

Upgrade note: delete `akan.subspace.ts` after moving its content. `akan subspace push` and `akan subspace pull` refuse while it is still at the workspace root, and a push removes any copy of it from the subspace.
