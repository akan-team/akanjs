# Lazy Loading

- Source: /cheatsheet/performance/lazy
- Mirror: /llms/pages/cheatsheet/performance/lazy.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Lazy Loading (#overview)
- External Libraries (#external)
- Large Components (#internal)
- SSR Or Client Only (#ssr)
- Tips (#tips)

## Content

Lazy Loading

Lazy loading means the first page does not download every heavy component right away. Load expensive UI only when the user reaches it.

Good for maps, charts, editors, 3D viewers, and wallet widgets.

Good for large admin panels that are not always opened.

Not useful for tiny buttons or above-the-fold content.

External Libraries

Some libraries are large or depend on browser-only APIs such as `window`. Wrap them with `lazy` and disable SSR when needed.

Map widget

Large Components

You can also split your own components. This is useful when a page has a heavy editor or dashboard that opens only after a click.

Lazy editor

SSR Or Client Only

Use default lazy when the component can render on the server.

Use `{ ssr: false }` when the library needs `window`, `document`, canvas, WebGL, or browser storage.

Always give a loading fallback when the blank space would be confusing.

Tips

Split by user intent: editor, map, chart, modal, viewer.

Do not lazy-load the first thing users need to see.

If many pages use the same component immediately, lazy may only add delay.

## Code Examples

### Code

```ts
"use client";
import { lazy } from "akanjs/webkit";

const MapWidget = lazy(() => import("heavy-map-widget"), {
  ssr: false,
  loading: () => <div className="skeleton h-64" />,
});

interface ArticleMapProps {
  center: Point;
}
export const ArticleMap = ({ center }: ArticleMapProps) => {
  return <MapWidget center={center} />;
};
```

### Code

```ts
import { lazy } from "akanjs/webkit";

const ArticleEditor = lazy(() => import("./ArticleEditor"), {
  loading: () => <div>Loading editor...</div>,
});

interface EditPanelProps {
  open: boolean;
}
export const EditPanel = ({ open }: EditPanelProps) => {
  if (!open) return null;
  return <ArticleEditor />;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

