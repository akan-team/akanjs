---
"akanjs": patch
---

`usePageLocation()` on an SSR page now reads the router's query, so `viewInUrl`, `?filter=` links and the dashboard's selected tile see the URL's params. They read none there before: the SSR page wrapper carried no search params and never followed a shallow replace, so opening a view wrote a URL without the page's other params and a link's `action=view&modelId=` opened nothing. The wrapper's server render now reads the request's query (the path the locale proxy hands it carries none), and the base store starts from the address bar, so the first browser render matches the server's. The page's pathname stays the one it was rendered for.
