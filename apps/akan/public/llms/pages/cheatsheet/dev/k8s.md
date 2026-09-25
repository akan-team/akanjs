# Kubernetes

- Source: /cheatsheet/dev/k8s
- Mirror: /llms/pages/cheatsheet/dev/k8s.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Kubernetes (#overview)
- Architecture (#architecture)
- Open Console (#console)
- Values (#values)
- Scale (#scale)
- Tips (#tips)

## Content

Kubernetes

Akan Kubernetes deployment is built around one app container, a Service, an Ingress, and persistent storage for sqlite data.

Deployment runs the app image.

Service exposes the app inside the cluster.

Ingress connects domains to the Service.

PVC keeps sqlite data across pod restarts.

Architecture

Think of the chart as four connected pieces. Users enter through Ingress, the Service routes traffic to the Pod, and the Pod stores local data through a PVC.

Mental model

Open Console

Use `kubectl exec` to run the generated `console.js` already embedded in the built app image.

The console starts a separate no-listen server process in the same pod; it does not attach to the running `main.js` memory.

Pod exec

Values

Use values to tune each environment. Debug can stay small, while main usually gets more CPU, memory, storage, and replicas.

Scale

`app.replica` becomes `AKAN_REPLICA` inside the pod. Use it with CPU and memory values to scale work safely.

`1,0,0`: small service with one request child.

`2,1,0`: more request capacity plus one batch worker.

`0,0,1`: one all-purpose child for simple environments.

Tips

Start with conservative requests and watch metrics before raising limits.

Resize sqlite storage before it becomes urgent.

Keep domain and subRoute values explicit so Ingress rules stay predictable.

## Code Examples

### Code

```ts
Domain
  -> Ingress
  -> Service:8282
  -> Deployment Pod
  -> PVC /workspace/sqlite
```

### Code

```bash
kubectl exec -it -n prod pod/myapp-xxxxx -c myapp -- sh -lc 'AKAN_CONSOLE=1 bun console.js'
```

### values.yaml

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

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

