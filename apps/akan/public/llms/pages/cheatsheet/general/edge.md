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
- Listen To Status (#subscribe)
- Wrap A Remote Node (#remote-object)
- Very Fast Data (#fast-data)
- Tips (#tips)

## Content

Edge Computing

Edge computing in Akan means this: one Akan server can call another Akan server with the same generated `fetch` object you already use in the app.

Cloud server: decides what should happen.

Edge server: does work close to the device or user.

Akan fetch: connects both sides with typed signal calls.

Call Another Server

The important part is the last option: `{ origin }`. It tells fetch which server should receive the signal call.

Include the server global API prefix (for example `/api`) in the origin, because fetch sends the call to it as-is.

Ping an edge server

Send Commands

Use normal query or mutation calls when the cloud wants the edge server to do something. The call still has typed arguments and typed return values.

Remote command

Listen To Status

Use subscriptions when the edge server keeps sending status. Save the unsubscribe function so you can clean up later.

Subscribe and cleanup

Wrap A Remote Node

When you talk to the same edge server many times, make a small class that remembers the origin and unsubscribe functions.

Small wrapper

Very Fast Data

Keep Akan fetch for commands and status. If you need huge video or binary streams, you can add another transport just for that data.

Commands: `fetch.startJob(...)`

Status: `fetch.subscribeJobStatus(...)`

Large streams: use a dedicated path only when needed.

Tips

Start with a normal signal. If it works locally, it can usually be called remotely by changing `{ origin }`.

Keep edge server origins in the database so cloud logic can loop over them.

Always clean up subscriptions. Long-running workers can leak connections otherwise.

## Code Examples

### Code

```ts
const origin = "https://edge.example.com/api";

const result = await fetch.ping({ origin });

if (result === "ping") {
  console.info("edge server is alive");
}
```

### Code

```ts
const edgeOrigin = "https://edge.example.com/api";

await fetch.startJob(jobId, { origin: edgeOrigin });
await fetch.stopJob(jobId, { origin: edgeOrigin });
```

### Code

```ts
const unsubscribe = fetch.subscribeJobStatus(
  (status) => {
    console.info(status);
  },
  { origin: "https://edge.example.com/api" },
);

// When the page or worker closes:
unsubscribe();
```

### Code

```ts
class RemoteEdge {
  constructor(private origin: string) {}

  ping() {
    return fetch.ping({ origin: this.origin });
  }

  start(jobId: string) {
    return fetch.startJob(jobId, { origin: this.origin });
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

