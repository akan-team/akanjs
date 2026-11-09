---
"akanjs": patch
"@akanjs/cli": patch
---

Akan Studio draws the running server's DI graph and jobs.

- **The Runtime view** (`/_akan/studio?view=runtime`) reads the container of the server that answered, the same data `/_akan/deps` and `/_akan/signal` serve, and is labelled live: it needs a running server and says which process it read (pid, server mode, replica).
  - Jobs, services by boot stage and adaptors by boot stage are laid out so every arrow points from what injects to what it injects. A role is folded into the adaptor that implements it.
  - Each job lists its schedule. A job this process does not run is greyed, with the reason as its tooltip. Behind the gateway only a federation or all child answers, so with separate federation and batch replicas every batch-only job shows greyed. The modules the server left out are listed under the diagram.
  - `module=` scopes it to one module and its neighbours. `/_akan/studio/graph?view=runtime` returns `{ app, deps, signal }`, each part an `{ error }` when its serializer failed.
- **`akan studio <app> --view runtime`** prints its URL.
