# Guideline

- Source: /references/cli/guideline
- Mirror: /llms/pages/references/cli/guideline.md
- Section: references
- Category: CLI Reference
- Priority: P0

## Headings

- Guideline CLI (#guideline-cli)
- Guideline List (#guideline-list)

## Content

Guideline

guideline

An instruction document for coding agents that ships inside the Akan CLI, one per area or file role.

The guide an agent reads on every task: the short rules, plus which guideline covers the rest.

Model Context Protocol, the standard way a coding agent calls tools outside itself.

The MCP tool that returns one guideline by name.

A person reads one guideline in the terminal, as Markdown.

The tool the `akan code` agent and editor agents on `akan mcp` use to fetch one guideline.

An MCP client finds one resource per guideline in its resource list.

Copies `framework`, `conventions` and `workspaceOnboarding` into the `AGENTS.md` agents read.

`akan guideline <action> [name]`

Lists the guidelines bundled with the CLI, or prints one of them as Markdown. Use it when an agent, a documentation tool or a contributor needs more depth on one area than `AGENTS.md` carries.

`list` prints every guideline name, one per line; `show` prints one guideline.

Guideline to print, such as `framework`, `moduleOverview` or `modelSignal`; required for `show`.

Read-only

Guidelines are files installed with the CLI; the command reads them and never writes.

Same text as agents

MCP `get_guideline` and `akan guideline show` read the same bundled files.

Unknown name

`show` with a name that does not exist fails with an error listing every valid name.

Version

The text is the installed CLI's own, so it changes when you upgrade the CLI.

The shortest overview: what apps, libs and pkgs own, and the layer order of a module.

The full convention set that `akan agent install` writes into `AGENTS.md`.

Workspace layout, the agent workflow, common commands, and where each kind of code goes.

Step-by-step recipes for frequent changes, and the API generated at each layer.

Which file of a database module owns what, and the order a module grows in.

When a `.tsx` file earns `"use client"`, and how to keep markup on the server.

Web surfaces, route prefixes, processes, logging, the Docker image and shipped assets.

Filters, slices and hydration, full-text search, and cascade removal.

Guards on HTTP and websocket, socket identity and cleanup, binary pubsub, mutation verbs.

Which endpoints agents see over MCP, `option.setMcp`, OAuth sign-in and page prompts.

The in-page agent: `<Agent.Chat />`, `st.tool`, forms, and what an agent may read.

The `field()` helper and its options, for constant and scalar constant files.

Semantic color tokens, the theme in `styles.css`, and a lib's own `tokens.css`.

Shared UI rules, and re-skinning `akanjs/ui` components with `_overrides.tsx`.

Using and authoring Tailwind-variant recipes, so a look is written once.

The data shape every layer shares, from Input to the full model.

Labels and text for fields, enums, queries, slices, endpoints and errors.

Filters, document chain methods, collection helpers and indexes.

Business workflows: what to load, which methods to chain, when to save.

The callable API: internal jobs, slices, endpoints and their guards.

Client state for forms, lists and details, and the actions the UI calls.

Form fragments bound to the store's form state and setters.

Compact displays of the light model, such as cards, rows and badges.

Full detail displays for detail pages and view modals.

Small model-specific controls, such as action buttons, toolbars and dialogs.

Page sections that compose loaders, lists, views and templates.

When a value is a scalar rather than a module, and what its folder holds.

A small embedded value object that reads clearly without its parent model.

Labels and descriptions for a scalar's fields and enum values.

Guideline CLI

Reach for it when one module file, scalar file, UI pattern or framework-wide rule needs the most specific instruction there is.

Words Used On This Page

Term

Where The Same Text Is Read

Every path below reads the same files, so a person and an agent see the same words.

Path

MCP Tools And Resources

Every tool `akan mcp` offers, `get_guideline` included.

Writes and refreshes `AGENTS.md` and the editor pointers.

Guideline List

Whole Workspace

Deep Dives By Area

Read the one for an area before a larger change there.

One Per Module File

One guideline per file role, for database modules and scalars.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

