---
"@akanjs/cli": patch
---

`akan create-service` now writes a `serviceDictionary`, as the service guideline describes. It wrote a `modelDictionary`, which the generated `dict.ts` registers as a service and so drops its error keys: `new Err("<service>.error.<key>")` failed to typecheck even after the key was added to `.error({})`. A service created before this release can switch its dictionary to `serviceDictionary(["en", "ko"])` and delete the `.of(...)` line.
