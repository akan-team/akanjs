# Console

- Source: /cheatsheet/dev/console
- Mirror: /llms/pages/cheatsheet/dev/console.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Server Console (#overview)
- Local Console (#local)
- Multi-line Input (#multiline)
- Container Console (#container)
- Console Process (#lifecycle)
- Globals And Commands (#globals)
- Safety (#safety)

## Content

Console

Server Console

The server console is a JavaScript prompt inside your app's server. Use it to inspect services and run small operator commands.

Command

- akan console myapp: Local development: boots the app from its source in the workspace.

- AKAN_CONSOLE=1 bun console.js: Docker or Kubernetes: runs the `console.js` that `akan build` puts next to `main.js`.

**Never create console files inside a running container or pod.** The image already ships `console.js`.

Local Console

Open it to inspect a service, call a method, or try a query without writing a script file. Run it from the workspace root with the app's name:

**The prompt reads `akan:myapp>`.** Type `.help` to list the commands and input rules.

**Work you will repeat belongs in a script.** See Scripts.

Multi-line Input

Paste a snippet as it is: the console runs a pasted block as one command, not line by line. So a `const` declared on the first line is still visible on the last one:

To

Do this

- Keep a value for later — Assign without a keyword, as in `users = service("user")`, since `const` and `let` last one command.

- Print a block's result — End the block with `return <expr>`, which a lone expression does not need.

- Finish an unfinished line — Keep typing at the `...` prompt until the open bracket, string or comment closes.

- Throw away pending input — `.clear` or Ctrl+C.

- Close the console — Ctrl+D, `.exit`, `.quit`, or Ctrl+C on an empty prompt.

**`await` works at the top level.** No async wrapper is needed.

**A typo can hold the prompt at `...`.** A stray `}` looks like an unfinished block, so type `.clear` and paste again.

**Results print up to 5 levels deep** and up to 100 array items.

Container Console

In Docker or Kubernetes, run the `console.js` already in the image. Put `AKAN_CONSOLE=1` on the exec command itself.

Replace `myapp` with your container name:

The Akan Helm chart runs the `app` container of `app-deployment`. The namespace is the app name plus the branch, such as `myapp-main`:

When the flag is required

The console refuses to open without `AKAN_CONSOLE=1` when any one of these settings points at production:

Setting

Refuses when

- AKAN_PUBLIC_ENV — It is `main`.

- AKAN_PUBLIC_OPERATION_MODE — It is `cloud` or `edge`; unset, it counts as `cloud` unless the env is `local`.

- NODE_ENV — It is `production`.

So where you open it decides whether you need the flag:

Where

Flag

- Local `akan console` — Not needed while `.env` keeps both the env and the mode at `local`.

- Docker, Kubernetes — Always needed, since the image sets `NODE_ENV=production` and the mode to `cloud`.

**Set the flag on the exec command, never in the deployment env.** It is the one deliberate step before a console reaches production data. Kept in the env, every shell in the pod can open one.

Console Process

The console is a second process, not a window into the running one. It boots its own server next to the app, inside the same container or pod.

Shared With The App

Env, secrets, mounted volumes, network, and database access.

Not Shared

The running `main.js` process and its in-memory state. The console never attaches to them.

**It listens on nothing.** The console's server opens no port and serves no pages, so it takes no traffic.

**It runs none of the app's background work.** Internal `init`, `interval`, `cron` and `timeout` jobs and queue workers stay with the app, so nothing runs twice.

**Services and adaptors still start.** Each `onInit` runs, so the console opens the same connections the app does.

**It opens no log stream of its own.** `.tail` and `.trace` read the running server's logs, as the next section shows.

Globals And Commands

The console puts runtime helpers and the app's generated exports in scope, so most commands fit on one line.

Globals

Name

- server: The booted server instance.

- env: The server config the app booted with (`env/env.server.<env>.ts`), which can hold secrets.

- service, signal, adaptor: Look an instance up by its refName, as in `service("user")`.

- get: Look an instance up by its service, signal or adaptor class, as in `get(srv.shared.UserService)`.

- methods: Lists the method names on an object's prototype chain, sorted.

- debug: Summarizes status, server mode, environment, and every registered service, signal and adaptor.

- srv, sig, db, cnst, dict, option: The app's generated exports, as `server.ts` exports them.

**A lib's exports sit under the lib's name.** The user service from `libs/shared` is `srv.shared.UserService`.

**Any other name is the ordinary global,** so `process.env` and `Bun` work as usual.

Dot commands

- .help: Lists the commands and the multi-line input rules.

- .globals: Lists the console's globals, including the values you assigned.

- .clear: Throws away the pending multi-line input.

- .exit, .quit: Closes the console.

- .tail: Follows the running server's logs through filters until `.tail off`. — Example: `.tail level=warn grep=payment endpoint=mutation:*`

- .trace: Prints every buffered record of one request. — Example: `.trace <traceId>`

**`.tail` takes the `akan logs` filters as `key=value`:** `level`, `grep`, `endpoint`, `origin`, `trace`, `child`, `role`, `since`. A bare `.tail` shows what it follows.

**Both need the app running.** Locally that is `akan start myapp`; with nothing running, the console answers `myapp is not running`.

First commands

A few commands to get your bearings, one per line:

Safety

A change made in the console lands on real data at once, with no review step. Four habits keep that safe:

**Check the target first.** Print `debug().env` and confirm the environment before changing data.

**Change data through service methods.** `updateUser` runs the service's update hooks; a direct database write skips the domain rules.

**Script destructive work.** Write a script with a dry run or a confirmation instead of typing many commands by hand.

**Keep `AKAN_CONSOLE=1` out of deployment config.** Set it on the one exec command that opens the console.

Related pages

- Scripts — Repeatable operator work, with a dry run.

- Live Tail — Every filter `.tail` accepts, from the terminal.

- Docker — Opening the console in a compose setup.

- Kubernetes — Opening the console in a running pod.

## Code Examples

### Terminal

```bash
akan console myapp
```

### Terminal

```ts
const users = service("user");
const user = await users.getUser("6890f2c1f0a1b2c3d4e5f6a7");
return await users.updateUser(user.id, { nickname: "checked" });
```

### Terminal

```bash
docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

### Terminal

```bash
kubectl exec -it -n myapp-main deploy/app-deployment -c app -- \
  sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

### Terminal

```ts
process.env.AKAN_PUBLIC_ENV
env
debug()
methods(service("user"))
await service("user").__count()
await get(srv.shared.UserService).__count()
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

