---
"akanjs": minor
---

A client of the `/_akan/app/logs` SSE stream that stops reading no longer grows the server without limit. At most 4 MiB waits for it; past that, records are dropped and counted, and when the client reads again it gets one `{ "type": "dropped", "count": n }` event before the next record. A client that misses more than 10,000 records in one stall is disconnected and has to reconnect, resuming from its `Last-Event-ID` as usual.

`EventStream` from `akanjs/common` takes the same bound as two new options, `maxQueuedBytes` and `maxDropped`. Without them a stream queues every event as before, which the MCP and agent-turn streams keep, since a dropped frame there would lose a reply.

No upgrade step is needed.
