---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph maps `page/`. Each route file is a `route` node named by its URL pattern after the locale (`route:apps/demo:/memo/:memoId`, groups dropped as the router drops them), and each `_layout.tsx` is a `layout` node keyed by its folder (`layout:apps/demo:/(app)`, `root` for a `rootLayout()`). A `wraps` edge runs from each layout to the routes and layouts directly inside it, located at the wrapped file. A route or layout whose default export runs `.guard()` reads `guard` and links each function its guard calls that the file imports or declares: `.guard(() => signedIn())` reaches `signedIn` in `@libs/shared/webkit`, with its location and the comment above it, and a function declared in the page itself is keyed by that file (`guard:apps/demo:page/pin.tsx#isOwn`). A call to anything else (`Boolean`, akanjs's `redirect`, a package's `dayjs`) is looked through, a helper handed to a guard (`isOwn(isId(id))`) is not a guard, and an imported guard is looked up under its import path first. A layout's guard gates every route it wraps; the routes themselves do not repeat it, so a guard added to a layout marks only that layout changed in the Change Map. A route's default export, or the const it names (`const route = page()…; export default route`), is the route node itself, so the slices and actions a page uses hang off its URL. `_overrides.tsx` and the git-ignored `page/(libs)/` links are left out; a lib's own pages are its routes. A route's digest covers its whole file, so the Change Map marks an edited page changed instead of listing it as unmapped.

An unscoped `get_graph` still answers a graph of up to 600 nodes whole. Past that, it first drops the routes and layouts that neither changed nor use a change, and the route-only guards they leave unlinked, before it asks for a scope; an `app` or `module` scope brings them back. Studio's first column reads "Pages & components".

- **`route`, `layout` and `wraps`** join `AkanGraphNodeKind` and `AkanGraphEdgeKind` in `akanjs/common`.
- **The fact reader** in `@akanjs/language` now also exposes `importsIn`, `docOf` and `extentOf`.
