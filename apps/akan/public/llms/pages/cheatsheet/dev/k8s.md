# Kubernetes

- Source: /cheatsheet/dev/k8s
- Mirror: /llms/pages/cheatsheet/dev/k8s.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Kubernetes (#overview)
- Architecture (#architecture)
- Values (#values)
- Scale (#scale)
- Open Console (#console)
- Tips (#tips)

## Content

Kubernetes

Every Akan app deploys with the same Helm chart, `infra/app`. It creates four resources in the namespace `<appName>-<branch>`:

Resource

Name

What it does

- app-deployment: Runs the app image in exactly one pod. — Deployment

- app-svc: Exposes the app on port 8282 inside the cluster. — Service

- app-ingress: Connects your domains to the Service and gets their TLS certificate. — Ingress

- sqlite-data: Keeps the sqlite data in `/workspace/sqlite` across pod restarts. — PersistentVolumeClaim

The namespace picks the branch

You never write the branch as a value. The chart reads it from the release namespace:

You deploy into `<appName>-<branch>`, for example `myapp-main`.

The chart splits the name on `-` and takes the second part, `main`, as the branch.

It reads the `main:` block of the values and passes `AKAN_PUBLIC_ENV=main` to the pod.

**A wrong namespace silently picks the wrong values block.** Deploy to `myapp-develop` and the pod runs with the `develop` settings. For the same reason, `appName` must not contain a `-`.

Architecture

A request enters through the Ingress, and the Service passes it to the pod, which keeps its data on the PVC. Alongside, the kubelet checks the pod's health.

Request path

Domain

TLS, one host per subRoute and domain

**Always one pod.** `replicas: 1` is fixed in the template. To scale, raise `AKAN_REPLICA` inside the pod instead of adding pods.

**Why only one.** The sqlite PVC is `ReadWriteOnce`, so it attaches to one node at a time and pods cannot spread across nodes.

**One certificate for every host.** The default host, each subRoute host and each production domain share the TLS secret `cert-<appName>-<branch>`.

Values

There is no single `values.yaml`: Helm reads four files in order, and a later file overrides an earlier one. An app's own file usually holds just its name and production domains.

File

What it holds

- 1 — _common-values.yaml — Defaults for the `debug`, `develop` and `main` branches: replica, resources, storage.

- 2 — _common-secret.yaml — Values every app shares: `repoName`, `serveDomain`, `image.registry`.

- 3 — <appName>-values.yaml — The app's own values: `appName`, `subRoutes`, domains, and any override.

- 4 — <appName>-secret.yaml — The app's own secret values, and it may be empty.

Both `*-secret.yaml` files stay out of git. `bun run downloadSecret` fetches every file listed in `infra/master/jenkins/getSecrets.sh`, so add a new app's file there.

Deploy command

The Jenkins deploy stage runs these two commands from `infra/` for each app:

**The `-f` order is the priority.** A later file overrides every key it repeats.

**`-n` picks the branch.** `myapp-main` selects the `main:` block.

**`rollout restart` brings in the new build.** The restarted pod pulls the image again, so it runs the build just pushed.

An app's values file

A production app that needs more capacity than the defaults writes something like this:

**Top-level keys apply to every branch.** `appName` and `subRoutes` sit at the root.

**A `main:` block only touches `main`.** Keys you leave out keep the `_common-values.yaml` default, while a list such as `domains` is replaced whole.

Top-level keys

A key tagged `_common-secret.yaml` is set there once for every app.

- appName (string): Names the namespace `<appName>-<branch>`, the image path and the default host.

- repoName (string, _common-secret.yaml): The workspace part of the image path `<registry>/<repoName>/<appName>`.

- serveDomain (string, _common-secret.yaml): The base domain, so the default host is `<appName>-<branch>.<serveDomain>`.

- subRoutes (string[], default []): Adds one `<subRoute>-<branch>.<serveDomain>` host and TLS name per basePath.

- image.registry (string, _common-secret.yaml): The registry host.

- image.tag (string, default <branch>-live): Write it only to pin one specific build.

Per-branch keys

Written under a branch block such as `main:`. The defaults come from `_common-values.yaml`.

- <branch>.domains (string[], default []): Extra hosts and TLS names for that branch, such as a production domain.

- <branch>.app.replica (string, default "0,0,1"): Becomes `AKAN_REPLICA` in the pod: process counts for federation, batch and all.

- <branch>.app.solo (string, default unset): Becomes `AKAN_SOLO`; write `false` to keep a gateway in front of a single replica.

- <branch>.app.resources.requests ({ memory, cpu }, default 250M / 0.05 (main: 1G / 1)): The memory and CPU the pod requests.

- <branch>.app.resources.limits ({ memory, cpu }, default 1G / 0.5 (main: 4G / 4)): The pod's limit; the CPU limit also sets how many images the optimizer encodes at once.

- <branch>.app.resources.storage (string, default 2Gi (main: 5Gi)): The size of the `ReadWriteOnce` PVC mounted at `/workspace/sqlite`.

**Some settings are not values.** Port 8282, `replicas: 1`, the 40-second termination grace period and the three probes are fixed in `templates/app.yaml`. Changing them means editing the chart.

Scale

`<branch>.app.replica` becomes `AKAN_REPLICA` in the pod: three process counts, one per role. Raise it together with the CPU and memory limits.

Role

- federation: Serves requests and skips services and internals pinned to `serverMode: "batch"`.

- batch: Never listens, and runs scheduled and queued internals, including those pinned to `batch`.

- all: Serves requests and runs every internal.

Common values

Requests

batch internals — serverMode: "batch"

Gateway

- One process, no gateway

  - 0,0,1: The chart default: one all-purpose process.

  - 1,0,0: One request process, so nothing pinned to batch runs.

- Several processes behind a gateway

  - 2,1,0: Two request processes and one batch worker.

Yes

No

Health probes

With a single process there is no gateway to restart it, so the kubelet does. The chart points three probes at `/_akan/app/health`, which a solo process answers itself.

Period

Timeout

Failures

- startupProbe — 5s — 1s — 24 — Waits up to 2 minutes for boot, since SSR loads its route artifacts before it listens.

- livenessProbe — 15s — 3s — 3 — Restarts a stuck server after three misses in a row.

- readinessProbe — 10s — 3s — 2 — Takes the pod out of the Service after two misses in a row.

**A 40-second grace period.** On shutdown the server drains for up to 30 seconds (`AKAN_SHUTDOWN_TIMEOUT_MS`). The extra 10 seconds keep SIGKILL from landing the moment that drain ends.

**A gateway restarts its own children.** With several processes, such as `2,1,0`, the gateway restarts a crashed one, and the probes still watch the pod.

Open Console

The built image already contains `console.js`. Open it inside the running pod with `kubectl exec`:

**Namespace and container.** `-n` is `<appName>-<branch>`, and the container is always named `app`.

**`AKAN_CONSOLE=1` goes on this command only.** The image runs in production mode on every branch, so the console refuses to open without it.

**It is a separate process.** The console starts its own server process in the pod that does not listen and runs no internal jobs or queue workers. It does not attach to the memory of the running `main.js`.

**The running server's logs still reach it.** `.tail` and `.trace` read them through the control socket in the runtime directory.

Tips

**Start with small requests.** Watch the metrics first, then raise the limits.

**Grow storage early.** Resize the sqlite PVC before it becomes urgent.

**Write every host out.** Explicit `subRoutes` and `domains` keep the Ingress rules predictable; keep them in step with `routes` in `akan.config.ts`. The chart only opens a host, and the app decides which basePath answers it.

**After a manual `helm upgrade`, restart the rollout.** The default tag `<branch>-live` keeps its name for every build, so the Deployment does not change and the pod keeps the old build until `kubectl rollout restart`.

Related pages

- AKAN_REPLICA In Depth — Every slot and value, and when a gateway appears.

- Container Console — What the console offers, its lifecycle, and its safety rules.

- Health And Metrics — Read the numbers before you raise requests and limits.

## Code Examples

### Terminal

```bash
helm upgrade app ./app/ -i --create-namespace -n myapp-main \
  -f app/values/_common-values.yaml \
  -f app/values/_common-secret.yaml \
  -f app/values/myapp-values.yaml \
  -f app/values/myapp-secret.yaml
kubectl rollout restart deployments/app-deployment -n myapp-main
```

### infra/app/values/myapp-values.yaml

```yaml
appName: myapp
subRoutes: [admin]

main:
  domains:
    - myapp.example.com
  app:
    replica: "2,1,0"
    resources:
      requests:
        memory: 1G
        cpu: "1"
      limits:
        memory: 4G
        cpu: "4"
      storage: 5Gi
```

### Terminal

```bash
kubectl exec -it -n myapp-main deploy/app-deployment -c app -- \
  sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

