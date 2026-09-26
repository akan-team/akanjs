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

Cloud server

Decides what should happen and sends commands to the edge.

Edge server

Does the work close to the device or user, and reports status back.

Connects both sides with typed signal calls; only `{ origin }` differs from a local call.

The server that receives the call: scheme, host and API prefix.

Milliseconds before the caller gives up; overrides the endpoint's `timeout`, and `false` waits.

Sent as `Authorization: Bearer <token>`, so the remote guards judge that account.

Runs after the room is subscribed again following a dropped connection.

The remote endpoint threw an `Err`

The same `Err`, with its key, `data` and status code

The connection was refused or the host did not resolve

No answer before the timeout

A proxy in front answered 502, 503 or 504 with its own page

A separate transport

Setting

Edge site

Cloud cluster

`cloud`, the image default

Data

SQLite files on a mounted volume that `AKAN_SQLITE_DIR` names

`POSTGRES_URL` and `REDIS_URI`

Instances

One container

Several servers

Minimal Compose

The compose file for one edge container and its volumes.

Broadcast With pubsub

Declare a room, guard it, and subscribe to it.

Error Handling

Declare error keys and pick a status code for each.

Declare Endpoint

Endpoint options, including `timeout` for slow work.

Part

Call Another Server

A health check that pings one edge server:

Options for a remote call

Send Commands

Errors Come Back

One error crossing two servers:

One error, two servers

What the caller catches

When

Thrown on the caller

Listen To Status

Wrap A Remote Node

When you talk to the same edge server many times, wrap it in a small class that remembers its origin and its unsubscribe functions:

Very Fast Data

Use

Run The Edge Site

An edge site is usually one container that keeps its data in SQLite files. The cloud can run the same app as a cluster, from the same image.

Each deployment of the image then says where it runs and where its data lives:

Tips

Related pages

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

