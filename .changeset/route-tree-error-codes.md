---
"akanjs": patch
---

The route tree, the RSC worker and the dev builder channel now throw coded `AkanError`s. Messages are unchanged, and each stays a 500.

- `invalidRoute`: a page module breaks the route conventions (an unsupported export, no default export, both `head` and `generateHead`), or the pages have no root route.
- `invalidArtifact`: the pages bundle the RSC worker imports exports no `pages`.
- `ipcRequired`: the RSC worker or the builder channel runs without the IPC channel its parent process opens.
- `rpcDisposed`: a build request reaches a builder channel that was disposed.
- `invalidRscResponse`: a full-page fallback answers with a patch.
- `clientComponentOnServer`: a client-only segment outlet is called on the server.
- `invalidConfig`: a `transformEnv` callback returns something other than the env object.
- `notRegistered`: no WebSocket adaptor is registered.
