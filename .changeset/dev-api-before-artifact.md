---
"akanjs": minor
---

Under `akan start`, the backend answers API requests while the first base build is still running. Before, every request waited for the build.

- The replica listens as soon as its API is ready. API endpoints and the API socket answer at once.
- Any other request waits for the build's artifact and is then served from the full route table. This covers pages, assets, HMR, `/mcp`, OpenAPI and devtools. On apps/minimal a warm start answers its first API call about 1.1 s sooner, and on apps/akan about 2.3 s sooner.
- A request still waiting when the server stops, for example when the first build fails, gets a 503: a self-reloading status page for a browser, JSON or text for anything else. A request still waiting when the web surface fails to mount gets the same 503. The request no longer hangs.
- The replica's first `ready` message sets `webPending: true`. The gateway then routes traffic to the replica, but it waits for the second `ready` message before it tells the dev host the backend is ready, admits the artifact's hosts and clears `AKAN_DEV_AWAIT_ARTIFACT`. A replica that fails while it waits for the artifact still counts towards the crash-loop limit.
- A production start, and any start that does not wait for an artifact, is unchanged.

`AkanIpcMessage`'s `ready` variant has a new optional `webPending` field. It is an addition, so no upgrade step is needed.
