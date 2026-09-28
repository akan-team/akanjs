---
"akanjs": patch
---

fix(dev): an SSR client component that also exports constants patches in place, and a page loaded right after a save hydrates cleanly

- A `"use client"` module the RSC payload names, with exports besides components (`AkanjsHeader` and its link lists),
  now re-runs in place and keeps component state, instead of reloading the page. Nothing outside the registry reads
  its other exports: the server holds the module only as references by name.
- The route of an edited client component is invalidated as soon as the save is reported, not when its pages build
  lands: a page loaded in between rendered its HTML from the old server-side client code and hydrated with the new
  registry code, so the edit went missing behind a hydration mismatch.
- A patch whose load the browser cancelled while leaving the page is retried once instead of reloading, which used to
  cancel the navigation the user had started.
