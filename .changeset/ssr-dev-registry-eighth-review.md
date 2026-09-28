---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(dev): a fixed route or a recovered builder clears its overlay, and a recycling RSC worker never runs an older bundle than the server reports

- A route build that fails and then succeeds clears its overlay, even when no save moved the route cache in between,
  and a builder that came back after a failed config change no longer leaves "Config change failed to apply" on
  every new tab.
- A pages reload that recycles the RSC worker waits for the new worker: a bundle that throws there shows its error
  instead of passing for a success, a fix saved meanwhile is the bundle the next worker boots, and the worker being
  replaced keeps serving (the requests queued for its replacement included) when the replacement fails to start.
- After a failed reload the server reports the build the worker really runs, and only the reload that failed reports
  it; a route build that rode along no longer fails its request.
- A tab whose registry failed to boot still refreshes its RSC payload on a server save; the dev error page reloads
  when the build that failed to render it was fixed while its socket was down.
- The registry keeps a new root pending when its fix needs a whole build (a new npm import), drops a broken file no
  module imports any more, resolves a relative import as Bun does for `require` calls and package fields, and keeps a
  prepass resolution unless a new file shadows it.
- A killed boot build of the registry is retried before the next app of `akan start` boots beside it.
