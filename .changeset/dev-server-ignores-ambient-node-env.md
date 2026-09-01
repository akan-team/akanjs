---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): `akan start` is the dev server even when the environment says `NODE_ENV=production`

An ambient `NODE_ENV=production` turned every route of the dev server into a 500:

```
[SSR] render failed scope=/en/: [SSR] route /:lang missing from production artifact — rebuild with `akan build` to include it
```

`WebRouter` picked its mode from `NODE_ENV` alone, so it installed the production route cache — the one whose
`buildRoute` throws because `akan build` was supposed to have written a routes manifest already. A dev artifact
never has one, so nothing could render, and the same ambient value also sent the gateway's runtime directory to
`<workspace>/runtime` and baked production React into the dev bundles.

The value does not have to be exported to arrive: Bun auto-loads the workspace `.env`, so a `NODE_ENV=production`
line in a downloaded env file reaches the CLI while `env | grep NODE_ENV` in the shell stays empty. A CI image
default or a container base image does the same.

**The command now outranks the environment.** `akan start` pins `NODE_ENV=development` for the processes it
spawns and for the in-process builder that bakes the value into dev bundles; `AkanApp` resolves a child's
`NODE_ENV` from `AKAN_COMMAND_TYPE` before falling back to the inherited value; and `WebRouter` refuses the
production branch outright while dev-hosted, warning once that it did rather than failing every request. Running
a built artifact (`bun main.js`, Docker) is untouched — it carries no command type and keeps honouring
`NODE_ENV`.
