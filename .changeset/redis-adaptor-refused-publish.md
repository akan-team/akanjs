---
"akanjs": patch
---

On the Redis WebSocket adaptor:

- **A PUBLISH a Redis ACL refuses (`NOPERM`) is dropped, not retried.** It used to be retried on a timer, and every event queued behind it waited with it, so one refused channel delayed all cross-server events. A refusal is logged as an error that names the family of channels whose events are being dropped (`<prefix>ws:room`, `<prefix>ws:change` or `<prefix>ws:broadcast`), at most once a minute per family. Other error replies are still retried.
- **A shutdown no longer logs the publisher's and subscriber's disconnect warnings.** A link that drops while the server runs still warns, and a dropped publisher now warns once rather than on every failed reconnect attempt.
