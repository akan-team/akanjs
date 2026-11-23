---
"akanjs": minor
---

`SecretEnv` in `akanjs/server` follows the boot refusal. `SecretEnv.read(name)` and `SecretEnv.json(name)` no longer take a built-in fallback value. `SecretEnv.fallbackKey` and `SecretEnvReport` are gone. `SecretEnv.check()` now throws `secretEnvMissing` instead of returning a report. A list entry can name the developer's own variables that the env file reads first (`SecretEnvEntry.ahead`).

A build calls these for you. If your own code calls them, drop the second argument and catch the error where you used to read the report.
