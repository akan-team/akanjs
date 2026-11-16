---
"@akanjs/cli": patch
---

The local-dev databases `akan dbup` starts listen on loopback only: the `local/docker-compose.yaml` it writes publishes Redis as `127.0.0.1:6379:6379` and Postgres as `127.0.0.1:5432:5432`, so other machines on the network no longer reach them. Apps on the same machine connect through `localhost` as before.

**Upgrading.** `akan dbup` writes `local/docker-compose.yaml` only when it is missing and never rewrites it, so an existing workspace keeps the old mapping. Change the two `ports` entries to `127.0.0.1:6379:6379` and `127.0.0.1:5432:5432` (or move the file aside so the next `akan dbup` writes the current one), then run `akan dbdown` and `akan dbup` to recreate the containers. Postgres keeps its data in `local/postgres`; Redis has no volume and starts empty.
