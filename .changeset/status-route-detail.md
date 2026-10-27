---
"akanjs": patch
---

`/_akan/app/health` and `/_akan/app/metrics` no longer show process detail to anonymous callers. Outside `local`, a request without a status bearer gets only `{ "status": "running" }` from health, still with 200, and a 401 from metrics. With the bearer, both answer in full as before. Both answers are now marked `cache-control: no-store`. The gateway and a solo process behave alike. `/_akan/app/info` and `/_akan/bench/ping` stay public.

The bearer is the new `AKAN_STATUS_TOKEN`, which unlocks the health detail and metrics and nothing else. `AKAN_LOG_STREAM_TOKEN` works too, so a setup that already has one needs nothing new. A token with whitespace in it unlocks nothing, and the server warns once.

Detail stays open to everyone wherever `AKAN_PUBLIC_ENV` is `local`, for the dev tooling. `akan build` bakes in the workspace's own value, which is `local` in a new workspace, so never expose an image built that way.

Probes that read only the status code (the chart's liveness, readiness and startup probes, the desktop shell, `akan` commands) need no change. **A metrics scraper or monitor that reads either body must now send `Authorization: Bearer $AKAN_STATUS_TOKEN`.** Set `AKAN_STATUS_TOKEN` in the app's environment and give that token, rather than the log stream token, to the scraper. Without either token, the detail is never served outside `local`.
