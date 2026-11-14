---
"@akanjs/devkit": minor
---

The Dockerfile `akan build` writes runs the server as oven/bun's `bun` user (uid 1000) on a base image pinned by digest, and the Helm chart in `infra/app` runs the pod as that user with no privilege escalation.

**Image**

- The base is `oven/bun:1.4.4-slim@sha256:…`, the multi-arch index's digest, so every build of a release, amd64 and arm64 alike, starts from the same Bun the workspace pins. A test fails when the image tag and the repo's Bun version disagree.
- `apt-get`, `preRuns`, `bun install` and `postRuns` still run as root. The app files are copied `--chown=1000:1000`, and `/workspace` with the volume mount points `/workspace/sqlite` and `/workspace/local` belong to uid 1000, so SQLite, uploads, the runtime sockets and the image cache are writable while `node_modules` stays read-only. An empty named volume mounted at either point starts out owned by uid 1000.

**Chart** (`infra/app`, not an npm package; its defaults now live in `infra/app/values.yaml`)

- `podSecurityContext`: `runAsNonRoot: true`, uid and gid 1000, `fsGroup: 1000` with `fsGroupChangePolicy: OnRootMismatch`, and seccomp `RuntimeDefault`.
- `securityContext` (the container's): `allowPrivilegeEscalation: false` and every capability dropped. `readOnlyRootFilesystem` stays off, because the server writes `/workspace/runtime`, `/workspace/.akan`, `/workspace/data` and `/tmp` inside the image.
- A values file replaces any key of either, and `null` drops the whole block.

**Upgrading.**

- A Docker volume or bind mount that an image of 3.2.0 or earlier already wrote is owned by root, so the new image stops at boot with `attempt to write a readonly database`. Change its owner once, for example `docker run --rm -u 0 -v <volume>:/workspace/sqlite <image> chown -R 1000:1000 /workspace/sqlite`, and the same for a volume at `/workspace/local`. A new named volume mounted anywhere else, such as `/data`, starts out owned by root: mount it at `/workspace/sqlite` or `/workspace/local`, or `chown` it once the same way. To keep running as root, start the container with `--user 0:0` (compose: `user: "0:0"`), or declare `docker` as a whole Dockerfile string.
- A directory a `postRuns` step creates for the server to write needs `chown 1000:1000` in that step.
- On the chart, the kubelet hands the `sqlite-data` claim a root image wrote to group 1000 at the first start, so it stays writable. A volume whose ownership the kubelet leaves alone, such as a hostPath or NFS volume or a CSI driver without fsGroup support, needs the one-time `chown`. To run the pod as root as before, write `podSecurityContext: { runAsUser: 0, runAsGroup: 0, runAsNonRoot: false }` and `securityContext: null` in the app's values file.
