---
"akanjs": minor
"@akanjs/devkit": patch
---

`router.push` / `router.replace` take `{ shallow: true }`: on an SSR page a query-only change writes the URL and the store without asking the server for the page, and back/forward between such entries stays shallow. `Tooltip` draws on the overlay layer and flips to the side with room, so it no longer clips inside a scrolling list or widens it. An SSR document links `rootLayout().manifest()` at `/manifest.webmanifest` (the basePath's own when it is visible), which the server answers, instead of a `data:` URL. An input smaller than 16px is drawn at 16px on a touch screen, where iOS would zoom into it, and a caller's own `text-*` still sets its size. `BottomSheet` reports a dismissal once and never on mount, locks the page while open, pads for the safe area, and opens on the overlay layer above the frame. `Agent.useScreenActions()` lists the screen's argument-free tools for a command palette. Upgrade note: `Tooltip`'s bubble is no longer in the DOM until it opens; a test that read it beside its trigger reads the trigger's own text instead.
