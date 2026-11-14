---
"akanjs": minor
---

Every endpoint and page counts its requests and times them, always, with tracing left off.

- `akan_endpoint_requests_total{endpoint, status_class}` and `akan_endpoint_request_duration_seconds{endpoint}` count and time each endpoint call over HTTP, websocket and MCP, labelled `<type>:<key>` as a trace names it. `akan_page_requests_total{route, status_class}` and `akan_page_request_duration_seconds{route}` do the same for page documents and RSC payloads by route id, and a path no route matches counts as `unmatched`. Every series also carries the process `role`. No label carries a URL, a user, an account or a query.
- A latency histogram has 12 fixed buckets from 1 ms to 10 s. A label takes at most 2,000 values, and the rest count as `other`. A series appears once it is first observed, at about 2 KB of memory for each endpoint called.
- `/_akan/app/metrics` answers these series as `metricFamilies`. Behind a gateway, each replica reports its own with its start time, and the gateway adds them up: counters and buckets add, and percentiles are never averaged. A replica that restarts counts from zero again, and the gateway keeps its earlier counts in the sum, so the sum never drops.

**Upgrading.** Nothing to change. The metrics JSON gains a top-level `metricFamilies`, and each replica's `metrics` gains `startedAt` and `metricFamilies`; a reader that checks the body's exact keys must allow them. Behind a gateway the sums are as fresh as each replica's last report, sent every `AKAN_MEMORY_LOG_INTERVAL_MS` (60 s by default). Set it to your scrape interval for fresher numbers.
