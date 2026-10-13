---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

CLI fixes:

- **No prompt on a piped or closed stdin.** A missing argument, option, app, library, package or module fails at once with an error that names it. Before, the prompt read the piped input as its answer and printed it: `echo "$TOKEN" | akan upload-secret` without a NAME echoed the token into the log.
- **`akan typecheck`** with no name picks the workspace's only app again, as before library support.
- **`akan build`** bakes the build's own environment into the route and CSR bundles. That is `--env`, else the root `.env`: the same environment the server env plugin and the Dockerfile use. A shell `AKAN_PUBLIC_ENV` that named another one used to make SSR throw "env/env.server.<env>.ts is not in this build".
- **A workspace on an older akanjs.** A workspace whose native API is older than 0.11 is refused with "install matching versions of akanjs and @akanjs/cli", instead of crashing on a missing function.

Upgrade note: a CI step that relied on answering a prompt through stdin now fails fast; pass the argument on the command line.
