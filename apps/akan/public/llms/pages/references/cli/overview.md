# Commands

- Source: /references/cli/overview
- Mirror: /llms/pages/references/cli/overview.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- CLI Commands (#cli-commands)
- Shared Behaviour (#shared-behaviour)
- Validation Order (#validation-order)
- Command Index (#command-index)

## Content

Commands

Command

CLI Commands

The `akan` CLI runs the whole workspace lifecycle: creating workspaces and apps, generating code, local development, mobile builds, local databases and optional cloud helpers.

This page is the index. Each group links to a detail page with argument tables, option tables, notes and terminal examples.

Reading a command line

Notation

- <app>: A value the command needs. Leave it off and the command asks for it.

- [filename]: An optional value. The command runs without it.

- <app|lib|pkg>: `|` means or: the name of an app, a library or a package.

- <sys:module>: An app or lib and a module, joined by a colon: `myapp:icecreamOrder`.

- [apps...]: One or more app names, space- or comma-separated, or `all` for every app.

- --name <value>: An option. Words are joined with dashes: `--max-diagnostics 0`.

- --fix false: A boolean option takes `true` or `false`. The flag alone means `true`.

- --no-write: A boolean option that defaults to `true` also takes `--no-<name>` to turn it off.

Shared Behaviour

These hold for every command, so the detail pages do not repeat them.

- Verbose Output — Every command accepts it. It prints the output of each process the command runs, which a spinner normally hides.

- Help — Prints the command's arguments and options with their defaults and choices. Bare `akan` lists every command.

- Run From The Workspace Root — Run every command except `create-workspace` from the folder that holds these three files. Anywhere else it stops with an error.

- Short Aliases — Nine commands also answer to the first letter of each dashed word. The table below lists all of them.

Alias

Runs

- akan s — akan start

- akan b — akan build

- akan t — akan typecheck

- akan bi — akan build-ios

- akan ba — akan build-android

- akan bd — akan build-desktop

- akan si — akan start-ios

- akan sa — akan start-android

- akan sd — akan start-desktop

When a value is left off

A value left off is filled from its default, or the command asks you for it.

Left off

What the CLI does

- A value with a default — The default is used: `akan quality` runs `quality scan`.

- An optional value — It stays empty, and the command runs without it.

- `<app>` — Picked from a list. A workspace with only one app uses it without asking.

- `<lib>` `<pkg>` `<app|lib>` `<sys:module>` — Picked from a list. A module takes two picks: the app or lib, then the module.

- `[apps...]` of `akan start` — A checklist opens with your last choice ticked. A workspace with one app skips it.

- Anything else — A prompt asks for it: you type it, pick a choice, or answer yes or no.

Validation Order

Before you call a change done, run these five in order. It is the order the workspace's agent guide, `AGENTS.md`, prescribes.

- akan sync <app|lib> — Updates dependencies, config and generated files. Needed after adding, renaming or deleting a file.

- akan lint <app|lib|pkg> — Formats and lints with Biome, including Akan's convention rules.

- akan typecheck <app> — Checks TypeScript types across the app.

- akan test <app|lib|pkg> — Runs the test suites.

- akan build <app> — Builds the production output.

Reports, not gates

These three only print a report, so they never fail the run. Read them before a review.

- doctor --strict --format json: Lists where the workspace drifts from conventions. `--strict` counts recommended ones as errors.

- quality scan: Lists code-shape warnings across every app and lib.

- quality ssr: Prints each app's and lib's server render share. The floor is 50%, and a drop is a regression.

Command Index

Every name below follows `akan`, as in `akan lint myapp`. Open a group title for its arguments, options and examples.

Internal and development-only commands are left out on purpose.

- Workspace — Create a workspace, and lint and sync everything in it at once.

- Application: Develop — Create and remove apps, run them locally, and look into a running server.

- Application: Check And Build — Typecheck, test and build before a change ships.

- Application: Mobile — Build, run and release the iOS, Android and desktop apps on the native runtime.

- Library — Create, install, remove and sync the shared libraries that apps use.

- Module — Generate database modules, service modules, and a module's optional UI files.

- Scalar — Create value types that live inside other models and have no database table of their own.

- Package — Create, build and verify the packages under `pkgs/`.

- Page — Generate CRUD routes in an app for a module that already exists.

- Primitive — Add one piece to a module that already exists: a UI file, a field, or an enum field.

- Workflow — Plan a change, read the plan, apply it, validate the result, and repair what validation caught.

- Quality — Report code-quality warnings for every app and lib, and measure each one's server render share.

- Cloud — Optional helpers: Akan Cloud sign-in, environment transfer and framework updates.

- Tunnel — Share a locally running app on a public URL as a command of its own, outside a dev session.

- Context And MCP — Hand coding agents the workspace context, convention diagnostics and the Akan MCP tools.

- Agent Rules — Install the rule files that editors and coding agents read.

- Code Agent — Run the Akan coding agent in the terminal, with the workspace's own tools and skills.

- Guideline — Print the Akan guidelines that coding agents read.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

