---
"@akanjs/devkit": patch
---

A Redis or Postgres tunnel to a cluster environment needs a configured credential. Without `SSH_TUNNEL_PRIVATE_KEY_PATH` or `SSH_TUNNEL_PASSWORD`, the tunnel fails before it dials, with an error naming both settings, instead of signing in with a built-in default credential and a warning. This removes an unsafe default.

**Upgrading.** If `akan start` against a cluster environment opened its tunnel with neither setting, it now stops with that error in `multiple` and `cluster` mode, and in `single` mode logs it and runs without Redis. Export `SSH_TUNNEL_PRIVATE_KEY_PATH` (with `SSH_TUNNEL_PASSPHRASE` if the key has one) in the shell, or set `SSH_TUNNEL_PASSWORD` to the password the cluster's tunnel endpoint expects. `SSH_TUNNEL_USERNAME` still defaults to `root`.
