# Build Pipeline

- Source: /cheatsheet/dev/pipeline
- Mirror: /llms/pages/cheatsheet/dev/pipeline.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Build Pipeline (#overview)
- Add A Stage To An App (#app-stage)
- Run Steps Around Every App (#workspace-stage)
- Give A Step A Secret (#secret)
- Check Before You Push (#check)
- Pitfalls (#pitfalls)

## Content

Build Pipeline

Akan Cloud builds and deploys each app as `build`, `docker`, then `deploy`. Add your own stages around them in `akan.config.ts`, and check the result with `akan pipeline dry-run` before you push.

Words used on this page

Term

- stage: One named step of a build, such as a test run, with one or more shell commands.

- build, docker, deploy: The built-in actions Akan Cloud runs for an app; you place them with `{ use }`.

- plan: What one build runs, made from your config; `akan pipeline` shows it locally.

Two files

- App — apps/<app>/akan.config.ts — That app's stages in order, its three actions included.

- Workspace — akan.config.ts — Stages before and after every app, and the steps that close a build.

Steps

Add a stage to an app.

Run steps around every app.

Give a step a secret.

Check the plan before you push.

Add A Stage To An App

Declare `pipeline` in the app's config. The list replaces the default, so write the three actions with your stage where it belongs:

**The position decides the moment.** Test sits after `build`, so it runs once every app has built and before any image is made.

**Run it only sometimes.** `when: { branch: "main" }` or `when: { changed: ["apps/web/**"] }` runs a stage only on that branch or after those paths change.

**Let a check fail softly.** `allowFailure: true` keeps a failing stage from failing the build.

Every stage and step key is in App Config › Pipeline.

Run Steps Around Every App

Work that belongs to no single app, such as a workspace lint, an end-to-end suite or a chat notification, goes in the workspace root's `akan.config.ts`:

**`before` runs first, `after` runs last.** A `before` stage runs ahead of every app stage, and an `after` stage behind every app's last one.

**`matrix: "apps"` copies a stage per app.** Each copy sees its app in `$AKAN_CI_APP`.

**`post` follows the result.** The steps under `success`, `failure` or `canceled` run for how the build ended, then those under `always`.

Give A Step A Secret

A step reads a credential, such as a webhook URL, as an environment variable. Upload it once from the workspace root:

Then name it in the step's `secrets`, as the `Notify` step above does, and read `$DISCORD_WEBHOOK` in the script.

**The value is write-only.** It comes from a hidden prompt, piped stdin or `--file`, and no command shows it again.

**A branch can have its own value.** `--branch main` sets one that only `main` builds use, over the every-branch value.

**Only the steps that ask get it.** A step without the name in `secrets` never sees the value.

**Anyone who can push to the repository can read a secret.** A step they add can print it, the same model as GitHub Actions secrets, so treat push access as access to every secret.

Check Before You Push

`akan pipeline` makes the same plan Akan Cloud would, from the same files, and runs nothing:

**`validate` lists what is wrong.** Each error or warning names its file and a code such as `pipeline.action.dockerWithoutBuild`, and errors end the command with code 1.

**Flags stand in for the build.** `--branch`, `--apps` and `--trigger` show what a given build would run; see the Pipeline CLI.

Pitfalls

**The list is the whole pipeline.** An app whose `pipeline` leaves out `{ use: "deploy" }` builds but never deploys.

**App stages stand on their own.** Never rely on what a root `before` stage left on disk: an app built from a repository mirrored out of this workspace (a subspace) carries only its own config, so the root stages do not run there.

**A subspace lacks root-only paths.** A stage that calls a script kept only at the workspace root, such as `scripts/` or `infra/`, fails there; keep what an app stage needs inside the app or its libraries.

**Secrets belong to one project.** A subspace builds in a project of its own, so upload the secrets its steps read to that project as well.

## Code Examples

### apps/web/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  pipeline: {
    stages: [
      { use: "build" },
      { name: "Test", sh: "bun run akan test web" },
      { use: "docker" },
      { use: "deploy" },
    ],
  },
};

export default config;
```

### akan.config.ts

```ts
import type { WorkspaceConfig } from "akanjs";

const config: WorkspaceConfig = {
  pipeline: {
    before: [{ name: "Lint", sh: "bun run lint" }],
    after: [
      {
        name: "E2E",
        matrix: "apps",
        sh: "bun run e2e $AKAN_CI_APP",
        allowFailure: true,
      },
    ],
    post: {
      failure: [
        {
          name: "Notify",
          sh: "./scripts/notify.sh",
          secrets: ["DISCORD_WEBHOOK"],
        },
      ],
    },
  },
};

export default config;
```

### Terminal

```bash
akan upload-secret DISCORD_WEBHOOK
akan list-secrets
```

### Terminal

```bash
akan pipeline dry-run --branch main
# plan v1 · branch main · env main · trigger manual · apps api, web
# from akan.config.ts, apps/api/akan.config.ts (default), apps/web/akan.config.ts
#
# prepare  (executor)                 checkout · env · install · plan
# prepare  lint          Lint         bun run lint
# build    build         Build        ‖ api · web
# verify   after-build   After build  web:Test  bun run akan test web
# package  docker        Docker       ‖ api · web
# deploy   deploy        Deploy       → api, web (one at a time)
# finish   e2e           E2E          ‖ api (may fail) · web (may fail)
# finish   post.failure               Notify
# finish   (executor)                 cleanup
#
# secrets required: DISCORD_WEBHOOK
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

