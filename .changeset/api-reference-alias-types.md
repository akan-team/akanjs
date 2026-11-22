---
"@akanjs/cli": patch
---

The API reference the skills carry (`akanApi-*.md`) prints, under a signature, the definition of each akanjs type alias its parameters or return type name and the reference does not document on its own. `usePageLocation()` returns `searchParams: BaseSearchParamsState`, and the line below it now says that is `{ [key: string]: string | string[] }`, which agents had grepped `node_modules` for.
