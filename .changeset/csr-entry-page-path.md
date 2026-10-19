---
"akanjs": patch
---

In a CSR bundle (a native app, or `?csr`), `usePage().path` called in a `page()` / `layout()` render, or in a route's `.loading()`, now returns the path of the screen that render draws. A pushed screen renders before the URL moves to it, so it used to read the previous screen's path: a tab layout that hides its tab bar on pushed screens left the bar, and the bottom inset it reserved, on the pushed screen. The path holds until the render's first `await`, which is why `usePage()` comes first in a render. A component rendered below the route, and a legacy `export default function` route module, still read the URL.
