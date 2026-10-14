---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A module's `serve(ref, { operationMode: ["edge"] }, …)` mounts only in the operation modes it lists, and `modules: ["@edge"]` / `AKAN_MODULES=@edge` names every module that lists edge; a selection now also mounts the targets of its modules' relation fields. `native.desktop.server` takes `{ profile, modules }`: `profile: "edge"` bundles `env/env.server.<env>.edge.ts` in place of the environment's own file, which no longer reaches the computers the app is installed on, and the build refuses a profile file whose secret-named keys hold a value; `akan build <app> --profile edge` does the same for an image. Machine tokens: `MachineToken.issue({ kind, id, version })` signs an Ed25519 JWT with `AKAN_MACHINE_PRIVATE_KEY` (`akan machine-keygen <file>` writes one), a server with that key or `AKAN_MACHINE_PUBLIC_KEY` sets `account.machine` from a verified token on HTTP and websocket calls and strips any other, and `.with(Machine)` reads it. React 19.2 boots again: view transitions turn on only where React has them.
