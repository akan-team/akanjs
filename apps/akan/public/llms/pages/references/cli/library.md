# Library

- Source: /references/cli/library
- Mirror: /llms/pages/references/cli/library.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Library CLI (#library-cli)

## Content

Library

library

A folder under `libs/` holding code several apps share: domain modules, UI or utilities.

template

A ready-made library from Akan.js, such as `shared` or `util`, that `install-library` copies in.

The stamp `install-library` puts in the library's `package.json`: origin, commit or version, hash.

drift

An installed library whose files no longer match the hash in its stamp.

Add a library

Start a new library you fill in yourself.

Copy in a template such as `shared` or `util`.

Keep it current

Refresh the generated files after you change the library.

Check whether installed libraries changed after the install.

Remove

Delete the whole library folder.

A library in `libs/`, such as `util`. Leave it out, or mistype it, to pick one from a list.

`akan create-library <lib-name>`

Create a new shared library in `libs/<lib-name>/` for code several apps reuse. It starts with the standard folders and one empty service module, then runs `sync-library`.

Library name. It is lowercased and spaces become `-`; asked for if left out.

what it creates

Config files, plus the `env/`, `lib/`, `common/`, `srvkit/`, `webkit/` and `ui/` folders.

sample module

`lib/_<lib-name>/` is an empty service module: dictionary, service, signal and store.

one word

Use one lowercase word. A hyphen lands in the sample module's class names and breaks them.

importing

Apps import it as `@libs/<lib-name>/client` or `@libs/<lib-name>/server`; no config to add.

`akan remove-library [lib]`

Remove a library from the workspace by deleting its whole `libs/<lib>/` folder, without asking. Use it when no app should import the library, sync it or depend on it anymore.

what stays

Apps' `@libs/<lib>` imports stay, and so do the packages merged into the root `package.json`.

afterwards

Delete those imports, then run `akan sync <app>` for each app that used the library.

`akan sync-library [lib]`

Regenerate one library's generated files and refresh its dependency list. Run it after you add or rename files, change packages, or edit the library's config.

generated files

`client.ts`, `server.ts`, every `index.ts`, the `lib/` barrels and `akan.lib.json`; never edit them.

packages

Each package the library imports is written into its `package.json` at the root version.

used libraries

The libraries it imports get their generated files refreshed too.

`akan install-library <lib-name>`

Install a ready-made library template such as `shared` or `util` into `libs/<lib-name>/`. You can run it again: the copy overwrites the library source and leaves your testing env alone.

Template name, such as `shared` or `util`; asked for if left out.

source

The installed `akanjs` package when it ships the library; otherwise the Akan.js GitHub repository.

testing env

`env/env.server.testing.ts` is copied from `env.server.example.ts` only when it is missing.

stamp

Writes the `akan.source` stamp that `library-status` compares against.

Merges its packages into the root `package.json`, newer version wins, then runs `bun install`.

git commits

Commits the copy if anything changed, then the merge; each runs `git add .` on the whole tree.

`shared` imports `util`, so install `util` first, as `create-workspace --libs true` does.

`akan library-status [--format <text|json>]`

Report whether each library still matches the source it was installed from. It checks every library in `libs/` and marks each one `clean`, `drifted` or `unstamped`.

`text` is a list for a person to read; `json` is an array with each library's stamp and hash.

The library's files hash to the value in its `akan.source` stamp.

A file changed since the library was installed.

There is no stamp, as with a library made by `create-library`.

compared files

Every file in `libs/<lib>/`, committed or not, except gitignored files and `env/`.

Holds `origin`, `sha` (commit or package version), `hash` and `syncedAt`.

exit code

It only reports: the command succeeds even when a library drifted.

Library CLI

Words Used on This Page

Term

What Each Command Touches

Command

Root `package.json`

Git history

Changed

Untouched

Common Rules

Related Pages

create-workspace

`--libs true` installs `util` and `shared` while it creates the workspace.

akan sync

Takes an app or a library; for a library it runs `sync-library`.

create-module

Add a module to a library: `akan create-module story <lib>`.

Workspace Structure

Where `libs/` sits next to `apps/` and `pkgs/`.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

