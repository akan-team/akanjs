---
"akanjs": patch
---

The signal-test harness clears the env cache once it has set the test port, so a fetch client built after setup reaches the test server even when a module read `getEnv()` before the harness ran.
