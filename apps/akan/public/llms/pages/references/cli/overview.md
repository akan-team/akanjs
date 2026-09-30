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

- Verbose Output — `-v, --verbose` — Every command accepts it. It prints the output of each process the command runs, which a spinner normally hides.

- Help — `akan <command> --help` — Prints the command's arguments and options with their defaults and choices. Bare `akan` lists every command.

- Run From The Workspace Root — `package.json · tsconfig.json · .env` — Run every command except `create-workspace` from the folder that holds these three files. Anywhere else it stops with an error.

- Short Aliases — `akan ba = akan build-android` — Nine commands also answer to the first letter of each dashed word. The table below lists all of them.

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

  - create-workspace <workspaceName>: Creates a new workspace. `--app <app>` names its first app.

  - lint <app|lib|pkg>: Lints one app, lib or package with Biome and fixes what it can. An app or lib is synced first.

  - lint-all: Syncs every app and lib, then lints every app, lib and package.

  - sync-all: Syncs every library, then every app.

- Application: Develop — Create and remove apps, run them locally, and look into a running server.

  - create-application <appName>: Creates a new app under `apps/`.

  - remove-application <app>: Removes an app from the workspace.

  - sync <app|lib>: Updates one app's or lib's dependencies, config and generated files.

  - start [apps...]: Starts the dev server for one or more apps. Alias `s`.

  - script <app> [filename]: Runs `apps/<app>/script/<filename>.ts`, and asks which file when you leave it off.

  - console <app>: Opens an interactive server console.

  - logs <app>: Tails the running app's logs, filtered by level, endpoint, trace and more.

  - dbup, dbdown: Starts or stops the local database services.

  - db-export <app>, db-import <app>: Copies an app's data out of one database mode and into another.

  - plan-slice <app>: Lists the exact files an app needs to live in a workspace of its own.

- Application: Check And Build — Typecheck, test and build before a change ships.

  - typecheck <app>: Typechecks the app. Alias `t`.

  - test <app|lib|pkg>: Prepares and runs the tests of an app, lib or package.

  - build <app>: Builds the app for production, frontend and backend together. Alias `b`.

- Application: Mobile — Build, run and release the iOS, Android and desktop apps on the native runtime.

  - build-ios <app>, build-android <app>, build-desktop <app>: Builds the iOS, Android or desktop app on the native runtime. Aliases `bi`, `ba` and `bd`.

  - start-ios <app>, start-android <app>: Runs the app in a simulator, an emulator or on a device. Aliases `si` and `sa`.

  - start-desktop <app>: Runs the app as a desktop app on this computer (macOS, Windows or Linux). Alias `sd`.

  - release-ios <app>, release-android <app>: Builds and packages a release for the App Store or the Play Store.

  - update-keygen <app>, publish-update <app>, pack-update <app>: Makes the update key, signs and publishes releases installed apps update to, or packs a phone update unsigned.

- Library — Create, install, remove and sync the shared libraries that apps use.

  - create-library <libName>: Creates a new shared library under `libs/`.

  - remove-library <lib>: Removes a library from the workspace.

  - sync-library <lib>: Syncs one library's dependencies and config.

  - install-library <libName>: Installs a pre-built library such as `shared` or `util`.

  - library-status: Reports whether each library still matches the source it was installed from.

- Module — Generate database modules, service modules, and a module's optional UI files.

  - create-module <moduleName> <app|lib>: Creates a database module: constant, service, signal, store and UI files.

  - create-service <serviceName> <app|lib>: Creates a service module in `lib/_<service>`, with no database files.

  - remove-module <sys:module>: Removes a module from an app or lib.

  - create-view <sys:module>: Adds a View: the detail screen for one record.

  - create-unit <sys:module>: Adds a Unit: one row or card in a list.

  - create-template <sys:module>: Adds a Template: the module's form.

- Scalar — Create value types that live inside other models and have no database table of their own.

  - create-scalar <scalarName> <app|lib>: Creates a scalar in `lib/__scalar/<scalarName>`.

  - remove-scalar <scalarName> <app|lib>: Removes a scalar from an app or lib.

- Package — Create, build and verify the packages under `pkgs/`.

  - version: Prints the `akanjs` version the workspace runs.

  - create-package --name <name>: Creates a new package in `pkgs/<name>`.

  - remove-package <pkg>: Removes a package from the workspace.

  - sync-package <pkg>: Syncs one package's dependencies and config.

  - build-package <pkg>: Builds a package for distribution.

  - verify-dist-package <pkg>: Checks a built package with an `npm pack` dry run.

- Page — Generate CRUD routes in an app for a module that already exists.

  - create-crud-page <app> <sys:module>: Creates the list, detail, create and edit pages for the module.

- Primitive — Add one piece to a module that already exists: a UI file, a field, or an enum field.

  - create-ui --module <module>: Adds one View, Unit or Template. `--surface` picks which, and defaults to `template`.

  - add-field --field <field>: Adds one field to the module's constant and dictionary.

  - add-enum-field --values <a,b,c>: Adds one enum field whose values are the comma-separated list.

- Workflow — Plan a change, read the plan, apply it, validate the result, and repair what validation caught.

  - workflow list: Lists the available workflows.

  - workflow explain <name>: Explains one workflow.

  - workflow plan <name> --out <path>: Plans a change and writes the plan JSON to `--out`, without touching source.

  - workflow apply <planPath>: Applies a plan. `--dry-run` shows the predicted report without writing files.

  - workflow validate <runId>: Validates what a run changed.

  - workflow report <runId>: Prints the report of a run.

  - repair <kind>: Runs one narrow repair: `generated`, `format`, `imports`, `dictionary` or `module-shape`.

- Quality — Report code-quality warnings for every app and lib, and measure each one's server render share.

  - quality scan: Reports code-quality warnings across every app and lib. `akan quality` alone runs this.

  - quality ssr: Prints each app's and lib's server render share and its SSR warnings.

  - quality ssr --format json: The same report as JSON, for tooling.

- Cloud — Optional helpers: Akan Cloud sign-in, environment transfer and framework updates.

  - login, logout: Signs in to or out of Akan Cloud.

  - update: Updates Akan.js to the latest version.

  - download-env, upload-env: Downloads or uploads environment variables, from or to the cloud or an SCP server.

- Tunnel — Share a locally running app on a public URL as a command of its own, outside a dev session.

  - tunnel [app]: Shares a running app on a public URL. `--ttl` sets the minutes before it expires.

  - tunnel --list: Lists the shares this account holds.

  - tunnel --stop <code>: Stops the share with that code.

- Context And MCP — Hand coding agents the workspace context, convention diagnostics and the Akan MCP tools.

  - context --format json: Prints the workspace context for agents. `--module` adds that module's abstract.

  - doctor --format json: Reports where the workspace drifts from Akan conventions.

  - mcp --mode plan: Starts the Akan MCP server over stdio. `--mode` is `readonly` (default), `plan` or `apply`.

  - mcp-install [target]: Writes the Akan MCP server entry for Cursor, Claude Code or Codex, or all three when left off.

- Agent Rules — Install the rule files that editors and coding agents read.

  - agent install [target]: Writes the rules for `cursor`, `agents-md` or `claude`, or all three when left off.

- Code Agent — Run the Akan coding agent in the terminal, with the workspace's own tools and skills.

  - code [prompt]: Runs the agent on a prompt. Without one, it opens the full-screen session.

  - code --profile review: Picks a profile: `local` (default), `pod`, `review` or `web`.

  - code --resume <session-id>: Continues a stored session by its id.

- Guideline — Print the Akan guidelines that coding agents read.

  - guideline list: Lists every guideline name.

  - guideline show framework: Prints one guideline by name, here `framework`.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

