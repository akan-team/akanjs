---
"akanjs": minor
---

A conformance suite built on `ConformanceEnv` from `akanjs/test` now fails instead of skipping when `AKAN_TEST_REQUIRE_BACKENDS=1` and the backend it asks for has no URL: `ConformanceEnv.has(suite, backend)` registers a failing test named `<suite>: <backend> backend is required`, which says which variable is missing. A CI job that sets the switch can no longer pass without running its Postgres or Redis cases. `ConformanceEnv.requireBackends` reads the switch.

**Upgrading.** Nothing to change. Without the variable a missing backend is announced and skipped, as before.
