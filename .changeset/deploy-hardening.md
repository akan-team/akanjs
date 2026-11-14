---
"@akanjs/devkit": minor
---

The Dockerfile `akan build` writes runs the server as oven/bun's `bun` user (uid 1000) on a base image pinned by digest, and the Helm chart in `infra/app` runs the pod as that user with no privilege escalation and holds the Ingress to the app's own body limit and CORS answer.

**Image**

- The base is `oven/bun:1.4.4-slim@sha256:…`, the multi-arch index's digest, so every build of a release, amd64 and arm64 alike, starts from the same Bun the workspace pins. A test fails when the image tag and the repo's Bun version disagree.
- `apt-get`, `preRuns`, `bun install` and `postRuns` still run as root, and the app files, `node_modules` included, stay root's and read-only to the server. uid 1000 owns only the directories the server writes: `/workspace/sqlite`, `/workspace/local`, `/workspace/runtime` (the control socket), `/workspace/data` and `/workspace/.akan/artifact/image-cache`. An empty named volume mounted at `/workspace/sqlite` or `/workspace/local` starts out owned by uid 1000.

**Chart** (`infra/app`, not an npm package; its defaults now live in `infra/app/values.yaml`)

- `podSecurityContext`: `runAsNonRoot: true`, uid and gid 1000, `fsGroup: 1000` with `fsGroupChangePolicy: OnRootMismatch`, and seccomp `RuntimeDefault`.
- `securityContext` (the container's): `allowPrivilegeEscalation: false` and every capability dropped. `readOnlyRootFilesystem` stays off, because the server writes `/workspace/runtime`, `/workspace/.akan`, `/workspace/data` and `/tmp` inside the image.
- A values file replaces single keys of either, and `null` on a key drops that key. A block that is left out or `null`, as in a release upgraded with `helm upgrade --reuse-values` from values that predate it, renders these defaults; so do the `ingress` keys below.
- `volumePermissions.enabled: true`: in single mode, an init container from the app's own image runs as root with only `CHOWN`, `FOWNER` and `DAC_READ_SEARCH` before the app starts, and hands every file on the `sqlite-data` claim that another uid or gid owns to `podSecurityContext`'s `runAsUser:runAsGroup`. Once ownership is right it changes nothing. Cluster mode has no such claim, and a `sharedClaim` is not touched.
- `ingress.proxyBodySize: 128m`: the Ingress passes a body up to the server's upload limit (`AKAN_MAX_UPLOAD_BODY`, 128 MiB) and answers a larger one 413 itself, as the server would.
- `ingress.cors.enabled: false`: the app's own CORS answer reaches the browser. Its native shells and the origins in `option.setCrossSite({ allowedOrigins })` get their origin back, a preflight gets every header it asked for (`idempotency-key` and the MCP headers included), and fonts and public assets keep `Access-Control-Allow-Origin: *`.

**Upgrading.**

- A Docker volume or bind mount that an image of 3.2.0 or earlier already wrote is owned by root, so the new image stops at boot with `attempt to write a readonly database`. Change its owner once, for example `docker run --rm -u 0 -v <volume>:/workspace/sqlite <image> chown -R 1000:1000 /workspace/sqlite`, and the same for a volume at `/workspace/local`. A new named volume mounted anywhere else, such as `/data`, starts out owned by root: mount it at `/workspace/sqlite` or `/workspace/local`, or `chown` it once the same way. To keep running as root, start the container with `--user 0:0` (compose: `user: "0:0"`), or declare `docker` as a whole Dockerfile string.
- A directory a `postRuns` step creates for the server to write needs `chown 1000:1000` in that step.
- On the chart, the `volumePermissions` init container hands the `sqlite-data` claim a root image wrote to uid 1000 at the first start, hostPath, NFS and CSI volumes the kubelet's `fsGroup` skips included. A cluster's `sharedClaim` needs the one-time `chown -R 1000:1000`. An image without `sh` and `find` needs `volumePermissions: { enabled: false }`. To run the pod as root as before, write `podSecurityContext: { runAsUser: 0, runAsGroup: 0, runAsNonRoot: false }`, `securityContext: { capabilities: null }` and `volumePermissions: { enabled: false }` in the app's values file.
- A request body over 128 MiB, which the server refused after the Ingress read it, now gets 413 from the Ingress. An app that raised `AKAN_MAX_UPLOAD_BODY` raises `ingress.proxyBodySize` with it; `ingress.proxyBodySize: "0"` passes any size again.
- The Ingress no longer answers a preflight itself or adds `Access-Control-Allow-Origin: *` to every response. A page on an origin the app does not list could read the app's GET responses through that header, and now cannot: add its origin to `option.setCrossSite({ allowedOrigins })`, or write `ingress: { cors: { enabled: true } }` in the app's values file for the old annotations.
