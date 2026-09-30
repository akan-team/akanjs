---
"akanjs": patch
---

fix: a desktop app's server no longer hands `BUN_BE_BUN` to the programs it starts

The shell runs the server it carries as Bun through `BUN_BE_BUN=1`, and every child inherited it: a tool in the app's
`bin` built with `bun build --compile` started as the Bun CLI instead of itself. `AkanApp` takes the variable off
`process.env` at boot and gives it back only to a spawn of its own executable (the ops snapshot). A child started with
`Bun.spawn` and no `env` still gets the environment the process started with, so pass `env: process.env`.

The ops snapshot child also gets the runtime flags the server started with (`process.execArgv`), so in a carried
server it reads no stray `.env` or `bunfig.toml` from the data folder and trusts the same certificates.
