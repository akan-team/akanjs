---
"@akanjs/devkit": patch
---

`akan build`, `akan verify` and `akan start` stop with an error naming the import chain when the server pages bundle would import `react-dom/server` as it loads, instead of building a bundle whose RSC worker throws "react-dom/server is not supported in React Server Components" at boot. A module in the page graph that dynamically imports the app's `server.ts` is the usual cause: it brings the whole server, SSR renderer included, into the pages bundle.
