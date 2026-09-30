# minimal Service Abstract
The load-test surface of the minimal app: four benchmark endpoints that `benchmarks/api-benchmark` calls anonymously,
and the tool the desktop end-to-end test has the carried server start.

## Rules
- Every bench endpoint is `Public` and `mcp: false`: the harness calls without an account, and an agent has no use
  for them.
- Their paths and payloads are mirrored by the competitor servers in `benchmarks/api-benchmark/competitors/`; change
  one and change those, or the comparison measures different work.
- `benchPublish` answers through `benchFanout`, so one publish measures the pubsub round trip, not the handler alone.
- `holdProbeTool` starts the app's `probe-tool` from PATH and answers its pid, so the desktop test can check that a
  tool the server started ends with the app's shell. It is `LocalOrEdge` and `mcp: false` like the memo fixture.
