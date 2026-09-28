---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(dev): the RSC worker keeps the newest pages bundle, a failed build stays on the overlay, and a broken new file no longer holds every save

- A route build that lands while a save's pages bundle is still loading no longer puts the RSC worker back on the
  bundle before it; the save's RSC refresh and held client patches go out once the worker runs the new bundle.
- A pages bundle that builds but throws while it loads shows its error on the overlay and lets the save's client
  patches through at once, instead of 15 seconds later; the worker keeps serving the bundle it had.
- A registry failure stays on the overlay until the save that fixes it: a route build that found nothing to add no
  longer reports the registry as fine, so a tab opened meanwhile sees the error and the fix clears it.
- A tab reconnecting to a restarted dev server drops an error the server no longer has (a route error fixed by the
  save that restarted it).
- A new client file that fails to compile, and that no page imports any more, no longer fails every later save; while
  a page still imports it, its error is shown and other saves still reach the tabs.
- Renaming a file by case only (`card.tsx` to `Card.tsx`) moves its module to the new name instead of keeping the old
  code in the registry, and a file created beside a folder a relative import resolved to (`Foo.tsx` next to
  `Foo/index.tsx`) takes that import over, as it does for the server.
- A registry whose module files went missing (a builder killed mid-write, a file restored after it was deleted)
  compiles them again instead of failing every save.
- A tab that booted beside the vendor file of the build before now loads the newer one too, so a new npm import in a
  leaf component (or a lazy one) works without a manual refresh.
- A save during a route's first build builds that route twice, not three times, and a server file saved together
  with a client component rebuilds the routes it may add a client component to. A save that reaches every route no
  longer rebuilds the client entries they already hold, nor reloads the RSC worker for an unchanged manifest.
- A registry build whose worker was killed at boot is retried 10 seconds later for the page that asked, rather than
  on the next save only; a worker killed mid-batch fails only the steps it had not finished.
