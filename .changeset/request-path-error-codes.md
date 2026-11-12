---
"akanjs": patch
"@akanjs/cli": patch
---

More server and adaptor failures throw a coded `AkanError` instead of a bare `Error`. Messages are unchanged, and so is every status a caller is answered with. The error-code reference lists the new codes.

- `BuilderRpc`, the dev builder channel:
  - `buildFailed` (500): the builder answered that the build failed.
  - `builderUnavailable` (503): no builder answered, either in time or at all. `BuilderRpc.isTimeout` and `isUnavailable` still tell the two cases apart.
  - `rpcDisposed`: `dispose()` cut off a pending request.
- `artifactMissing` (500): a production page's route is missing from the artifact. The page still answers with the 500 error page.
- `notInitialized` (500): SSR requires a client module whose chunk has not loaded. The page still answers with the 500 error page.
- `listFailed` (500): `McpRouter.listFor`, and so the test server's `servedMcpCatalogue`, rejects when a page of its in-process listing answers an error.
- `jobStalled` (500): `SolidQueue` hands this to `onFailed` for a job whose lease ran out on its last attempt.
- `databaseLocked` (500): the solid SQLite file stays busy or locked through every retry while `SolidQueue` or `SolidCache` starts. SQLite's own error is kept as `cause`.
- Some failures are caught where they are thrown. They are coded too, and each still ends as before:
  - `badGateway` (502): the image optimizer's DNS lookup timed out. The image optimizer still answers its own 502.
  - `invalidKey`: the stored MCP Apps signing key is gone.
  - `unencodableValue`: the protobuf compressor's schema refuses a value. It is still logged and encoded as `null`.
  - `invalidStorageKey` (400): a `BlobStorage.deleteData` URL is outside the storage's prefix. It is still logged and answered `false`.

**Upgrading.** The solid SQLite open used to reject with SQLite's error itself. Code that matched that error's `code` (`SQLITE_BUSY` or `SQLITE_LOCKED`) now finds it on `error.cause`. You can also branch on `AkanError.is(error, "databaseLocked")`.
