---
"akanjs": patch
---

The server's own failures now carry an `AkanError` code, and those a caller causes answer with the status that fits instead of a 500. Messages are unchanged. Outside development, the caller still sees only the status reason and the code, never the message.

- A WebSocket frame that is not a string, is not JSON, is not an object (`null` included), or names no `key` answers `400 invalidMessage`. A `key` with no route answers `404 routeNotFound` and logs a warning. Only a failure of 500 or above is logged as an error.
- A request body over the server's limit was already answered 413. Its failure is now `payloadTooLarge` with status 413, so it is no longer logged as a 500.
- Subscribing to a live room while one of its `pauseOn` arguments carries a value answers `409 livePaused`.
- `NativeFile.resolve`/`resolveIn` reject with these codes:
  - `403 fileGrantRefused`: the grant is unknown or for another use, points outside the folder, follows a link to nothing, names a path that cannot be followed, carries a bad signature, or is a dev grant used off `local`. Each refusal logs a warning that names the path and the use, never the grant.
  - `400 invalidFileGrant`: the grant is malformed.
  - `503 fileGrantUnavailable`: the desktop app did not answer in time.
- `NativeSecret` rejects with these codes:
  - `503 secretStoreUnavailable`: the desktop app did not answer in time.
  - `secretRefused`: the app refused.
- `500 desktopAppRequired`: `NativeFile` or `NativeSecret` is used by a server no desktop app carries.
- A 401 or 403 counts as a guard's refusal unless it is known to be one the server kept: `isGuardRefusal(error)`, new in `akanjs/common`, is false only for an `AkanError` the server does not forward, or a restored copy whose JSON names a `code`, which only a generalized answer carries. Any other 401/403, a plain `Object.assign(new Error(), { statusCode: 403 })` included, still counts, so a page hides it as not-found as before. MCP, page guards and `.prompt()` pages all use it:
  - MCP asks for a credential only on a guard refusal whose 401/403 it can read as a status, as before. A vendor SDK error that only carries `statusCode: 403` is still answered as the crash HTTP answers it. MCP answers a coded 403 it keeps as `Forbidden: <code>`, as HTTP does, names it by that code in `_meta["akanjs/failure"]`, and hands an MCP App view that failure's status and code, as a browser would receive them. A view rebuilds a guard refusal from its status alone, without copying the `forbidden` code from `_meta["akanjs/failure"]`, so it still reads as a guard refusal.
  - A page guard reads a 403 as not-found unless the server kept it, and rethrows a kept one as it is.
  - A `.prompt()` page whose query is refused by a guard's 401/403 still answers as the caller refused. A kept 403 now answers as the page failing, with no credential challenge.
- Boot and configuration failures are coded but stay 500:
  - `invalidSignal`, `routeConflict` and `unguardedEndpoint` for signal declarations
  - `invalidCascade` for cascade fields
  - `invalidKey` for an Ed25519 key, or the ops key, that cannot be read. A key that fails to parse keeps the parser's error as `cause`.
  - `invalidConfig` for `MachineToken.issue`, an ops key that is also the machine token key, and `@Transaction` with no transactional database
  - `invalidIdentity` for `MachineToken.issue`
  - `artifactMissing` and `invalidArtifact` for the route seed index
  - `consoleDisabled`
  - `notRegistered` and `notInitialized`

Branch on `AkanError.is(error, "<code>")` rather than on the message. `error.name` is still `"Error"`, and `instanceof Error` still holds.
