---
"@akanjs/devkit": patch
---

A Redis or Postgres tunnel to a cluster environment needs a configured credential: `SSH_TUNNEL_PRIVATE_KEY_PATH` (with `SSH_TUNNEL_PASSPHRASE` if the key has one), exported in the shell, or `SSH_TUNNEL_PASSWORD`. Without either, the tunnel fails before it dials, with an error naming both settings, instead of signing in with a built-in default credential and a warning. This removes an unsafe default. A key file the tunnel cannot read fails with an error naming the tunnel, `SSH_TUNNEL_PRIVATE_KEY_PATH` and the path.

**Upgrading.** If `akan start` against a cluster environment opened its tunnel with neither setting, it now stops with that error in every database mode but `single`, where it logs the error and runs without Redis. Export `SSH_TUNNEL_PRIVATE_KEY_PATH` in the shell (a repository's dotenv file cannot set it), or set `SSH_TUNNEL_PASSWORD` to the password the cluster's tunnel endpoint expects. `SSH_TUNNEL_USERNAME` still defaults to `root`.
