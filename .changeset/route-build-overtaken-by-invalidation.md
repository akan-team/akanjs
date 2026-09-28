---
"akanjs": patch
---

fix(dev): a page loaded while a save's pages build lands no longer renders without the client components it names

- `akan start` drops a route's client build when a save invalidates it mid-build. The request that was waiting for
  that build rendered anyway, from a manifest missing the rows the build would have added, so the RSC payload carried
  an error row and the page came up blank. The route now builds again at the new generation before it renders.
