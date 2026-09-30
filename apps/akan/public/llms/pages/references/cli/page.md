# Page

- Source: /references/cli/page
- Mirror: /llms/pages/references/cli/page.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Page CLI (#page-cli)

## Content

Page

Create, read, update and delete: the basic things you do with a model's records.

How the CLI names a module: `shop:product` is `lib/product/` in the `shop` app.

route group

A folder in parentheses, such as `(public)`. It groups files and adds nothing to the URL.

scaffold

The starter code a command writes, meant to be edited.

Written into the target folder, by default `page/(<app>)/(public)/<module>/`

`/<module>`: the list of cards, with a create button. Under `--single` the button opens a modal.

`/<module>/new`: the create form, built from `Template.General`.

`/<module>/<id>`: the detail from `Zone.View`, with a link to the edit page.

`/<module>/<id>/edit`: the edit form, filled with the saved record.

The slice the list and both forms load and save through.

The list of cards and the detail screen.

The form body, shared by the create and edit pages.

`akan create-crud-page [app] [sys:module] [--base-path <path>] [--single]`

Create the list, create, detail and edit pages for an existing module. They go into `page/(<app>)/(public)/<module>/` unless `--base-path` names another folder.

The app that gets the pages. Left out, the only app is used, or you pick one from a list.

The module, such as `shop:product`. Left out, you pick the app or library, then the module.

The folder to write into, relative to the app root, such as `page/(shop)/(admin)/product`.

Write one `_index.tsx` with the list and a create modal, instead of four pages.

same app

Pick a module of the target app. The pages import from `@apps/<sys>/client`.

database modules only

A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not accepted.

with create-module

`akan create-module <name> <app> --page` runs this command with the default folder.

existing file

A file already at the path is overwritten with the scaffold, so commit first.

Page CLI

Words Used on This Page

Term

Pages It Writes

File

Default

Written

Not written

What the Module Must Have

Part

Check After It Runs

Related Pages

Module CLI

`create-module` makes the module these pages need, and `--page` adds them in one go.

Routing

How folders under `page/` become URLs, including route groups and `[id]` segments.

Zone Convention

`Zone.Card` and `Zone.View`, the two zones the generated pages render.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

