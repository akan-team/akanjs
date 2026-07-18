# Metrics

- Source: /cheatsheet/observability/metrics
- Mirror: /llms/pages/cheatsheet/observability/metrics.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Health And Metrics (#overview)
- Check Health (#health)
- Check Metrics (#metrics)
- How To Read (#read)
- Memory Logs (#memory-log)
- Troubleshooting Order (#checklist)

## Content

Metrics

Health And Metrics

When an Akan app feels slow or does not respond, start with two runtime endpoints. Health tells you whether the app is alive, and metrics tells you how busy it is.

`/_akan/app/health` checks gateway and child process status.

`/_akan/app/metrics` checks requests, sockets, rooms, and memory.

Use logs after metrics when you need the reason behind the numbers.

Check Health

Use health first when the app does not open. It shows whether the gateway is running and whether child servers are ready.

Health endpoint

Simplified response

Check Metrics

Use metrics when the app is alive but feels busy. It gives a quick picture of traffic, WebSocket load, rooms, and process memory.

Metrics endpoint

How To Read

`activeRequests` means requests currently being handled. If it stays high, a slow endpoint may be blocking work.

`activeWebSockets` and `rooms` help you understand realtime connection load.

`rssBytes` and `heapUsedBytes` show memory size. Watch the trend, not only one snapshot.

`rscPendingRenderCount` can hint that server rendering work is queued or waiting.

Memory Logs

When a memory issue is hard to catch from one metrics response, turn on periodic memory logs and watch how the values change over time.

Useful env

`AKAN_MEMORY_LOG=1` prints memory summaries periodically.

`AKAN_MEMORY_LOG_INTERVAL_MS` changes the report interval.

`AKAN_MEMORY_GC_ON_REPORT=1` runs GC before reporting, useful for diagnosis.

Troubleshooting Order

Open health. If a child is not ready or unhealthy, fix startup first.

Open metrics. Check active requests, sockets, rooms, and memory.

If memory keeps growing, enable memory logs and compare several samples.

Use app logs to find which endpoint, queue, or render path caused the numbers.

## Code Examples

### Code

```bash
curl http://localhost:8282/_akan/app/health
```

### Code

```ts
{
  "status": "running",
  "children": [
    {
      "role": "federation",
      "status": "healthy",
      "ready": true,
      "pid": 12345
    }
  ]
}
```

### Code

```bash
curl http://localhost:8282/_akan/app/metrics
```

### Code

```ts
{
  "rooms": 12,
  "sockets": 34,
  "gateway": {
    "rssBytes": 180000000,
    "heapUsedBytes": 72000000
  },
  "children": [
    {
      "role": "federation",
      "metrics": {
        "activeRequests": 2,
        "activeWebSockets": 10,
        "rscPendingRenderCount": 1
      }
    }
  ]
}
```

### Code

```bash
AKAN_MEMORY_LOG=1
AKAN_MEMORY_LOG_INTERVAL_MS=10000
AKAN_MEMORY_GC_ON_REPORT=1
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

