# Core

- Source: /references/ui/core
- Mirror: /llms/pages/references/ui/core.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Core UI (#core-ui)

## Content

Core

Route-aware navigation component. It renders CSR or SSR navigation depending on the Akan render mode, and falls back to a non-clickable div when disabled or href is empty.

Destination route. Empty values render children without navigation.

Prevents navigation while keeping the same visual layout.

Class applied when the current route matches the link.

Scrolls to the top after client-side navigation.

Namespace helpers: `Link.Back`, `Link.Close`, and `Link.Lang` cover common navigation actions.

Akan image component for `ProtoFile` objects and direct URLs. It can derive width, height, and blur data from file metadata and uses the Akan image optimizer in SSR mode.

Direct image URL. Takes precedence over file metadata.

File object with `url`, `imageSize`, and optional `abstractData`.

Blur/placeholder preview data.

Marks the image as high-priority and eager-loaded.

Skips Akan image optimization.

Namespace of lightweight layout primitives used throughout module templates, units, views, headers, sidebars, bottom tabs, and zones.

Vertical form/template container with default spacing.

List/card item container that becomes clickable when href is provided.

Constrained detail page container.

Section container for feature zones and page blocks.

Namespace for data loading bridges between Akan fetch results and React rendering. It is commonly used for model detail pages, edit pages, pagination, and server/client page loading.

Hydrates a full model view and renders it through `renderView`.

Loads edit payloads for model edit/new workflows.

Shared SSR/CSR page loader wrapper.

Renders list/unit data from pagination-style results.

Namespace of model workflow shells for generated Akan stores: view wrappers, edit/new modals, removal flows, and admin panels.

Modal editing shell wired to generated model store actions.

Wrapper for opening and initializing a new-model form.

Wrapper for rendering full model view state.

Removal action connected to generated delete flows.

Use `Model` components inside module `Util`, `View`, or `Zone` files where generated store actions are already available.

Core UI

Core UI components are the most common `akanjs/ui` imports in apps and libs. They compose routing, images, layout containers, fetch loading, and model store workflows.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

