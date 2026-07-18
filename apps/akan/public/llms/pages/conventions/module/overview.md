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

Describes business intent, domain rules, workflows, data meaning, related modules, and agent notes that should be read before implementation changes.

Defines the business data shape: fields, enums, model layers, helpers, hidden/secret fields, and resolved fields.

Defines user-facing language for fields, insights, queries, slices, endpoints, errors, and UI text.

Defines persistence behavior: filters, document methods, model-level helpers, indexes, and schema hooks.

Owns business workflows and coordinates generated document methods, injected services, and database operations.

Exposes APIs, slices, realtime messages, pubsub channels, internal tasks, guards, and resolved field handlers.

Coordinates client state, form state, list state, generated fetch calls, toast messages, and UI-facing actions.

Renders form pieces and interaction fragments bound to store form state and generated setters.

Renders reusable light-model display pieces such as cards, rows, avatars, columns, and compact summaries.

Renders full-model detail UI for detail pages, view modals, and sections that need complete model data.

Packages small client helper UI such as action buttons, toolboxes, dialogs, query panels, and navigation helpers.

Composes page sections with Load.Units, Load.View, Unit/View display, Util controls, and section-level UI state.

Start with the business intent and durable domain rules.

Start with the business shape and generated model layers.

Give those fields, actions, errors, and UI phrases user-facing names.

Describe how stored documents are queried, changed, indexed, and loaded.

Implement business workflows using document helpers and other services.

Expose server behavior as typed slices, endpoints, realtime channels, and tasks.

Connect generated fetch APIs to client state, form state, and UI actions.

Render forms, lists, detail views, actions, and page sections.

New Model

Use this path when defining a business object from scratch.

New List Page

Use this path when a page needs list data, filtering, pagination, and cards.

New Detail Or Edit Page

Use this path when showing full data or editing an existing model.

New Action

Use this path when a user click should run a business workflow.

Put them in service, document, or constant helpers. Do not hide them inside render code.

Put slices, endpoints, guards, internal args, realtime, and tasks in signal.

Put fetch calls, form state, list state, toast messages, and UI actions in store.

Use Unit for repeated light-model display and View for full-model detail display.

Use Zone to compose Load wrappers, Unit/View, Util controls, and section layout.

Use Util for toolboxes, action buttons, dialog triggers, query panels, and navigation helpers.

Module Overview

An Akan module is one business feature folder. It keeps the model shape, language, persistence behavior, business workflows, APIs, client state, and UI pieces close together.

This overview is a map. Use it to understand which file to open next, then move to each detail page for patterns and examples.

Module File Map

Most modules are easier to understand when split into two groups: data/server files and UI/client files. Each card links to the matching guide.

Data And Server Files

UI And Client Files

Server To Client Flow

A module usually grows from data shape to persistence, then to API, client state, and UI. You do not need every file for every feature, but this order keeps ownership clear.

Role Boundaries

When a module becomes confusing, it is usually because logic moved into the wrong file. Use these boundaries before adding code.

Recommended Reading Paths

Start from the task you are trying to build. The first file in each path is the best place to inspect or design the change.

Practical Rules

Keep the overview short. Put detailed syntax and examples in each file-specific guide.

Let generated types and helpers connect files instead of copying shapes by hand.

Design server behavior before UI when a feature changes stored data.

Use UI files for composition and presentation, not hidden business decisions.

When a section gets large, move display into Unit/View and controls into Util before expanding Zone.

## Code Examples

### module flow

```ts
constant -> dictionary -> document -> service -> signal -> store -> UI files

UI files:
Template -> forms
Unit -> list item display
View -> full detail display
Util -> small controls
Zone -> page section composition
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

