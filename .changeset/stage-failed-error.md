---
"akanjs": patch
---

`akanjs/server` exports `StageFailedError`, the error a failed DI startup stage throws, so `StageFailedError.is(error)` narrows to a type whose `errors` holds each failed task's error without a cast.
