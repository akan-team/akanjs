# Cloud CLI

- Source: /references/cli/cloud
- Mirror: /llms/pages/references/cli/cloud.md
- Section: references
- Category: references
- Priority: P0

## Headings

- Cloud CLI (#cloud-cli)

## Content

Cloud CLI

Eight optional commands for signing in to Akan Cloud, updating the framework, moving env values and managing pipeline secrets. Internal deployment commands are left out of this page on purpose.

Words Used on This Page

Term

- Akan Cloud: The service at `https://cloud.akanjs.com` that holds your account, env values and tunnels.

- env values: Each app's and library's `env/env.client.<env>.ts` and `env/env.server.<env>.ts`, kept out of git.

- AKAN_WORKSPACE_ID: The cloud workspace id in the root `.env`, which decides where env values are kept.

- SCP server: A server of your own, reached over SSH, that keeps env values when there is no cloud workspace.

- pipeline secret: A named value build steps read as an environment variable; it is written, never read back.

Where Each Command Connects

Command

This machine only

- Account

  - login: Signs in through the browser and saves the session.

  - logout: Deletes the saved session without contacting the cloud.

- Framework

  - update: Installs from npm, or from a local registry with `--registry local`.

- Env values

  - download-env: Pulls env values from Akan Cloud or an SCP server, whichever the workspace uses.

  - upload-env: Pushes the local env values to that same place for the next `download-env`.

- Pipeline secrets

  - upload-secret: Saves a named secret that pipeline steps can read.

  - list-secrets: Lists the secrets' names and scopes, never their values.

  - remove-secret: Removes a secret from the project.

Connects

Does not connect

**Run them from the workspace root.** Like most `akan` commands, they need the folder that holds `package.json`, `tsconfig.json` and `.env`.

**`--host` points at another cloud.** Every command that talks to Akan Cloud takes it, so a self-hosted cloud works with the same commands. `cloud: { host }` in the root `akan.config.ts` makes one the default.

**One sign-in per host, per machine.** The session lives in `~/.akan/config.json`, so every workspace on this machine shares it. `--host` and `cloud.host` are both read as the URL's origin and path without a trailing slash, so a trailing slash, an uppercase host or a default port still names the same session.

**Without a terminal, a missing argument is an error.** When stdin is piped or closed, as in CI, a missing argument or option is not asked for: the command fails at once with an error that says which is missing. A question a command asks while it runs — which script to run, a confirmation, which env server to copy to — fails the same way, naming the option that answers it.

Where Env Values Are Kept

`download-env` and `upload-env` read the root `.env` to pick the store. Both use the same one, so what one uploads the other downloads.

Store

Used when

Where the archive lives

- Akan Cloud — `AKAN_WORKSPACE_ID` is set — The cloud workspace with that id, after signing in if needed.

- SCP server — `AKAN_WORKSPACE_ID` is empty — `~/secrets/<repo>/env.tar` on a server you pick from a list.

**Both directions overwrite.** `upload-env` replaces the stored archive whole, and `download-env` writes over local files at the same paths. Download before you edit, and upload right after.

Pipeline Secrets

**They belong to a project.** The root `.env`'s `AKAN_WORKSPACE_ID` names it, or `--subspace` a subspace's `workspaceId`, and only its members signed in with `akan login` may change or list them.

**A step asks for one by name.** Only a step that lists the name in `secrets` receives it, as an environment variable of that name.

**Anyone who can push to the repository can read a secret.** A step they add can print it, the same model as GitHub Actions secrets, so grant push access as you would grant the secret itself.

Related Pages

Application Env

What goes in the `env/` files these commands move.

Declare extra secret files that travel with the env values.

Build Pipeline

Give a pipeline step a secret it reads at build time.

Tunnel CLI

Share a local app on a public URL with the `akan login` session.

`akan login [--host <host>]`

Sign in to Akan Cloud from this machine. The CLI opens a sign-in page in the browser and waits until you finish there.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use. Left out, `cloud.host` of the root `akan.config.ts`, else `https://cloud.akanjs.com` (`http://localhost:8283` in the framework repo, `USE_AKANJS_PKGS=true`).

- browser: Prints the sign-in URL and a QR code and opens it; visit the URL yourself if no browser opens.

- time limit: Gives up after 10 minutes without a sign-in, so run it again.

- already signed in: Prints the account's nickname and exits without opening the browser.

- expiring session: Renewed first, near or past its expiry; only a failed renewal opens the browser.

- saved to: `~/.akan/config.json`, one session per host, readable only by you.

- used by: `akan tunnel` and `akan start --share` need it, while the env commands sign in on their own.

`akan logout [--host <host>]`

Sign out of Akan Cloud on this machine. Use it to switch accounts, or to take this machine's cloud access away.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use. Left out, `cloud.host` of the root `akan.config.ts`, else `https://cloud.akanjs.com` (`http://localhost:8283` in the framework repo, `USE_AKANJS_PKGS=true`).

- clears: Only the session saved for that `--host`, leaving other hosts signed in.

- not signed in: Prints that no session was found and changes nothing.

`akan update [--tag <tag>] [--registry <npm|local>]`

Move the global `akan` CLI and this workspace's Akan.js packages to the newest version of a release tag. Use `latest` for normal updates, and `beta`, `rc` or `canary` only when you mean to test that channel.

- --tag (String, default latest, latest | dev | canary | beta | rc | alpha): Release channel to install from.

- --registry (String, default npm, npm | local): `local` is `AKAN_NPM_REGISTRY`, or `http://127.0.0.1:4873` when it is unset.

- package.json: In a workspace, pins root `akanjs` and `@akanjs/devkit` to that version and runs `bun install`.

- global install: Installs `@akanjs/cli@<tag>` globally with `bun add -g`, and prints `akan --version` at the end.

- --registry local: Tries a framework build from a local registry before it is published to npm.

- framework repo: With `USE_AKANJS_PKGS=true`, `--registry` has no default, so the CLI asks.

`akan download-env [--host <host>]`

Download the env values of every app and library in this workspace. Run it after cloning and whenever someone uploads a change, because env values are never committed.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use when `AKAN_WORKSPACE_ID` is set, chosen as for `login`; ignored for an SCP server.

- where: Akan Cloud when the root `.env` sets `AKAN_WORKSPACE_ID`, otherwise an SCP server.

- files: Unpacked at the workspace root, over the same paths `upload-env` packed.

- first SCP run: Asks for a server name and host, plus an optional username and SSH port.

- server list: Kept in `~/.akan/config.json`, so later runs let you pick, add or remove a server.

`akan upload-env [--host <host>]`

Upload the env values of every app and library to where `download-env` reads from. The stored archive is replaced whole, so download first instead of uploading a stale local copy.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use when `AKAN_WORKSPACE_ID` is set, chosen as for `login`; ignored for an SCP server.

- where: Akan Cloud when the root `.env` sets `AKAN_WORKSPACE_ID`, otherwise an SCP server.

- env files: `env/env.client.<env>.ts` and `env/env.server.<env>.ts`, without the `type` and `example` files.

- secrets: Also every file matched by an app's `secrets` globs in `akan.config.ts`.

- .gitignore: Each upload writes those `secrets` patterns into a managed block of `.gitignore`.

- no files: Stops with an error when there is no env file to upload.

`akan upload-secret <name> [--branch <debug|develop|main>] [--file <path>] [--subspace <name>] [--host <host>]`

Save a named secret for the pipeline steps of the project `AKAN_WORKSPACE_ID` names, or a subspace's with `--subspace`. The value is write-only: no command shows it again, so keep the original where you keep other credentials.

- name (String, required): Up to 64 uppercase letters, digits and `_`, starting with a letter, such as `DISCORD_WEBHOOK`. A name outside that is refused without being echoed back, since a mistyped name may be the value itself.

- --branch (String, default every branch, debug | develop | main): Use this value only in builds of that branch, over the every-branch value.

- --file (String): Read the value from this file instead of stdin or a hidden prompt.

- --subspace (String): A subspace of the root `akan.config.ts`: the project its `workspaceId` names. Left out, the project `AKAN_WORKSPACE_ID` names.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use. Left out, `cloud.host` of the root `akan.config.ts`, else `https://cloud.akanjs.com` (`http://localhost:8283` in the framework repo, `USE_AKANJS_PKGS=true`).

- value: From `--file`, piped stdin or a hidden prompt; never an argument, which shell history keeps.

- stdin: Reading stdin, it prints one line to stderr saying so, never the value. With stdin piped, a missing `<name>` is an error rather than a prompt, so the pipe is never taken for the name.

- order: The name and `--branch` are checked before the value is read or sign-in starts.

- size: An empty value or one over 64 KiB is refused; one trailing newline is dropped.

- reserved: `CI`, every `AKAN_CI_*` and shell names such as `PATH` are refused.

- takes effect: Builds that start after the upload use the new value.

`akan list-secrets [--branch <debug|develop|main>] [--subspace <name>] [--host <host>]`

List the project's pipeline secrets with their scope and who set each one last. Values are never shown.

- --branch (String, debug | develop | main): Show only what builds of that branch use: its own values and the every-branch ones.

- --subspace (String): A subspace of the root `akan.config.ts`: the project its `workspaceId` names. Left out, the project `AKAN_WORKSPACE_ID` names.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use. Left out, `cloud.host` of the root `akan.config.ts`, else `https://cloud.akanjs.com` (`http://localhost:8283` in the framework repo, `USE_AKANJS_PKGS=true`).

- columns: `NAME`, `SCOPE` (`every branch` or a branch), `UPDATED` and `BY`; a cell the project does not know, such as an unknown last writer, shows `-`.

`akan remove-secret <name> [--branch <debug|develop|main>] [--subspace <name>] [--host <host>]`

Remove a pipeline secret from the project. Builds that start afterwards no longer receive it.

- name (String, required): Name of the secret to remove.

- --branch (String, default every branch, debug | develop | main): Remove that branch's own value; without it, the every-branch value goes.

- --subspace (String): A subspace of the root `akan.config.ts`: the project its `workspaceId` names. Left out, the project `AKAN_WORKSPACE_ID` names.

- --host (String, default cloud.host, else Akan Cloud): The cloud to use. Left out, `cloud.host` of the root `akan.config.ts`, else `https://cloud.akanjs.com` (`http://localhost:8283` in the framework repo, `USE_AKANJS_PKGS=true`).

- not there: Removing a secret that does not exist says so and changes nothing.

## Code Examples

### login

```bash
akan login
akan login --host https://cloud.example.com
```

### logout

```bash
akan logout
akan logout --host https://cloud.example.com
```

### update

```bash
akan update
akan update --tag latest
akan update --tag beta
akan update --registry local
```

### download-env

```bash
akan download-env
akan download-env --host https://cloud.example.com
```

### upload-env

```bash
akan upload-env
akan upload-env --host https://cloud.example.com
```

### upload-secret

```bash
akan upload-secret DISCORD_WEBHOOK
akan upload-secret DEPLOY_KEY --file ./deploy_key --branch main
printf %s "$NPM_TOKEN" | akan upload-secret NPM_TOKEN
```

### list-secrets

```bash
akan list-secrets
akan list-secrets --branch main
```

### remove-secret

```bash
akan remove-secret DISCORD_WEBHOOK
akan remove-secret DEPLOY_KEY --branch main
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

