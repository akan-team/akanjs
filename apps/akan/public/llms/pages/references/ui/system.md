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

System namespace for app-level chrome and runtime helpers. It chooses CSR or SSR provider by render mode and exposes theme/language/reconnect/dev-mode helpers.

Theme switching control.

Language selector.

Reconnect helper for local or unstable sessions.

Small Suspense boundary for content that should be rendered client-side with an optional fallback.

Client-side content.

Suspense fallback.

Admin and developer-facing signal inspection namespace. It renders API/signal documents, arguments, listeners, WebSocket/PubSub views, and message payloads.

Documentation viewer for signal definitions.

REST API signal view/test surface.

Realtime signal surfaces.

Payload and argument renderers.

Compound tab state namespace. It provides a provider plus menu and panel components that share active menu state through context.

Provider/root for tab state.

Container for tab menu items.

Selectable menu item.

Content visible for a matching menu key.

Small re-export of react-spring animated primitives used by Akan UI components and custom animated surfaces.

Animated div primitive.

Animated SVG group primitive.

Animated progress element.

System UI

System UI components are app-shell and admin helpers, not normal feature widgets. Use them in root layouts, admin pages, signal dashboards, tabbed detail views, and animation-heavy UI.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

