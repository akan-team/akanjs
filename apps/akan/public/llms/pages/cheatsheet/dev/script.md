# Script

- Source: /cheatsheet/dev/script
- Mirror: /llms/pages/cheatsheet/dev/script.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Scripts (#overview)
- Create And Run (#command)
- Server Lifecycle (#lifecycle)
- Use Services (#service)
- Lookup Helpers (#lookup)
- Change Data Safely (#tips)

## Content

Script

Scripts

A script is a TypeScript file that boots your app's server, does one job, and exits. Reach for it when the job should live in a file rather than at a prompt:

Command

Form

Good for

- `akan script` — A file in `script/` you can review and rerun — Seed data, migrations, checks, small maintenance fixes

- `akan console` — A prompt that is gone when you close it — Inspecting a service, trying a query, one small operator command

**Same wiring as the app.** A script reuses the services, signals and adaptors the app already wires together.

**No traffic, no schedules.** It opens no port and runs none of the app's init, interval, cron or queue jobs.

**Small and disposable.** Keep one job per script, and delete it once the job is done.

- Server Console — Inspect services and try queries at a prompt.

- akan script Reference — The command's signature and arguments.

Create And Run

Put the file directly in the app's `script/` folder, then pass its name to `akan script`.

Create `apps/koyo/script/hello.ts`. The next section shows what goes in it.

From the workspace root, pass the app name and the file name. This runs `apps/koyo/script/hello.ts`:

Arguments

Both arguments may be left out, and the command then asks. They are positional, so the app comes first:

- app (String): The app name, needed with a file name. Left out, it asks from a list or uses the only app. — Example: `koyo`

  - optional

- filename (String): A file directly in `script/`; the `.ts` suffix is optional. Leave it out to pick from a list. — Example: `hello`

**No subfolders.** A name containing `/` or `..` is refused, so keep every script at the top of `script/`.

**It runs from the app folder.** The working directory is `apps/koyo/`, so relative paths start there.

Server Lifecycle

Every script has the same frame: start the server, do the job, and stop the server in `finally`. The smallest script looks like this:

**`server` is the app's own.** It comes from `apps/koyo/server.ts`, so the script boots the same modules the app does.

**`start()` wires the app but opens no port.** Under `akan script` it connects the databases and creates the adaptors, services and signals, and stops there.

**`stop()` belongs in `finally`.** Even when the job throws, database connections, timers and adaptors are cleaned up.

Use Services

Do the work through services rather than direct database writes. A service already knows the domain rules, the database access and its other dependencies.

This script finishes every ice cream order still left in `served`:

**`server.get(srv.IcecreamOrderService)`** finds the service by its class, so every method is typed.

**`listByStatuses`** comes from the model's `byStatuses` filter. Every filter gives the service a `list<Filter>` like it.

**`finishIcecreamOrder`** runs the same state check the app does, so an order that is not `served` is refused.

Lookup Helpers

Once `server.start()` resolves, `server` hands out any service, signal or adaptor the app registered. Prefer a class to a name string, which is not type-checked.

Finds by

Call

What you get

- server.get(srv.IcecreamOrderService) — Class — A service, signal or adaptor instance, fully typed.

- server.get(StorageAdaptorRole) — Role — The storage adaptor the app actually uses, whatever its implementation.

- server.getService("icecreamOrder") — refName — A service.

- server.getSignal("icecreamOrder") — refName — A signal, when the script should run signal logic.

- server.getAdaptor("blobStorage") — refName — An adaptor, for infrastructure work.

**A refName is the name a module registers under.** For a service or signal it is the camelCase module name, such as `icecreamOrder`; for an adaptor it is the key passed to `adapt()`.

**A lib's classes sit under the lib's name,** as in `srv.shared.UserService`.

**Import `StorageAdaptorRole` from `akanjs/service`.** A role finds the adaptor even after the app swaps in its own implementation.

**Look up only after start.** Until `await server.start()` resolves, every lookup throws.

Change Data Safely

A script that changes data should show what it is about to do before it does it. Three habits cover most of it:

**Print the target environment first.** `getEnv().environment` names the environment the script is about to change.

**Make a dry run the default.** It only shows what would change. Read an env var such as `APPLY=1`, and change nothing without it.

**Write through service methods.** The domain rules then stay in one place instead of being copied into the script.

Here is the script from above with the first two habits added:

Run it once to read the count, then again to apply it:

**`AKAN_PUBLIC_ENV` picks the environment.** The server reads the matching `env/env.server.<env>.ts`, and a new workspace's `.env` sets it to `local`.

**A `return` inside `try` still reaches `finally`,** so the dry run stops the server too.

**Nothing after the file name reaches the script.** `akan script` takes only the app and the file name, and an extra argument or unknown flag is an error. Environment variables do reach the script, so pass a flag as one.

## Code Examples

### Terminal

```bash
akan script koyo hello
```

### apps/koyo/script/hello.ts

```ts
import { server } from "../server";

const run = async () => {
  await server.start();

  try {
    console.info("hello from script");
  } finally {
    await server.stop();
  }
};

void run();
```

### apps/koyo/script/finishServedOrders.ts

```ts
import { server, srv } from "../server";

const run = async () => {
  await server.start();

  try {
    const icecreamOrderService = server.get(srv.IcecreamOrderService);
    const servedOrders = await icecreamOrderService.listByStatuses(["served"]);

    console.info("served orders", servedOrders.length);

    for (const order of servedOrders) {
      await icecreamOrderService.finishIcecreamOrder(order.id);
    }
  } finally {
    await server.stop();
  }
};

void run();
```

### apps/koyo/script/finishServedOrders.ts

```ts
import { getEnv } from "akanjs/base";
import { server, srv } from "../server";

const isApply = process.env.APPLY === "1";

const run = async () => {
  await server.start();

  try {
    console.info(`environment: ${getEnv().environment}, apply: ${isApply}`);

    const icecreamOrderService = server.get(srv.IcecreamOrderService);
    const servedOrders = await icecreamOrderService.listByStatuses(["served"]);

    console.info("served orders", servedOrders.length);
    if (!isApply) return;

    for (const order of servedOrders) {
      await icecreamOrderService.finishIcecreamOrder(order.id);
    }
  } finally {
    await server.stop();
  }
};

void run();
```

### Terminal

```bash
akan script koyo finishServedOrders
APPLY=1 akan script koyo finishServedOrders
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

