# Edge Computing

- Source: /cheatsheet/general/edge
- Mirror: /llms/pages/cheatsheet/general/edge.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Edge Computing (#overview)
- Call Another Server (#call-remote)
- Send Commands (#commands)
- Errors Come Back (#errors)
- Listen To Status (#subscribe)
- Wrap A Remote Node (#remote-object)
- Very Fast Data (#fast-data)
- Run The Edge Site (#edge-site)
- Tips (#tips)

## Content

Edge Computing

In Akan, edge computing means one Akan server calls another with the same generated `fetch` your app already uses. Add one option, `{ origin }`, and the call goes to the other server.

Part

- Cloud server: Decides what should happen and sends commands to the edge.

- Edge server: Does the work close to the device or user, and reports status back.

- fetch + { origin }: Connects both sides with typed signal calls; only `{ origin }` differs from a local call. — Example: `await fetch.startJob(jobId, { origin: edgeOrigin });`

Call Another Server

Every generated `fetch` call takes an options object as its last argument. Put `{ origin }` there and the call goes to that server instead of your own.

**The origin ends in the API prefix.** fetch appends the endpoint path to it as-is, as in `https://edge-01.example.com/api`.

**Read the prefix, never write it.** It is configurable, so build the origin with `getApiPrefix()` from `akanjs/base` instead of an `/api` literal.

**The caller needs the endpoint too.** A `fetch` holds only the endpoints its own app and libs declare, so put the ones the edge serves in a lib both apps use, or run one app on both sides.

A health check that pings one edge server:

**`fetch.ping()` is built in.** Every Akan server answers it with `"ping"`, so you declare no endpoint for it.

**An unreachable server throws.** A refused connection or a timeout arrives as an `Err`, so the check catches it and answers `false`.

**Give a probe a short `timeout`.** Without one, a dead edge holds the call for the 30-second default.

Options for a remote call

- origin (string, query · mutation · pubsub): The server that receives the call: scheme, host and API prefix. — Example: `` { origin: `https://${host}${getApiPrefix()}` } ``

- timeout (number | false, default 30000, query · mutation): Milliseconds before the caller gives up; overrides the endpoint's `timeout`, and `false` waits.

- token (string, query · mutation): Sent as `Authorization: Bearer <token>`, so the remote guards judge that account.

- onResync (() => void, pubsub): Runs after the room is subscribed again following a dropped connection.

Send Commands

When the cloud wants the edge to do something, call an ordinary query or mutation with the same `{ origin }`. Arguments and return values stay typed. Build the origin once and pass it to each call:

**Long work needs a longer deadline.** A call gives up after 30 seconds unless the endpoint declares `{ timeout }` or the caller passes one.

**Declare it on the edge endpoint.** For firmware updates, provisioning and other slow jobs, every caller then gets the same budget.

**A timeout does not cancel the work.** The edge handler runs to the end after the cloud stops waiting, so check the job's status before sending the command again.

Errors Come Back

An `Err` the remote endpoint threw arrives here as that same `Err`: same key, same `data`, and `instanceof Err`. Let it propagate, and your own caller gets it too, so the browser toasts the sentence the remote server chose.

One error crossing two servers:

One error, two servers

What the caller catches

When

Thrown on the caller

- The remote endpoint threw an `Err` — The same `Err`, with its key, `data` and status code

- The connection was refused or the host did not resolve — `base.error.serverUnreachable` (503)

- No answer before the timeout — `base.error.gatewayTimeout` (408)

- A proxy in front answered 502, 503 or 504 with its own page — `base.error.serverUnavailable` · `base.error.gatewayTimeout`

**Never wrap the catch in `new Error`, or re-key it as a `new Err` of your own.** Both discard the key the remote chose, and a plain `Error` is generalized to `Internal Server Error` on the way out.

Listen To Status

When the edge keeps sending status, subscribe to its `pubsub` endpoint with the same `{ origin }`. The call returns an unsubscribe function; keep it and call it when you are done:

**One socket per edge server.** The first subscription with an `origin` opens a websocket to that server, and later ones share it.

**Events sent during a disconnect are lost.** Pass `onResync` to reload the current state once the room is back.

**The edge's pubsub declares its own `guards`.** A slice's guard map does not reach a pubsub, so a room without guards is open to any socket.

Wrap A Remote Node

When you talk to the same edge server many times, wrap it in a small class that remembers its origin and its unsubscribe functions:

**The origin lives in one place.** Every method reuses `#origin`, so no call can forget the `{ origin }` option.

**`close()` releases every subscription at once.** Call it when the edge goes offline or the worker stops.

**A plain class, not `adapt()`.** There is one per edge server, not one per process, so create it with `new RemoteEdge(host)` where you need it.

Very Fast Data

Keep commands and status on Akan fetch. Bytes such as telemetry or video frames can ride `pubsub(Binary)`; add another transport only for streams even that cannot carry.

Use

Data

- fetch.startJob(...): **Commands.** A query or mutation, with typed arguments and a typed result.

- fetch.subscribeJobStatus(...): **Status.** A pubsub room the edge publishes to.

- pubsub(Binary): **Telemetry, video frames.** Binary websocket frames; a slow subscriber gets the newest one.

- A separate transport: **Huge streams.** Add one only when `pubsub(Binary)` is not enough.

**Bytes skip JSON.** When the whole return is `Binary`, each payload goes out as a websocket binary frame and arrives as a `Uint8Array`.

**A slow subscriber gets the newest frame.** Declare `{ backpressure: "queue" }` on the pubsub when every frame must arrive, such as deltas against a base.

**Never send bytes as `Any`.** A `Buffer` inside `Any` turns into a JSON number array about 3.6 times larger.

Run The Edge Site

An edge site is usually one container that keeps its data in SQLite files. The cloud can run the same app as a cluster, from the same image.

Declare both database modes in `akan.config.ts`:

Each deployment of the image then says where it runs and where its data lives:

Setting

Edge site

Cloud cluster

- `AKAN_PUBLIC_OPERATION_MODE` — `edge` — `cloud`, the image default

- `AKAN_DATABASE_MODE` — `single` — `cluster`

- Data — SQLite files on a mounted volume that `AKAN_SQLITE_DIR` names — `POSTGRES_URL` and `REDIS_URI`

- Instances — One container — Several servers

**The operation mode and the database mode are independent.** `edge` or `cloud` says where the server runs; `single` or `cluster` says where its data lives.

**Only internals follow the operation mode.** An internal declared as `cron("0 4 * * *", { operationMode: ["cloud"] })` never runs on the edge, while every endpoint is served on both sides.

**Every deployment names its mode.** With two modes declared, `AKAN_DATABASE_MODE` is required; only a developer machine falls back to the first.

Tips

**Start with a normal signal.** If it works locally, it can usually be called remotely by changing only `{ origin }`.

**Keep edge hosts in the database.** Build each origin from `getApiPrefix()`, so a prefix change reaches every one of them.

**Always clean up subscriptions.** Otherwise a long-running worker leaks connections.

Related pages

- Minimal Compose — The compose file for one edge container and its volumes.

- Broadcast With pubsub — Declare a room, guard it, and subscribe to it.

- Error Handling — Declare error keys and pick a status code for each.

- Declare Endpoint — Endpoint options, including `timeout` for slow work.

## Code Examples

### apps/myapp/lib/_edge/edge.service.ts

```ts
import { getApiPrefix } from "akanjs/base";
import { serve } from "akanjs/service";

export class EdgeService extends serve("edge" as const, () => ({})) {
  async isEdgeAlive(edgeHost: string) {
    const origin = `https://${edgeHost}${getApiPrefix()}`;
    try {
      const result = await fetch.ping({ origin, timeout: 3000 });
      if (result !== "ping") return false;
    } catch {
      this.logger.warn(`edge server ${edgeHost} did not answer`);
      return false;
    }
    this.logger.info(`edge server ${edgeHost} is alive`);
    return true;
  }
}
```

### apps/myapp/lib/_edge/edge.service.ts

```ts
const edgeOrigin = `https://${edgeHost}${getApiPrefix()}`;

await fetch.startJob(jobId, { origin: edgeOrigin });
await fetch.stopJob(jobId, { origin: edgeOrigin });
```

### Code

```ts
// edge server
throw new Err("job.error.applyTimeout", { jobId, timeout: 3000 });

// cloud server — the same Err is thrown by this call
await fetch.startJob(jobId, { origin: edgeOrigin });
```

### apps/myapp/lib/_edge/edge.service.ts

```ts
const unsubscribe = fetch.subscribeJobStatus(
  (status) => {
    this.logger.info(`job status: ${status}`);
  },
  { origin: edgeOrigin },
);

// When the job or the worker ends:
unsubscribe();
```

### apps/myapp/srvkit/RemoteEdge.ts

```ts
import { getApiPrefix } from "akanjs/base";

export class RemoteEdge {
  readonly #origin: string;
  readonly #unsubscribes: (() => void)[] = [];

  constructor(host: string) {
    this.#origin = `https://${host}${getApiPrefix()}`;
  }

  ping() {
    return fetch.ping({ origin: this.#origin });
  }

  start(jobId: string) {
    return fetch.startJob(jobId, { origin: this.#origin });
  }

  watchStatus(onStatus: (status: string) => void) {
    const stop = fetch.subscribeJobStatus(onStatus, { origin: this.#origin });
    this.#unsubscribes.push(stop);
  }

  close() {
    for (const unsubscribe of this.#unsubscribes.splice(0)) unsubscribe();
  }
}
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  database: { modes: ["single", "cluster"] },
};

export default config;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

