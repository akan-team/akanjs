---
"@akanjs/devkit": patch
---

The `akan-page` skill's URL-kept filter line now says two more things an agent had to open the source for. On the server `usePageLocation()` returns the request's query, so the first HTML already shows the filter the URL names. A text box is kept the same way, with `value` from `searchParams` and a shallow replace on every change, because the replace writes `searchParams` before it returns.
