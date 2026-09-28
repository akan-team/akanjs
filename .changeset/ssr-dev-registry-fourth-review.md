---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): a tab reconnecting to a new dev session reloads onto its registry, and a late tab sees the failing build

- A tab that reconnects to a dev server with no SSR registry yet — a new `akan start`, a config restart, both of which
  clear `.akan` — reloads and waits for the new one, instead of refetching its payload onto the registry it already
  held. A new build id refetches the payload in place only when the tab holds the registry the server has.
- A page opened while a build phase is failing shows the error overlay at once; the status used to reach only the tabs
  open when it was sent.
- A tab reconnecting while a registry patch is held back for its pages build gets that patch with the RSC refresh, as
  the tabs that stayed connected do.
- A CSR registry rebuilt by a restarted builder reaches the open CSR tabs as their reload.
- A page waiting for its registry asks in short holds, so several such tabs do not keep every connection the browser
  opens to the dev server. A whole build cut short between its writes is rebuilt rather than patched, and a reload
  removes a patch file an earlier attempt left under its generation.
