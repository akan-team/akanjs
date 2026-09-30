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

database module

A module built around one stored model, in `lib/<module>/`.

service module

Behavior not tied to one stored model, such as notifications, in `lib/_<service>/`.

The app or library that holds the module: `shop` in `shop:story`.

scaffold

The starter code a command writes, meant to be edited.

report

What a create command prints at the end: the files it wrote and the commands to run next.

Model and logic

The module's rules and workflows, in prose.

The fields and the Light class.

Queries and state changes on the stored record.

English and Korean labels.

The business logic.

The endpoints callers reach.

Client state and actions.

The detail screen for one record.

One row or card in a list.

The create and edit form.

A page section, and small domain helpers such as a remove button.

`markdown` is for a person to read; `json` is the same report as one object, for scripts and agents.

The app or library to write into, such as `shop`. Leave it out to pick one from a list.

Name the module as `<sys>:<module>`, such as `shop:story`. Leave it out to pick the sys, then the module.

database modules only

A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not listed.

existing file

A file already at that path is overwritten with the scaffold, so commit first.

name field

The scaffold renders only the module's `name` field; swap in the fields you need.

`akan create-module <module-name> [sys] [--page] [--format <markdown|json>]`

Create a database module in an app or library. It writes the standard module files into `lib/<module>/`, and route files too with `--page`.

Module name. Spaces are removed and the first letter is lowercased; asked for if left out.

Also write CRUD routes for the module. Apps only; a library ignores it.

files

Twelve files: abstract, constant, dictionary, document, service, signal, store and five UI files.

Writes list, new, detail and edit routes under `page/(<app>)/(public)/<module>/`.

guards

The slice reads with `Public`; `root` and `cru` are `Admin` from `@libs/shared/srvkit`.

without libs/shared

`root` and `cru` are `None`, so nothing writes until you name a guard.

same name

A module that already has the name is overwritten file by file, so commit first.

`akan create-service <service-name> [sys] [--format <markdown|json>]`

Create a service module: behavior that is not centered on one stored model. It lands in `lib/_<service>/`, with no constant, document or UI files.

Service name. Spaces and leading underscores are removed, and the first letter is lowercased.

Five files: abstract, dictionary, service, signal and store.

file names

Only the folder has the underscore: `lib/_noti/noti.service.ts`, `lib/_noti/noti.abstract.md`.

A service module holds only Zone and Util files; write them by hand.

`akan remove-module [sys:module]`

Remove a database module from an app or library. It deletes the whole `lib/<module>/` folder at once, without asking.

what stays

Routes made with `--page` and imports in other modules stay; remove them yourself.

afterwards

Run `akan sync <sys>` so the generated files drop the module.

`akan create-view [sys:module] [--format <markdown|json>]`

Write the View file of an existing module: the detail screen for one record. It is always a server component, so it never carries "use client".

writes

`lib/<module>/<Module>.View.tsx`, exporting `General`.

`akan create-unit [sys:module] [--format <markdown|json>]`

Write the Unit file of an existing module: one row or card in a list. It takes the module's Light data and, like View, is always a server component.

`lib/<module>/<Module>.Unit.tsx`, exporting `Card`.

`akan create-template [sys:module] [--format <markdown|json>]`

Write the Template file of an existing module: its create and edit form. It is bound to the store's form state, so it is always a client component with "use client" on line 1.

`lib/<module>/<Module>.Template.tsx`, exporting the `General` form.

Module CLI

Words Used on This Page

Term

Files a New Module Gets

File

Written

Not written

Rules All Six Share

Related Pages

Database Module

What each file `create-module` writes is for.

Service Module

What each file `create-service` writes is for.

Primitive CLI

`create-ui` writes the same UI files, taking the app and module as flags.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

