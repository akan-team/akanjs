---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A database service now has `create<Model>Many(rows)`. It creates the rows on the same path as `create<Model>`: `_preCreate` and `_postCreate`, the document's save and create hooks, and the live and pubsub events each row's commit fires. It does so in one transaction, joining the caller's when one is open, and writes the rows with one multi-row INSERT per 500 rows instead of one statement per row. Every row's `_preCreate` runs before the first row is written, so a check there that queries the table does not see the batch's own rows. A service that already declares a method of that name keeps its own at runtime, but its signature no longer typechecks against the generated one: rename it.

A store can list actions in `static silent = ["refreshToken"] satisfies (keyof UserStore)[]`. When a silent action fails, it shows no toast and logs at verbose instead of error. It still rejects with the original error, so a background write such as a token refresh is awaited by its caller, which handles the failure. A name in `static silent` that is not an action of the store is reported when the store registers.

`akan lint`'s `akan.service.call-in-loop` fix and the agent guidelines name `create<Model>Many` as the way to write a set once.
