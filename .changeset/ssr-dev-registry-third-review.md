---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): the dev registries survive builder and backend restarts and a whole build that fails

- A signal save no longer leaves the SSR and CSR registries on the old endpoints until the next `akan start`. A
  registry records the signal and dictionary sources its client runtime inlines, and a builder that loads one built
  before a later save rebuilds it — including the builder that replaced the one the save restarted, which used to die
  before its rebuild ran. A build worker now exits with the builder that spawned it. The SSR registry no longer
  rebuilds for a dictionary save: an SSR page's client runtime inlines no dictionary.
- A whole registry build compiles before it writes anything, so one that fails on a module the user broke keeps the
  registry the tabs and the next save read, where it used to leave none. Route builds no longer retry a failed build
  each, holding the lock the fixing save waits on. An SSR page whose registry is not there yet keeps waiting for it
  instead of giving up after a minute, and a page whose registry load failed reloads once a newer one exists.
- A tab that reconnects after a backend restart loads the registry patches it missed and refetches its payload instead
  of reloading, so a `common/` helper both the server and a client component render updates in place though it
  restarts the backend. Each hello reads the registries on disk, so a rebuild that lands while the backend is still
  starting reaches the tabs.
- A typo in a new bare import is reported at once instead of going to a build worker, and a save no longer reuses an
  import a sibling file resolved through Bun's runtime resolver, which ignores the `browser` condition.
- A route build's registry update reports its build status under the builder's generation, and a file saved twice
  before its pages build lands has its routes invalidated once.
