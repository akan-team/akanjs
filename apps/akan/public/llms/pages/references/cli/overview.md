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

A value the command needs. Leave it off and the command asks for it.

An optional value. The command runs without it.

`|` means or: the name of an app, a library or a package.

An app or lib and a module, joined by a colon: `myapp:icecreamOrder`.

One or more app names, space- or comma-separated, or `all` for every app.

An option. Words are joined with dashes: `--max-diagnostics 0`.

A boolean option takes `true` or `false`. The flag alone means `true`.

A boolean option that defaults to `true` also takes `--no-<name>` to turn it off.

Verbose Output

Every command accepts it. It prints the output of each process the command runs, which a spinner normally hides.

Help

Prints the command's arguments and options with their defaults and choices. Bare `akan` lists every command.

Run From The Workspace Root

Run every command except `create-workspace` from the folder that holds these three files. Anywhere else it stops with an error.

Short Aliases

Seven commands also answer to the first letter of each dashed word. The table below lists all of them.

A value with a default

The default is used: `akan quality` runs `quality scan`.

An optional value

It stays empty, and the command runs without it.

Picked from a list. A workspace with only one app uses it without asking.

Picked from a list. A module takes two picks: the app or lib, then the module.

`[apps...]` of `akan start`

A checklist opens with your last choice ticked. A workspace with one app skips it.

Anything else

A prompt asks for it: you type it, pick a choice, or answer yes or no.

Updates dependencies, config and generated files. Needed after adding, renaming or deleting a file.

Formats and lints with Biome, including Akan's convention rules.

Checks TypeScript types across the app.

Runs the test suites.

Builds the production output.

Lists where the workspace drifts from conventions. `--strict` counts recommended ones as errors.

Lists code-shape warnings across every app and lib.

Prints each app's and lib's server render share. The floor is 50%, and a drop is a regression.

Workspace

Create a workspace, and lint and sync everything in it at once.

Creates a new workspace. `--app <app>` names its first app.

Lints one app, lib or package with Biome and fixes what it can. An app or lib is synced first.

Syncs every app and lib, then lints every app, lib and package.

Syncs every library, then every app.

Application: Develop

Create and remove apps, run them locally, and look into a running server.

Creates a new app under `apps/`.

Removes an app from the workspace.

Updates one app's or lib's dependencies, config and generated files.

Starts the dev server for one or more apps. Alias `s`.

Runs `apps/<app>/script/<filename>.ts`, and asks which file when you leave it off.

Opens an interactive server console.

Tails the running app's logs, filtered by level, endpoint, trace and more.

Starts or stops the local database services.

Copies an app's data out of one database mode and into another.

Configures app settings interactively.

Lists the exact files an app needs to live in a workspace of its own.

Application: Check And Build

Typecheck, test and build before a change ships.

Typechecks the app. Alias `t`.

Prepares and runs the tests of an app, lib or package.

Builds the app for production, frontend and backend together. Alias `b`.

Application: Mobile

Build, run and release the iOS and Android apps with Capacitor.

Builds the iOS or Android app with Capacitor. Aliases `bi` and `ba`.

Runs the app in a simulator, an emulator or on a device. Aliases `si` and `sa`.

Builds and packages a release for the App Store or the Play Store.

Releases the app source with over-the-air (OTA) update support.

Deploys an over-the-air (OTA) update to the mobile app.

Library

Create, install, remove and sync the shared libraries that apps use.

Creates a new shared library under `libs/`.

Removes a library from the workspace.

Syncs one library's dependencies and config.

Installs a pre-built library such as `shared` or `util`.

Reports whether each library still matches the source it was installed from.

Module

Generate database modules, service modules, and a module's optional UI files.

Creates a database module: constant, service, signal, store and UI files.

Creates a service module in `lib/_<service>`, with no database files.

Removes a module from an app or lib.

Adds a View: the detail screen for one record.

Adds a Unit: one row or card in a list.

Adds a Template: the module's form.

Scalar

Create value types that live inside other models and have no database table of their own.

Creates a scalar in `lib/__scalar/<scalarName>`.

Removes a scalar from an app or lib.

Package

Create, build and verify the packages under `pkgs/`.

Prints the `akanjs` version the workspace runs.

Creates a new package in `pkgs/<name>`.

Removes a package from the workspace.

Syncs one package's dependencies and config.

Builds a package for distribution.

Checks a built package with an `npm pack` dry run.

Page

Generate CRUD routes in an app for a module that already exists.

Creates the list, detail, create and edit pages for the module.

Primitive

Add one piece to a module that already exists: a UI file, a field, or an enum field.

Adds one View, Unit or Template. `--surface` picks which, and defaults to `template`.

Adds one field to the module's constant and dictionary.

Adds one enum field whose values are the comma-separated list.

Workflow

Plan a change, read the plan, apply it, validate the result, and repair what validation caught.

Lists the available workflows.

Explains one workflow.

Plans a change and writes the plan JSON to `--out`, without touching source.

Applies a plan. `--dry-run` shows the predicted report without writing files.

Validates what a run changed.

Prints the report of a run.

Runs one narrow repair: `generated`, `format`, `imports`, `dictionary` or `module-shape`.

Quality

Report code-quality warnings for every app and lib, and measure each one's server render share.

Reports code-quality warnings across every app and lib. `akan quality` alone runs this.

Prints each app's and lib's server render share and its SSR warnings.

The same report as JSON, for tooling.

Cloud

Optional helpers: Akan Cloud sign-in, environment transfer and framework updates.

Signs in to or out of Akan Cloud.

Updates Akan.js to the latest version.

Downloads or uploads environment variables, from or to the cloud or an SCP server.

Tunnel

Share a locally running app on a public URL as a command of its own, outside a dev session.

Shares a running app on a public URL. `--ttl` sets the minutes before it expires.

Lists the shares this account holds.

Stops the share with that code.

Context And MCP

Hand coding agents the workspace context, convention diagnostics and the Akan MCP tools.

Prints the workspace context for agents. `--module` adds that module's abstract.

Reports where the workspace drifts from Akan conventions.

Starts the Akan MCP server over stdio. `--mode` is `readonly` (default), `plan` or `apply`.

Writes the Akan MCP server entry for Cursor, Claude Code or Codex, or all three when left off.

Agent Rules

Install the rule files that editors and coding agents read.

Writes the rules for `cursor`, `agents-md` or `claude`, or all three when left off.

Code Agent

Run the Akan coding agent in the terminal, with the workspace's own tools and skills.

Runs the agent on a prompt. Without one, it opens the full-screen session.

Picks a profile: `local` (default), `pod`, `review` or `web`.

Continues a stored session by its id.

Guideline

Print the Akan guidelines that coding agents read.

Lists every guideline name.

Prints one guideline by name, here `framework`.

CLI Commands

This page is the index. Each group links to a detail page with argument tables, option tables, notes and terminal examples.

Reading a command line

Notation

Shared Behaviour

These hold for every command, so the detail pages do not repeat them.

Alias

Runs

When a value is left off

A value left off is filled from its default, or the command asks you for it.

Left off

What the CLI does

Validation Order

Reports, not gates

These three only print a report, so they never fail the run. Read them before a review.

Command Index

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

