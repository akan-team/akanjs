<!-- akan:generated -->

## The Build Pipeline — `pipeline` In `akan.config.ts`

Akan Cloud builds and deploys each app as `build` → `docker` → `deploy`, and `ota` after them when asked. **An app's own stages go in
`apps/<app>/akan.config.ts` under `pipeline`; stages around every app go in the workspace root's
`akan.config.ts`**, typed `WorkspaceConfig`, under its own `pipeline` (`before`, `after`, `post`, `env`, `timeout`). Both are `import type`
objects (or `(ctx) => …`), and `akan pipeline dry-run | validate | plan` turns them into the plan Akan Cloud runs —
locally, running nothing.

```ts
const config: AppConfig = {
  pipeline: { stages: [{ use: "build" }, { name: "Test", sh: "bun run akan test web" }, { use: "docker" }, { use: "deploy" }] },
};
const config: WorkspaceConfig = {
  pipeline: { post: { failure: [{ name: "Notify", sh: "./scripts/notify.sh", secrets: ["DISCORD_WEBHOOK"] }] } },
};
```

- **A declared list is the whole pipeline.** Without `pipeline` an app runs the three actions; with it, write them
  — a list without `{ use: "deploy" }` never deploys. Each action appears at most once, in that order, and
  `docker` needs a `build` before it (the image is made from that build).
- **`{ use: "ota" }` ships the native web bundle over the air**, after `deploy` so the API it calls is already up.
  It is opt-in, makes its own CSR build, and packs every native target that declares `native.updates` for iOS
  and Android — `targets` and `platforms` narrow it, and a target without `updates` is a plan error. Akan Cloud
  signs and publishes the packs; the plan never holds a key.
- **A stage runs after the action before it.** Stages between two actions share a phase across apps, and a phase
  waits for every stage of the one before; `deploy` runs the apps one at a time in `after` order.
- **App stages stand on their own.** Never rely on what a root `before` stage left on disk: the root config never
  travels to a subspace, so an app built there runs its own stages only. Keep the files an app stage needs inside
  the app or its libs.
- **Secrets are named and write-only.** `akan upload-secret <NAME>` stores one per project (`--branch` for a
  branch-only value); a step lists it in `secrets` and reads `$NAME`. Anyone who can push to the repo can make a
  step print it — the GitHub Actions model — so push access is secret access.
- **`allowFailure` only means "this failure does not fail the run"**; how the run is reported is Akan Cloud's
  call. `env` and secret names may not be `CI`, `AKAN_CI_*` or shell names such as `PATH`, and every step gets
  `AKAN_CI_BRANCH`, `AKAN_CI_APP` and the rest of the build's facts.
- `akan pipeline` exits 0 with a plan, 1 with an envelope of errors, and 2 for anything else (no envelope). A lib
  config takes no `pipeline`; the root config takes no app or lib settings.
