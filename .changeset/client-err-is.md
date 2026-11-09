---
"akanjs": patch
---

The `Err` an app imports in client code now has `Err.is(error, ...keys)`, as the `Err` from the app's dictionary (the one services throw) already did. It was missing on the client one, so client code that checked a caught error with it failed to typecheck, or threw a `TypeError` when typed loosely. `Err.is` is true for an `Err`, or for any error carrying a string `error` key, so one restored from a failed `fetch` call passes too; naming keys accepts only those and narrows the error's type to them. Both `Err` classes now run the same check.
