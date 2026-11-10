---
"akanjs": patch
"@akanjs/devkit": patch
---

Akan Studio lands on the Runtime view when `akan start`'s builder is stopped, not only when there is none or it never answers.

- **The dev host marks a reply no builder answered.** A builder request the dev host answers itself carries `kind: "unavailable"`: the builder is stopped, not started yet, failed to start, or exited or was stopped before answering. A failure the builder reports, such as a broken build, carries no kind and reads as before.
- **`BuilderRpc.isUnavailable(error)`** tells such a failure apart, as `BuilderRpc.isTimeout` does for a request that times out. A bare, empty or unknown `/_akan/studio` view then lands on Runtime, and a view asked for by name still answers 503 with the reason.
- **Mixed versions keep working.** A server reading a reply from an older dev host, with no kind, answers 503 as before, and an older server ignores the new field.
