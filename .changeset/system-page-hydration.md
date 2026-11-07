---
"akanjs": patch
---

The built-in 404 page for a path no route matches hydrates without a React hydration error in an app whose root layout sets `.theme("dark")` or `.theme("light")`. The server adds the theme to `<html>` as `data-theme`, which the 404 document's own `<html>` never named, so the browser logged "A tree hydrated but some attributes of the server rendered HTML didn't match" on every unknown URL. The 404 document now tolerates that attribute, as route documents already do.
