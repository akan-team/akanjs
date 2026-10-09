# Schema Docs

- Source: /cheatsheet/dev/constants
- Mirror: /llms/pages/cheatsheet/dev/constants.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Constant Schema Docs (#overview)
- Generated Schema (#schema-doc)
- Printable Definition (#print-schema-doc)

## Content

Schema Docs

Constant Schema Docs

You do not have to write a data model spec by hand. `Constant.Doc` reads every model registered in `ConstantRegistry` and draws field tables and a relation diagram from it.

Words used on this page

Term

- refName: A model's name in code, such as `user` or `bizContract`. You pick models by it.

- variant: One of the five classes a model declares: Input, Object, Light, Full and Insight.

- scalar: A value object stored inside another model, declared under `lib/__scalar/`.

- enum: A fixed list of allowed values, declared with `enumOf(...)`.

The parts

Component

- Constant.Doc.Zone: An explorer for the screen, with search, a table or diagram view and a tab per variant.

- Constant.Doc.Print: Everything expanded on one long page, ready to print or save as a PDF.

- Constant.Doc.Model, Constant.Doc.Scalar: One model or scalar as a collapsible panel, picked by `refName`.

- Constant.Doc.Enum: Every registered enum in one table, with its values and the fields that use it.

Put it on a page

A route renders it directly and stays a server page:

Both components take the same lists:

- models (string[], default all): Database models to show, by `refName`, in the order you list them.

- scalars (string[], default all): Scalar models to show, by `refName`.

- enums (string[], default all): Enums to show: the class name, first letter lowercased (`BizContractStatus` → `bizContractStatus`).

- include (string[], default all): Models and scalars to start from, by `refName`; the scalars and enums they reach come along.

- exclude (string[], default []): Names to leave out of every list. What only they reach is left out too.

- libs (string[], default all): Libraries to show, by the app or lib that owns each entry. An app's extension belongs to the app.

- groupBy ("lib", Doc.Zone): One section and one diagram per library, the app first; links to another library show as external.

- openAll (boolean, default false, Doc.Zone): Opens every model and scalar panel. `Doc.Print` is always fully open and ignores it.

**An empty list means none.** `models={[]}` shows no model; only a prop left out means every registered one.

**Narrowing one list narrows the rest.** With `models`, `include` or `exclude` set, a left-out `scalars` becomes the scalars the shown models embed and a left-out `enums` the enums their fields use.

**A misspelled name is skipped quietly.** If a model is missing, check its `refName` against the summary counts.

**Order follows your list.** A list you leave out is sorted by name.

**The URL.** `(admin)` is a route group and adds nothing to the path, so the page above serves `/schema`.

**The print version.** Write `schema/print.tsx` the same way with `<Constant.Doc.Print />`, and it serves `/schema/print`.

Generated Schema

`Constant.Doc.Zone` is for browsing. Each model is a panel with a field table, and the toolbar switches the whole view to a relation diagram.

What is on screen

Part

What it does

- Summary cards — Counts of database models, scalar models, enums and relations.

- Search — Filters models and scalars by `refName`, and enums by name.

- Table · Diagram — Switches between field tables and a graph of how models point at each other.

- Input · Object · Full · Light · Insight — Shows one variant of a model at a time. `Full` opens first.

- Detail — Opens one field's full settings as JSON, including `ref`, `example` and `meta`.

Reading a field row

Column

What it shows

- Type: The field type. `!` marks a required field, and a model or scalar type is highlighted.

- Kind: `property`, `hidden`, `secret` or `resolve`, with `select:false` and `immutable` badges.

- Default: The declared default. A function default reads `[function]`.

- Constraints: `min`, `max`, `minlength`, `maxlength`, the `text:` search role, `custom validate`, `accumulate`.

- Values: The allowed values when the field is an enum.

**Labels come from the dictionary.** The model description is the one in `.of()`, and each field shows its label and `.desc()`.

**Reading the diagram.** Each arrow is labelled with the fields that make it. A model outside your list shows as an `External` node.

**Click a node.** The side panel lists its fields and their types, from the `Full` variant for a database model.

Live on this site

Printable Definition

`Constant.Doc.Print` renders every selected variant and field expanded. There are no tabs, collapse panels, modals or diagram, so the page prints as it looks.

Feature

Doc.Zone

Doc.Print

- Browsing on screen

  - Search

  - Relation diagram

  - Variant tabs: One variant at a time.

  - Collapsible panels: `openAll` opens them all.

  - Field detail modal

- Printing

  - All five variants at once: Printed one after another per model.

  - Field details in the table: `ref`, `refPath`, `example` and `meta` inline, in place of the modal.

  - Enum value labels: Written in a column. `Doc.Zone` shows them only on hover.

  - Page breaks: Each database model gets its own page, and scalars and enums start on a new one.

  - Print colors: Switches to black text on white when printed, even from dark mode.

has it

does not

To keep a copy as a PDF:

Open the print route, such as `/schema/print`.

Press `⌘P` or `Ctrl+P` and choose Save as PDF in the browser's print dialog.

## Code Examples

### apps/myapp/page/(admin)/schema/_index.tsx

```ts
import { page } from "akanjs/client";
import { Constant } from "akanjs/ui";

export default page().render(() => <Constant.Doc.Zone models={["user", "bizContract"]} openAll />);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

