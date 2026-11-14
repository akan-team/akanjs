---
"@akanjs/cli": minor
---

`akan test` takes `--parallel=<n>` to spread the test files over n bun processes, balanced by the per-file durations it keeps under `local/test-timings/<target>`, and `--junit <path>` to also write a JUnit XML report.
