# Overview

- Source: /conventions/module/overview
- Mirror: /llms/pages/conventions/module/overview.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- Module Overview (#module-overview)
- Module File Map (#module-file-map)
- Server To Client Flow (#server-client-flow)
- Role Boundaries (#role-boundaries)
- Recommended Reading Paths (#reading-paths)
- Practical Rules (#practical-rules)

## Content

Overview

Module Overview

An Akan module is one folder for one business feature. The model's shape, its wording, storage, workflows, API, client state and UI all sit side by side in it.

This page is a map for choosing which file to open next. Syntax and examples live on each file's own page.

An Example Module

The `banner` module in `libs/shared` looks like this:

**Lowercase files are logic.** They are named `<model>.<role>.ts` and hold data, storage, API and client state.

**PascalCase files are UI.** Their components are reached through the model's namespace: `Card` in `Banner.Unit.tsx` is `<Banner.Unit.Card />`.

**`index.ts` is generated.** Never edit it. `*.signal.spec.ts` holds test fixtures and `*.signal.test.ts` the assertions.

**This page covers database modules** in `lib/<model>`. Service modules (`lib/_<service>`) and scalar modules (`lib/__scalar/<scalar>`) have their own overview pages.

Words used on this page

Term

- light model: The `Light<Model>` class: the few fields a list or card needs. Server and client both hold it.

- full model: The `<Model>` class: every field of one record. Detail screens use it.

- slice: A server query that fills a list in the client store.

- endpoint: One query, mutation, message or pubsub a caller can reach.

- guard: A class that decides whether the caller may run an endpoint.

- Load.Units, Load.View: Wrappers that fill the store from route data and draw the loading and empty states.

Module File Map

A module's files fall into two groups: seven lowercase logic files and five PascalCase UI files. Each card opens that file's guide.

Logic Files

- model.abstract.md — What the module owns, the 2–5 rules code cannot show, and any workflow. Read it first.

- model.constant.ts — The data shape: fields, enums, the five model layers, helpers, hidden/secret and resolved fields.

- model.dictionary.ts — Words users read: fields, insights, queries, sorts, enums, slices, endpoints, errors, UI text.

- model.document.ts — How stored documents behave: filters, document methods, model helpers, indexes, schema hooks.

- model.service.ts — Business workflows, built from document methods, injected services and database operations.

- model.signal.ts — Where server work starts: slices, endpoints, message, pubsub, tasks, guards, resolved fields.

- model.store.ts — Client state: form and list state, generated fetch calls, toasts, and the actions UI calls.

UI Files

`Unit` and `View` are server components. `Template`, `Zone` and `Util` are client components and start with `"use client"`.

- Model.Template.tsx — The form. Its fields bind to the store's form state through the generated setters.

- Model.Unit.tsx — One piece of a light model: a card, row, avatar, column or compact summary.

- Model.View.tsx — One full model in detail: detail pages, view modals, sections that need every field.

- Model.Util.tsx — Small client controls: action buttons, toolboxes, dialogs, query panels, navigation helpers.

- Model.Zone.tsx — A page section. It feeds route data to `Load.Units` or `Load.View` and composes Unit, View and Util.

Server To Client Flow

A module usually grows from the data shape to storage, then to the API, client state and UI. Not every feature needs every file, but this order keeps each file's job clear.

- abstract: Write down the business intent and the domain rules that should last.

- constant: Define the business shape: fields, enums and the model layers.

- dictionary: Give those fields, actions, errors and UI phrases the names users see.

- document: Describe how stored documents are queried, changed, indexed and loaded.

- service: Build business workflows from document helpers and other services.

- signal: Expose server behaviour as typed slices, endpoints, realtime channels and tasks.

- store: Connect the generated fetch API to client state, form state and UI actions.

- UI: Draw forms, lists, detail views, actions and page sections.

As a diagram, the chain ends in UI, which splits into the five UI roles:

One module, data to UI

the form

one row or card

one full record

one control

the section

Role Boundaries

When a module gets confusing, it is usually because logic moved into the wrong file. Check where it belongs before adding code.

What

Where

What goes there

- Business rules — service · document · constant — Service workflows, document methods and constant helpers. Never inside render code.

- API and access — signal — Slices, endpoints, guards, internal args, realtime channels and tasks.

- Client coordination — store — Fetch calls, form and list state, toasts and UI actions.

- Display — Unit · View — Unit repeats a light model; View shows one full model in detail.

- Page sections — Zone — Load wrappers, Unit/View, Util controls and the section's layout.

- Small controls — Util — Toolboxes, action buttons, dialog triggers, query panels and navigation helpers.

**UI and store files never import server logic.** A `*.store.ts` or `.tsx` file importing a `*.document.ts`, `*.dictionary.ts`, `*.service.ts` or `*.signal.ts`, or the reverse, is a lint error that fails the build. UI code takes `cnst`, `fetch` and `st` from `@apps/<app>/client` or `@libs/<lib>/client`, and `import type` is fine in either direction.

Recommended Reading Paths

Pick the column for the task you are building and read it top to bottom: that is the order to open the files in. The first one, `abstract`, is the best place to inspect or design the change.

- New model — defining a business object from scratch.

- List — a page needs list data, filtering, pagination and cards.

- Detail/edit — showing a model's full data, or editing an existing one.

- Action — a user's click should run a business workflow.

: when

File, in reading order

New model

List

Detail/edit

Action

- Logic files

  - abstract: Every path starts here, with the rules the change must keep.

  - constant: The new object's fields and model layers.

  - dictionary: Names for the new fields, errors and UI text.

  - document: Filters, document methods and indexes for the stored data.

  - service: The workflow the new model or the click runs.

  - signal: A slice for a list, the `get` guard behind `view<Model>` for detail, an endpoint for an action.

  - store: The state the screen reads. For an action, the store action a button calls.

- UI files

  - Zone: The section that takes the route's data and fills the list or the detail.

  - Unit: One card or row of the list.

  - View: The detail of one full record.

  - Template: The edit form. For an action, the button can live here or in Util.

  - Util: The action's button when it is a control of its own.

Read for this task

Not needed

Practical Rules

Four habits that keep a module easy to follow:

**Connect files through generated types.** Let `cnst`, `fetch` and `st` carry shapes between files instead of copying them by hand.

**Server before UI.** When a feature changes stored data, design the server behaviour first.

**UI files compose and present.** Business decisions never hide in them; a display or predicate rule goes on `Light<Model>` as a method.

**Split before a Zone grows.** When a section gets large, move display into Unit/View and controls into Util first.

## Code Examples

### libs/shared/lib/banner/

```bash
libs/shared/lib/banner/
├── banner.abstract.md
├── banner.constant.ts
├── banner.dictionary.ts
├── banner.document.ts
├── banner.service.ts
├── banner.signal.ts
├── banner.signal.spec.ts
├── banner.signal.test.ts
├── banner.store.ts
├── Banner.Template.tsx
├── Banner.Unit.tsx
├── Banner.Util.tsx
├── Banner.View.tsx
├── Banner.Zone.tsx
└── index.ts
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

