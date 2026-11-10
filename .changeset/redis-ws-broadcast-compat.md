---
"akanjs": patch
---

A rolling deploy of an app on the Redis WebSocket adaptor loses no event while servers of this release and of an earlier one run side by side.

- **Servers of this release also publish every room event and live change on `<prefix>ws:broadcast`**, in the format earlier releases read, and listen there for theirs. They skip a copy another server of this release put there, since they heard it on its own channel. Servers of 3.2.0-rc.6, which use only the new channels, hear and are heard on those.
- **This lasts one release** (#458). Until then Redis still sends every event to every server on `<prefix>ws:broadcast`, plus once more to the servers holding its room, so the traffic saving of the per-room channels arrives with the next release. Deploy this release before that one rather than skipping it.
- **A Redis ACL** that names `<prefix>ws:broadcast` must allow `<prefix>ws:*` before this release goes out, since its servers publish on both.
