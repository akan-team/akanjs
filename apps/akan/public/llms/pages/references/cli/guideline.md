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

`akan guideline <action> [name]`

Lists the guidelines bundled with the CLI, or prints one of them as Markdown. Use it when an agent, a documentation tool or a contributor needs more depth on one area than `AGENTS.md` carries.

- action (String, list | show, required): `list` prints every guideline name, one per line; `show` prints one guideline.

- name (String): Guideline to print, such as `framework`, `moduleOverview` or `modelSignal`; required for `show`.

- Read-only: Guidelines are files installed with the CLI; the command reads them and never writes.

- Same text as agents: MCP `get_guideline` and `akan guideline show` read the same bundled files.

- Unknown name: `show` with a name that does not exist fails with an error listing every valid name.

- Version: The text is the installed CLI's own, so it changes when you upgrade the CLI.

Guideline CLI

Guidelines are instruction documents for coding agents that ship inside the Akan CLI. `akan guideline` prints them in the terminal; it calls no LLM and changes no file.

Reach for it when one module file, scalar file, UI pattern or framework-wide rule needs the most specific instruction there is.

Words Used On This Page

Term

- guideline: An instruction document for coding agents that ships inside the Akan CLI, one per area or file role.

- AGENTS.md: The guide an agent reads on every task: the short rules, plus which guideline covers the rest.

- MCP: Model Context Protocol, the standard way a coding agent calls tools outside itself.

- get_guideline: The MCP tool that returns one guideline by name.

Where The Same Text Is Read

Every path below reads the same files, so a person and an agent see the same words.

Path

- akan guideline show <name>: A person reads one guideline in the terminal, as Markdown.

- get_guideline: The tool the `akan code` agent and editor agents on `akan mcp` use to fetch one guideline.

- akan://guidelines/<name>: An MCP client finds one resource per guideline in its resource list.

- akan agent install: Copies `framework`, `conventions` and `workspaceOnboarding` into the `AGENTS.md` agents read.

**AGENTS.md is a copy.** It is written when you run `akan agent install`. Every other path reads the installed CLI each time.

**Agents fetch before a deep pass.** `AGENTS.md` names the guideline for each area, and the agent loads it with `get_guideline` before a larger change there.

MCP Tools And Resources

Every tool `akan mcp` offers, `get_guideline` included.

Writes and refreshes `AGENTS.md` and the editor pointers.

Guideline List

These are the names `akan guideline list` prints, grouped by what they cover. The list follows the installed CLI, so trust its output over this page.

Whole Workspace

- framework: The shortest overview: what apps, libs and pkgs own, and the layer order of a module.

- conventions: The full convention set that `akan agent install` writes into `AGENTS.md`.

- workspaceOnboarding: Workspace layout, the agent workflow, common commands, and where each kind of code goes.

- workspaceRecipes: Step-by-step recipes for frequent changes, and the API generated at each layer.

- moduleOverview: Which file of a database module owns what, and the order a module grows in.

Deep Dives By Area

Read the one for an area before a larger change there.

- ssrRule: When a `.tsx` file earns `"use client"`, and how to keep markup on the server.

- runtimeRule: Web surfaces, route prefixes, processes, logging, the Docker image and shipped assets.

- queryRule: Filters, slices and hydration, full-text search, and cascade removal.

- transportRule: Guards on HTTP and websocket, socket identity and cleanup, binary pubsub, mutation verbs.

- mcpRule: Which endpoints agents see over MCP, `option.setMcp`, OAuth sign-in and page prompts.

- agentRule: The in-page agent: `<Agent.Chat />`, `st.tool`, forms, and what an agent may read.

- fieldRule: The `field()` helper and its options, for constant and scalar constant files.

- cssRule: Semantic color tokens, the theme in `styles.css`, and a lib's own `tokens.css`.

- componentRule: Shared UI rules, and re-skinning `akanjs/ui` components with `_overrides.tsx`.

- recipeRule: Using and authoring Tailwind-variant recipes, so a look is written once.

One Per Module File

One guideline per file role, for database modules and scalars.

- modelConstant: The data shape every layer shares, from Input to the full model. — <model>.constant.ts

- modelDictionary: Labels and text for fields, enums, queries, slices, endpoints and errors. — <model>.dictionary.ts

- modelDocument: Filters, document chain methods, collection helpers and indexes. — <model>.document.ts

- modelService: Business workflows: what to load, which methods to chain, when to save. — <model>.service.ts

- modelSignal: The callable API: internal jobs, slices, endpoints and their guards. — <model>.signal.ts

- modelStore: Client state for forms, lists and details, and the actions the UI calls. — <model>.store.ts

- modelTemplate: Form fragments bound to the store's form state and setters. — <Model>.Template.tsx

- modelUnit: Compact displays of the light model, such as cards, rows and badges. — <Model>.Unit.tsx

- modelView: Full detail displays for detail pages and view modals. — <Model>.View.tsx

- modelUtil: Small model-specific controls, such as action buttons, toolbars and dialogs. — <Model>.Util.tsx

- modelZone: Page sections that compose loaders, lists, views and templates. — <Model>.Zone.tsx

- scalarModule: When a value is a scalar rather than a module, and what its folder holds. — lib/__scalar/<scalar>/

- scalarConstant: A small embedded value object that reads clearly without its parent model. — <scalar>.constant.ts

- scalarDictionary: Labels and descriptions for a scalar's fields and enum values. — <scalar>.dictionary.ts

## Code Examples

### guideline

```bash
akan guideline list
akan guideline show framework
akan guideline show modelSignal
akan guideline show ssrRule
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use commands from the workspace root unless a page explicitly says otherwise.

