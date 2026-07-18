# Display

- Source: /references/ui/display
- Mirror: /llms/pages/references/ui/display.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Display UI (#display-ui)

## Content

Display

Namespace for generated model list and dashboard displays. `Data.ListContainer` is the main high-level component; lower-level helpers include `TableList`, `CardList`, `Pagination`, `Dashboard`, and `Insight`.

Feature-rich generated model list container.

Table-style list wired to generated store state.

Pagination control bound to generated slice page state.

Localized relative-time label with a tooltip containing the absolute date. It switches from relative labels to formatted dates after the configured break unit.

Date value to render. Null renders nothing.

Unit where relative display stops and date formatting begins.

Automatic compact format or full date-time format.

Namespace of loading indicators for async UI: full-area overlays, buttons, inputs, progress bars, skeletons, and spinners.

Absolute overlay for blocking a local area.

Skeleton placeholder for pending content.

Button-friendly loading indicator.

Simple spinner.

Standard no-data state with a localized default description and optional content below the empty body.

Custom empty-state text. Defaults to localized `base.noData`.

Minimum empty body height in pixels.

Optional follow-up action or explanation rendered below the empty state.

Responsive table wrapper used by data-heavy screens. It supports column renderers, row click handlers, loading state, empty state, and optional `Pagination`.

Header/cell definitions with optional responsive visibility.

Rows rendered by the table.

Pagination config or false to disable.

Factory for row events such as click navigation.

Standalone page-number control. Use it when pagination state is local; use `Data.Pagination` when the state is generated from a model slice.

Current 1-based page number.

Total item count.

Number of items per page.

Called with the selected 1-based page number.

Display UI

Display components render model lists, timestamps, loading feedback, empty states, and table/pagination surfaces. Prefer `Data` for generated model lists and standalone helpers for local UI state.

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

