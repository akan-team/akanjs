---
"akanjs": minor
---

The signal and service facets throw coded failures instead of a bare `Error`. Each one keeps its message, so a test or a log matching the text still matches. Each one carries a `code` that a caller, an agent or an MCP client can branch on, for example `DocumentStoreError.is(error, "invalidQuery")`.

| Class | Codes | Status |
|---|---|---|
| `SignalDeclarationError` (`akanjs/signal`) | `handlerAlreadySet`, `nullableLastArg`, `liveAlreadySet`, `invalidArgType`, `invalidErrors`, `baseMismatch`, `missingModel`, `missingSlice` | 500 |
| `SignalContractError` (`akanjs/signal`) | `undefinedReturn`, `bytesThroughAny`, `wrongTransport`, `notRegistered`, `noHandler` | 500 |
| `PromptError` (`akanjs/signal`) | `invalidPrompt`, `unmaskedResource` | 500 |
| | `inlineFailed` | 502 |
| `InjectError` (`akanjs/service`) | `notRegistered`, `notInitialized`, `invalidInject` | 500 |
| `DocumentStoreError` (`akanjs/service`) | `invalidQuery`, `invalidSchema`, `invalidDocument`, `tableMissing`, `searchUnavailable`, `searchMisconfigured` | 500 |
| | `unstorableValue` | 400 |
| `InsightQueryError` (`akanjs/service`) | `invalidInsightQuery` | 400, forwarded |
| | `insightTimeout` | 504, forwarded |
| | `insightUnavailable` | 500 |
| `AkanError` | `invalidStorageKey` | 400 |
| | `storageNotShared`, `liveRoomTaken`, `unroutableLiveQuery`, `missingFilterQuery`, `compressorNotInitialized`, `redisUriMissing`, `transferUnsupported` | 500 |

The request path answers every one of these except the forwarded ones as `SignalFailure` already does for an `AkanError`. The response carries the status, the status's reason and the code. The message is left out in a production build, since it can name a table, a field, a role or a signed URL. A state that configuration must fix answers 500, and so does a broken declaration. Examples are text search switched off, no insight connection, and local files in a multi-instance deployment.

A refused insight statement is forwarded to its author as a fixed sentence or with the author's own keyword or column. When Postgres refuses the role (42501), the sentence carries none of the driver's text. That text stays on the error's `cause`, and the `Logging` middleware's line prints it. A statement Postgres cancels on its `statement_timeout` (57014) answers `insightTimeout`, like the timeout `InsightQuery` races.

**Upgrade.** Most of these used to answer `500 Internal Server Error` with no code. Check any caller that branches on the status:

- **400**: a string holding U+0000 that the store refuses to save, and a storage key outside the storage root.
- **502**: a prompt that fails to inline a file.
- **`InsightQuery`**: a refused statement now reaches its author as a 400 with its message, and a timeout as a 504.
- **No retry**: `HttpClient` does not retry these 502s and 504s. A body carrying a code is the server's own answer, not a gateway's.
- **Logging**: `SignalContext` writes its crash entry, with the stack, only from 500 up. So a 400 above gets the `Logging` middleware's one error line, and that line now names the error's `cause`.

**A 429 that is not forwarded** is now treated like the rate limit's own:

- `SignalFailure` sends its `Retry-After` from `data.seconds`, a finite number only. The new `SignalFailure.headersOf(error, statusCode)` builds the headers for both paths.
- The `Logging` middleware keeps it at debug level.
- `HttpClient` restores it under `base.error.tooManyRequests`, with the code it carried and the wait its `Retry-After` names. So it is retried and worded as a forwarded one is. One with no `Retry-After` to read, because none was sent or a cross-origin caller is not exposed to it, stays the refusal it was and is not retried.

**`Exception.<Status>.is(error)` type-checks.** `StatusException` now declares `is`, so `Exception.BadRequest.is(error)` narrows `error` to an `Exception` and checks its own class.
