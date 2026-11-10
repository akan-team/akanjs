---
"akanjs": minor
---

Every `Err` is now one class, `Err` from `akanjs/common`. That covers the one an app's or lib's `lib/dict` builds, the one `useClient` returns, `akanjs/dictionary`'s own, and an error restored off the wire. Each is that class typed with its own dictionary's keys, so `Err.is` and the status classes behave the same in the browser and on the server. `instanceof Err` holds within one copy of the module. A page bundle and the framework each carry one, so check across them with `Err.is`.

- **`Err` is an `AkanError`.** `AkanError.is(err)` is true for every `Err`, and `err.forwarded` is true unless it was restored with a `code`, so the request path still sends its `toJSON()` as it is.
- **A restored failure that carries a `code` is not `forwarded`.** Such a failure is one its origin server generalized, such as `{ "error": "Forbidden", "code": "fileGrantRefused", "statusCode": 403 }`. The request path generalizes it again, to the same body, and a guard or an auth challenge does not read it as a refusal of its own.
- **`err.code` is always set.** It is the code a generalized failure's payload carried, or else the code of its status (`notFound`, `conflict`, `badRequest`), so `AkanError.is(err, "notFound")` matches an `Err.NotFound`. `toJSON()` still sends `code` only when the payload carried one, so the wire does not change. On the client, `{ ...err }` now includes `code`.
- **A status class tells its own status apart.** `Err.NotFound.is(error)` also requires a `statusCode` of 404, so `Err.NotFound.is(new Err.Conflict(key))` is false; `Err.is` still takes any status. `Err.NotFound.fromJSON(payload)` builds an `Err.NotFound`.
- **Status classes on a dictionary's `Err` are typed as the full constructor:** `Err.BadRequest`, `Err.Unauthorized`, `Err.Forbidden`, `Err.NotFound` and `Err.Conflict`. So `Err.NotFound.is(...)` and `Err.NotFound.fromJSON(...)` type-check on the server too.
- **A restore with no error constructor gives an `Err`.** That applies to an HTTP, WebSocket or MCP App bridge restore. It used to give a plain `Error` with the payload's fields copied onto it, so a field the wire does not declare is no longer on the error.
- **On the client, `String(err)` appends the error's `data`**, as it already did on the server, with secret-named keys masked.
- **The type exports moved.** `ErrConstructor`, `ErrPayload` and `ErrRestoreOption` come from `akanjs/common`, `akanjs/dictionary` re-exports all three, and `akanjs/client` re-exports `ErrPayload`. `ErrInstance`, `PageErrInstance` and `PageErrConstructor` keep their shapes and are deprecated.
- **The API explorer shows a failed call's wire body**, the error's `toJSON()`, instead of the error object's own fields.

Upgrade:
- Replace the types `ErrInstance` and `PageErrInstance` with `Err` from `akanjs/common`, and `PageErrConstructor` with `ErrConstructor`.
- Code that read `err.code === undefined` to tell whether a restored failure carried a code should read `"code" in err.toJSON()` instead.
- Code that relied on `Err.NotFound.is(...)` accepting an error of another status should call `Err.is(...)`.
- A test that replaces `akanjs/base` with `mock.module("akanjs/base", …)` while the real `akanjs/common` loads must include `AkanError` in the mock.
- Nothing else changes for code that throws and checks `Err` through `lib/dict` or `useClient`.
