---
"@akanjs/cli": patch
---

`akan logs --trace <id>` also finds a request by the id its caller sent, typed as it was sent.

The `runtimeRule` guideline and the `akan-runtime` skill describe the request id: where it comes from, where it is written, how it travels, and what `x-akan-debug` and `AKAN_TRACE=1` add to a call's spans.
