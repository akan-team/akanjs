---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): the SSR dev registry recovers from failed builds and startups, and keeps a save's order through a build worker

- A save that creates the module a failed server import was waiting for now refreshes the page: a failed pages build
  carries its saved files over to the next one, and a file the next build reads for the first time counts as a server
  change.
- A client-side startup error (a store that throws in the browser) no longer leaves the tab deaf: the next update
  reloads it onto the fixed code. A registry reload now reaches a tab whose registry never started, and the dev
  server's error page carries the HMR client, so a server error page reloads once the save that fixes it lands.
- A save handed to a build worker keeps its hold, so its client patch still waits for its RSC refresh.
- A new file's bare imports resolve from what its package already resolved, so adding a component or an import no
  longer sends the save to a build worker; the builder logs how often each reason still does.
- A save that changes nothing the server renders keeps the page's build id: a tab that reconnects stays, and the
  router keeps partial navigation.
- A patch whose load failed asks the server before reloading: a navigation the user started is no longer cancelled
  by it. Also: saves during the first CSR build patch CSR once it lands, a module deleted and brought back rejoins the
  registry, a route move handed to a worker reloads, and a failed slow-lane job no longer exits the dev builder.
