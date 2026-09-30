# Overview

- Source: /references/ui/overview
- Mirror: /llms/pages/references/ui/overview.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- akanjs/ui (#akanjs-ui)
- Page Map (#page-map)
- Every Export (#exports)

## Content

Overview

Core

Display

Forms

Overlays

System

Agent

Customization

Only here

akanjs/ui

`akanjs/ui` is the framework's shared UI package: links, data loading, model CRUD shells, form controls, display helpers, overlays, the in-page agent and the app shell. Every name in this reference imports from that one path.

By Layer

One page per layer you work in. Pick yours from the Page Map.

By Name

Every export A to Z, each with the page that covers it. Start here when you know the name.

Page Map

Open the page for the layer you are working in. Each component there gets its own section: a props table, then the notes props alone cannot carry.

- Core — Link, Image, Layout, Load, Model — The parts most pages are built from: routing, images, page shells, data loading, model CRUD.

- Display — Data, RecentTime, Loading, Empty, Table, Pagination, Badge — Showing data and feedback: admin lists, relative times, loading and empty states, badges, tables.

- Forms — Field, Input, Select, Switch, Radio, ToggleSelect, DatePicker, Button — Form controls and buttons for templates, filters and admin screens.

- Overlays — Modal, Dialog, Popconfirm, Dropdown, BottomSheet, Tooltip, Menu, Portal, Copy — What opens over the page: modals, confirmations, sheets, menus, hints and copy buttons.

- System — System, ClientSide, Signal, Tab, animated — The app shell, client-only boundaries, the API explorer, tabs and animation.

- Agent — Agent.Chat, Agent.Zone, Agent.Guide, Agent.History, Agent.Skip, Agent.Scope, Agent.Dock — The in-page agent: the layout chat, zones with their own conversation, route guidance, the dev dock.

- Customization — _overrides.tsx, override(), 46 slots — Swap framework components per route with a `page/**/_overrides.tsx` file; call sites stay.

- Recipes — buttonRecipe, badgeRecipe, inputRecipe — The className factories: use one, add one in `apps/<app>/ui/Recipe/`, or swap one via `recipes`.

Every Export

Every value `akanjs/ui` exports, A to Z. Use it when you know a name but not the page.

**The label up front is the page.** Each description starts with the page that covers that area; click it to go there.

**A name with its own section links to it.** Click the name itself to land on that section.

**Only here** means no page covers the name. The row is the whole documentation.

**Type-only exports are left out.** A type follows the component it describes, and a props interface is in that component's props table.

Export

- Agent: The in-page agent namespace, with twelve members.

- AgentAttachments: The attachment chips, drawn in the composer and on each sent message.

- agentAttrs: The `data-akan-*` attributes for a handler passed by reference; spread them on your own control.

- AgentProvider: Hands a subtree one session, passed in or built from a `runner`; an `Agent.Chat` inside uses it.

- AgentReferences: The `@` reference chips, drawn in the composer and on each sent message.

- AgentSession: The conversation loop that runs in the browser; build one to own the transcript yourself.

- agentSessionOf: Builds an `AgentSession` from the same options `Agent.Chat` takes.

- animated: The react-spring animated elements: `div`, `g` and `progress`.

- Badge: The status pill.

- badgeRecipe: The badge's className factory, and a recipe slot.

- BottomSheet: The mobile sheet, `half` or `full` height.

- Button: The one button primitive; an `onClick` that returns a promise turns on its async states.

- buttonRecipe: The button's className factory, and a recipe slot.

- ChatCommands: The chat's slash-command registry: the whole `/` menu.

- ClientSide: A small Suspense boundary for client-only content.

- Clipboard: A bare copy icon that turns into a check; `Copy` is the one with a success toast.

- Constant: `Doc` and `Graph`: constant models as a schema document and as a relation graph.

- Copy: Wraps a trigger; a click copies text to the clipboard and shows a global success message.

- createOverridable: Makes a framework component resolve through a route's override slot.

- CsrImage: `Image` without the optimizer: a plain `img` for a CSR-only bundle.

- Data: The admin listing screen, in nine parts.

- DatePicker: The browser's native date field, plus `RangePicker` and `TimePicker`.

- DefaultApproval, DefaultBubble, DefaultCode, DefaultComposer, DefaultLauncher, DefaultMarkdown, DefaultAgentMenu, DefaultQuestion, DefaultQueued, DefaultSteps, DefaultToolCard, DefaultToast, DefaultToastItem: The shipped default behind each matching slot, public so a replacement can compose it.

- Dialog: The headless dialog namespace that `Modal` is built on.

- DragAction: A row that reveals a left and a right action when swiped, built from `Body`, `Left` and `Right`.

- DraggableList: A drag-to-sort list with `Item` and `Cursor`; `Field.TextList` is built on it.

- Dropdown: The row-action menu: a trigger that opens a floating menu.

- DROPDOWN_KEEP_OPEN_ATTR: `data-dropdown-keep-open`: a click on an item carrying it leaves the menu open.

- Empty: The no-data placeholder.

- fetchRunner: The default runner: sends each turn to the app's own `runAgentTurn` endpoint.

- Field: The form-field namespace: a section wrapper and twenty members.

- FontFace: Adds one `ReactFont`'s `@font-face` rule in the browser; fonts from `.fonts()` are already handled.

- httpRunner: A runner that POSTs each turn to a URL you name, streamed or not.

- Image: An image from a `File` model or a URL, served through the Akan optimizer.

- InfiniteScroll: Loads the next batch when a sentinel scrolls into view; `reverse` prepends and keeps position.

- Input: The text input, plus `TextArea`, `Password`, `Email`, `Number` and `Checkbox`.

- inputRecipe: The field shell's className factory, and a recipe slot.

- KeyboardAvoiding: Lifts its children above the on-screen keyboard.

- Layout: The page shell: content containers such as `View` and frame slots such as `Navbar`.

- LegacyModal: The previous modal skin, with spring transitions and drag-to-dismiss.

- Link: Route-aware navigation, plus `Back`, `Close` and `Lang`.

- Load: The fetch-to-React bridge: `Units`, `View`, `Edit`, `Pagination`, `Page`, `Stream`.

- Loading: Six loading indicators, one per shape of waiting.

- maxAttachmentBytes, maxMessageAttachmentBytes, maxMessageAttachments: The composer's default attachment limits: 4 MB a file, 8 MB and five files a message.

- Menu: A navigation menu built from an item tree.

- Modal: The modal: drive it with `open`, or hand it a `trigger` that opens it on click.

- Model: The CRUD shells for a generated model store, with fifteen members.

- More: A list footer: infinite scroll on mobile, a pager elsewhere; `Load.Units` uses it by default.

- ObjectId: A document id cut to its ends, with the full id in a tooltip and a copy button.

- OverlayOwnerProvider, isOwnOverlayClick, OVERLAY_LAYER_ATTR, useOverlayLayerProps, useOverlayScope: How a menu tells a click in an overlay it opened from a click outside.

- override: Builds the manifest an `_overrides.tsx` exports; it returns the map unchanged and checks its types.

- Pagination: The pager, taking its numbers as props.

- Popconfirm: A small confirmation before a destructive action.

- Portal: Renders into the host element with the given id, SSR included.

- Radio: The radio group, with `Item`.

- RecentTime: A relative time label, with the absolute date in a tooltip.

- recipe, tv: The two factories every recipe is built from: `recipe(tv({ ... }))`.

- Reference: Helpers for an `@` reference: its token in the draft, its identity and its size cap.

- Refresh: Pull-to-refresh around a scrolling child.

- ScreenNavigator: A swipeable pager across `Screen`s, with `NavbarItem`; `namespace` publishes it to the agent.

- Select: The selector: single, multiple or searchable.

- SessionContext: The React context `Agent.Zone` and `AgentProvider` hand a session down through.

- Signal: The API explorer, in eight namespaces.

- Switch: An on/off toggle, drawn as a `role="switch"` button.

- System: The app shell: `Provider`, `Root` and four controls.

- Tab: Tabs split into parts so the panels stay on the server.

- Table: Draws rows you already have, with columns and an optional pager.

- Toast: The toast stack `System.Provider` mounts; you write into it with `msg.*`.

- ToggleSelect: A choice drawn as a row of buttons, with `Multi`.

- tokenCount: Formats a token estimate as a short label: `950`, `1.2k`, `3.4M`.

- Tooltip: A pure-CSS hint shown on hover or focus.

- triggerSlot: Clones a caller's trigger so aria state lands on the real control.

- UiOverrideProvider: The provider behind every `_overrides.tsx`; mount one yourself to override a subtree.

- Unauthorized: The no-access placeholder, shaped like `Empty`; you render it yourself.

- useAgent: Reads the enclosing session from a component.

- useAgentReference: Returns a function that puts data a component shows into the draft as an `@` chip.

- useUiOverride, useUiRecipe: How a component looks up its own component slot and recipe slot on the current route.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

