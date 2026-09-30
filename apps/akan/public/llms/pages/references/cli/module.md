# Module

- Source: /references/cli/module
- Mirror: /llms/pages/references/cli/module.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Module CLI (#module-cli)

## Content

Module

Module CLI

Six commands that create, remove and fill in modules inside an app or library. Use `create-module` for a feature built around a stored model, `create-service` for one that is not.

Words Used on This Page

Term

- database module: A module built around one stored model, in `lib/<module>/`.

- service module: Behavior not tied to one stored model, such as notifications, in `lib/_<service>/`.

- sys: The app or library that holds the module: `shop` in `shop:story`.

- scaffold: The starter code a command writes, meant to be edited.

- report: What a create command prints at the end: the files it wrote and the commands to run next.

Files a New Module Gets

File

- Model and logic

  - .abstract.md: The module's rules and workflows, in prose.

  - .constant.ts: The fields and the Light class.

  - .document.ts: Queries and state changes on the stored record.

  - .dictionary.ts: English and Korean labels.

  - .service.ts: The business logic.

  - .signal.ts: The endpoints callers reach.

  - .store.ts: Client state and actions.

- UI

  - .View.tsx: The detail screen for one record.

  - .Unit.tsx: One row or card in a list.

  - .Template.tsx: The create and edit form.

  - .Zone.tsx · .Util.tsx: A page section, and small domain helpers such as a remove button.

Written

Not written

The other three create commands fill in one UI file of an existing module: `create-view` the View, `create-unit` the Unit, and `create-template` the Template.

Rules All Six Share

**Name the target, or pick it from a list.** `create-module` and `create-service` take the app or library as their second argument; the other four take `<sys>:<module>`. Leave it out and the CLI asks.

**Only database modules can be picked.** A folder with an underscore, such as `lib/_<service>` or `lib/__scalar`, never appears as a `sys:module`.

**Create commands end with a report.** It lists the files written and the next steps, `akan sync <sys>` and `akan lint <sys>`. Add `-o json` for the same report as one JSON object.

**`remove-module` prints no report.** Run `akan sync <sys>` after it yourself.

**Commit before you run these.** A create command writes its scaffold over any file at the same path, and `remove-module` deletes the folder without asking.

Related Pages

Database Module

What each file `create-module` writes is for.

Service Module

What each file `create-service` writes is for.

Primitive CLI

`create-ui` writes the same UI files, taking the app and module as flags.

`akan create-module <module-name> [sys] [--page] [--format <markdown|json>]`

Create a database module in an app or library. It writes the standard module files into `lib/<module>/`, and route files too with `--page`.

- module-name (String, required): Module name. Spaces are removed and the first letter is lowercased; asked for if left out.

- sys (String): The app or library to write into, such as `shop`. Leave it out to pick one from a list.

- --page (Boolean, default false, -p): Also write CRUD routes for the module. Apps only; a library ignores it.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

- files: Twelve files: abstract, constant, dictionary, document, service, signal, store and five UI files.

- --page: Writes list, new, detail and edit routes under `page/(<app>)/(public)/<module>/`.

- guards: The slice reads with `Public`; `root` and `cru` are `Admin` from `@libs/shared/srvkit`.

- without libs/shared: `root` and `cru` are `None`, so nothing writes until you name a guard.

- same name: A module that already has the name is overwritten file by file, so commit first.

`akan create-service <service-name> [sys] [--format <markdown|json>]`

Create a service module: behavior that is not centered on one stored model. It lands in `lib/_<service>/`, with no constant, document or UI files.

- service-name (String, required): Service name. Spaces and leading underscores are removed, and the first letter is lowercased.

- sys (String): The app or library to write into, such as `shop`. Leave it out to pick one from a list.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

- files: Five files: abstract, dictionary, service, signal and store.

- file names: Only the folder has the underscore: `lib/_noti/noti.service.ts`, `lib/_noti/noti.abstract.md`.

- UI: A service module holds only Zone and Util files; write them by hand.

`akan remove-module [sys:module]`

Remove a database module from an app or library. It deletes the whole `lib/<module>/` folder at once, without asking.

- sys:module: Name the module as `<sys>:<module>`, such as `shop:story`. Leave it out to pick the sys, then the module.

- database modules only: A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not listed.

- what stays: Routes made with `--page` and imports in other modules stay; remove them yourself.

- afterwards: Run `akan sync <sys>` so the generated files drop the module.

`akan create-view [sys:module] [--format <markdown|json>]`

Write the View file of an existing module: the detail screen for one record. It is always a server component, so it never carries "use client".

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

- sys:module: Name the module as `<sys>:<module>`, such as `shop:story`. Leave it out to pick the sys, then the module.

- database modules only: A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not listed.

- writes: `lib/<module>/<Module>.View.tsx`, exporting `General`.

- name field: The scaffold renders only the module's `name` field; swap in the fields you need.

- existing file: A file already at that path is overwritten with the scaffold, so commit first.

`akan create-unit [sys:module] [--format <markdown|json>]`

Write the Unit file of an existing module: one row or card in a list. It takes the module's Light data and, like View, is always a server component.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

- sys:module: Name the module as `<sys>:<module>`, such as `shop:story`. Leave it out to pick the sys, then the module.

- database modules only: A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not listed.

- writes: `lib/<module>/<Module>.Unit.tsx`, exporting `Card`.

- name field: The scaffold renders only the module's `name` field; swap in the fields you need.

- existing file: A file already at that path is overwritten with the scaffold, so commit first.

`akan create-template [sys:module] [--format <markdown|json>]`

Write the Template file of an existing module: its create and edit form. It is bound to the store's form state, so it is always a client component with "use client" on line 1.

- --format (String, default markdown, markdown | json · -o): `markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

- sys:module: Name the module as `<sys>:<module>`, such as `shop:story`. Leave it out to pick the sys, then the module.

- database modules only: A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not listed.

- writes: `lib/<module>/<Module>.Template.tsx`, exporting the `General` form.

- name field: The scaffold renders only the module's `name` field; swap in the fields you need.

- existing file: A file already at that path is overwritten with the scaffold, so commit first.

## Code Examples

### create-module

```bash
akan create-module Story
akan create-module UserProfile --page true
akan create-module Story --format json
akan create-module story shop --page
```

### create-service

```bash
akan create-service noti
akan create-service Security --format json
```

### remove-module

```bash
akan remove-module shop:story
akan remove-module
```

### create-view

```bash
akan create-view shop:story
```

### create-unit

```bash
akan create-unit shop:story
```

### create-template

```bash
akan create-template shop:story
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

