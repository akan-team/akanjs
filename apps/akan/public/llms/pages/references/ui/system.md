# System

- Source: /references/ui/system
- Mirror: /llms/pages/references/ui/system.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- System UI (#system-ui)

## Content

System

System UI

The parts around your screens rather than feature widgets: the app shell, theme and language switches, an API explorer, tabs, and animation. They go in root layouts, admin pages, signal dashboards, tabbed detail views, and animated UI, and all come from `akanjs/ui`.

Words used on this page

Term

- The frame every page renders inside, holding the theme, fonts, locale, toasts and socket.

- Suspense: A React boundary that shows a fallback until the content inside it is ready.

- serialized signal: Every endpoint with its arguments, guards and return model, shipped as `fetch.serializedSignal`.

- An action a control publishes so the in-page agent can do what the user's click does.

Pick a component

Component

- Auto

- Server — no "use client"

- Tool — st.tool

- App shell

- Controls you place

- Developer tools and primitives

Yes

No

**Auto means you never write it.** `Provider` wraps every page, and it mounts `Reconnect` when the root layout calls `.reconnect()`.

**Server means you add no `"use client"` yourself.** A page, layout or View renders these directly; the parts that need the browser carry their own. `Signal` parts and `animated` need a file that starts with `"use client"`.

**Tool means the in-page agent can use it too.** Placing `ThemeToggle` or `SelectLanguage` is enough for the agent to switch the theme or the language the same way the user does.

Related pages

- Root Layout Stages — `.theme()`, `.fonts()`, `.reconnect()` and the rest that fill `System.Provider`.

- Override Slots — Restyle the toast stack through the `Toast` and `ToastItem` slots.

- Constant Schema Docs — `Constant.Doc`, the model explorer that sits beside `Signal`.

- In-Page Agent — How the tools a control publishes let the agent drive the screen.

- System: The app shell. Akan mounts `Provider` for you, and `Provider` mounts `Reconnect` when you turn it on. `ThemeToggle`, `SelectLanguage` and `DevModeToggle` are controls you place yourself.

- ClientSide: A small React `Suspense` boundary. It shows `loading` while anything inside it suspends, such as a `lazy()` component still fetching its chunk.

- Signal: The API explorer, split into parts. It reads the serialized signal the server ships with the app — every endpoint, its arguments, guards and return model — and renders a document you can also call endpoints from.

- Tab: A tab set split into parts so the panels stay on the server. Only the provider and the menu hold state, and `Tab.Panel` renders what it is given, so the markup inside a panel never reaches the bundle.

- animated: A small re-export of react-spring's animated elements, the ones Akan UI components animate with. Drive them with a spring hook in your own animated surfaces.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

