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

The service at `https://cloud.akanjs.com` that holds your account, env values and tunnels.

env values

Each app's and library's `env/env.client.<env>.ts` and `env/env.server.<env>.ts`, kept out of git.

The cloud workspace id in the root `.env`, which decides where env values are kept.

SCP server

A server of your own, reached over SSH, that keeps env values when there is no cloud workspace.

Account

Signs in through the browser and saves the session.

Deletes the saved session without contacting the cloud.

Framework

Installs from npm, or from a local registry with `--registry local`.

Env values

Pulls env values from Akan Cloud or an SCP server, whichever the workspace uses.

Pushes the local env values to that same place for the next `download-env`.

`AKAN_WORKSPACE_ID` is set

The cloud workspace with that id, after signing in if needed.

`AKAN_WORKSPACE_ID` is empty

`~/secrets/<repo>/env.tar` on a server you pick from a list.

Akan Cloud to use; `http://localhost:8283` in the framework repo (`USE_AKANJS_PKGS=true`).

Akan Cloud to use when `AKAN_WORKSPACE_ID` is set; ignored for an SCP server.

where

Akan Cloud when the root `.env` sets `AKAN_WORKSPACE_ID`, otherwise an SCP server.

`akan login [--host <host>]`

Sign in to Akan Cloud from this machine. The CLI opens a sign-in page in the browser and waits until you finish there.

browser

Prints the sign-in URL and a QR code and opens it; visit the URL yourself if no browser opens.

time limit

Gives up after 10 minutes without a sign-in, so run it again.

already signed in

Prints the account's nickname and exits without opening the browser.

expiring session

Renewed first, near or past its expiry; only a failed renewal opens the browser.

saved to

`~/.akan/config.json`, one session per host, readable only by you.

used by

`akan tunnel` and `akan start --share` need it, while the env commands sign in on their own.

`akan logout [--host <host>]`

Sign out of Akan Cloud on this machine. Use it to switch accounts, or to take this machine's cloud access away.

clears

Only the session saved for that `--host`, leaving other hosts signed in.

not signed in

Prints that no session was found and changes nothing.

`akan update [--tag <tag>] [--registry <npm|local>]`

Move the global `akan` CLI and this workspace's Akan.js packages to the newest version of a release tag. Use `latest` for normal updates, and `beta`, `rc` or `canary` only when you mean to test that channel.

Release channel to install from.

`local` is `AKAN_NPM_REGISTRY`, or `http://127.0.0.1:4873` when it is unset.

In a workspace, pins root `akanjs` and `@akanjs/devkit` to that version and runs `bun install`.

global install

Installs `@akanjs/cli@<tag>` globally with `bun add -g`, and prints `akan --version` at the end.

Tries a framework build from a local registry before it is published to npm.

framework repo

With `USE_AKANJS_PKGS=true`, `--registry` has no default, so the CLI asks.

`akan download-env [--host <host>]`

Download the env values of every app and library in this workspace. Run it after cloning and whenever someone uploads a change, because env values are never committed.

files

Unpacked at the workspace root, over the same paths `upload-env` packed.

first SCP run

Asks for a server name and host, plus an optional username and SSH port.

server list

Kept in `~/.akan/config.json`, so later runs let you pick, add or remove a server.

`akan upload-env [--host <host>]`

Upload the env values of every app and library to where `download-env` reads from. The stored archive is replaced whole, so download first instead of uploading a stale local copy.

env files

`env/env.client.<env>.ts` and `env/env.server.<env>.ts`, without the `type` and `example` files.

Also every file matched by an app's `secrets` globs in `akan.config.ts`.

Each upload writes those `secrets` patterns into a managed block of `.gitignore`.

no files

Stops with an error when there is no env file to upload.

Five optional commands for signing in to Akan Cloud, updating the framework and moving env values. Internal deployment commands are left out of this page on purpose.

Words Used on This Page

Term

Where Each Command Connects

Command

This machine only

Connects

Does not connect

Where Env Values Are Kept

Store

Used when

Where the archive lives

Related Pages

Application Env

What goes in the `env/` files these commands move.

Declare extra secret files that travel with the env values.

Tunnel CLI

Share a local app on a public URL with the `akan login` session.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

