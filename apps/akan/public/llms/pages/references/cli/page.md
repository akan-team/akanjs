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

Page CLI

`create-crud-page` writes the list, create, detail and edit pages for a module that already exists, so you can browse and edit its data right away. Run it after `create-module`, then edit the pages like any other code.

Words Used on This Page

Term

- CRUD: Create, read, update and delete: the basic things you do with a model's records.

- sys:module: How the CLI names a module: `shop:product` is `lib/product/` in the `shop` app.

- route group: A folder in parentheses, such as `(public)`. It groups files and adds nothing to the URL.

- scaffold: The starter code a command writes, meant to be edited.

Pages It Writes

File

Default

- Written into the target folder, by default `page/(<app>)/(public)/<module>/`

  - _index.tsx: `/<module>`: the list of cards, with a create button. Under `--single` the button opens a modal.

  - new/_index.tsx: `/<module>/new`: the create form, built from `Template.General`.

  - [<module>Id]/_index.tsx: `/<module>/<id>`: the detail from `Zone.View`, with a link to the edit page.

  - [<module>Id]/edit/_index.tsx: `/<module>/<id>/edit`: the edit form, filled with the saved record.

Written

Not written

What the Module Must Have

The pages call these parts of the module. A module made with `create-module` has all of them; if you renamed or removed one, fix the generated pages to match.

Part

- inPublic: The slice the list and both forms load and save through.

- Zone.Card, Zone.View: The list of cards and the detail screen.

- Template.General: The form body, shared by the create and edit pages.

Check After It Runs

**Links assume the URL is `/<module>`.** The buttons, the redirect after saving and the cards in `Zone.Card` all point to paths starting with `/<module>`. Move the pages to another URL and update them too.

**`--single` writes no detail page.** Each card still links to `/<module>/<id>`, so change that link, or generate the full set of four pages without `--single` instead.

**The pages check no session.** Writes follow the slice `create-module` wrote: `cru: Admin` with `libs/shared`, `cru: None` without it. Gate the pages in a `_layout.tsx` and set the guards your screens need before you ship.

**`--base-path` is a folder inside the app, not a URL prefix.** `--base-path admin` writes to `apps/shop/admin/`, outside `page/`, so no route is created. Give the whole folder, such as `page/(shop)/(admin)/product`.

Related Pages

Module CLI

`create-module` makes the module these pages need, and `--page` adds them in one go.

Routing

How folders under `page/` become URLs, including route groups and `[id]` segments.

Zone Convention

`Zone.Card` and `Zone.View`, the two zones the generated pages render.

`akan create-crud-page [app] [sys:module] [--base-path <path>] [--single]`

Create the list, create, detail and edit pages for an existing module. They go into `page/(<app>)/(public)/<module>/` unless `--base-path` names another folder.

- app (String): The app that gets the pages. Left out, the only app is used, or you pick one from a list.

- sys:module (String): The module, such as `shop:product`. Left out, you pick the app or library, then the module.

- --base-path (String, default page/(<app>)/(public)/<module>, -b): The folder to write into, relative to the app root, such as `page/(shop)/(admin)/product`.

- --single (Boolean, default false, -s): Write one `_index.tsx` with the list and a create modal, instead of four pages.

- same app: Pick a module of the target app. The pages import from `@apps/<sys>/client`.

- database modules only: A service module in `lib/_<service>` or a scalar in `lib/__scalar` is not accepted.

- with create-module: `akan create-module <name> <app> --page` runs this command with the default folder.

- existing file: A file already at the path is overwritten with the scaffold, so commit first.

## Code Examples

### create-crud-page

```bash
akan create-crud-page shop shop:product
akan create-crud-page shop shop:product --single
akan create-crud-page shop shop:product --base-path "page/(shop)/(admin)/product"
akan create-crud-page
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

