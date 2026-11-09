---
"akanjs": patch
---

The framework's errors share one base, `AkanError` in `akanjs/base`. It carries a `code` to branch on, the `statusCode` the request path answers with (500 unless given), and an optional `cause` and `data`. `toJSON()` writes them out, and `MigrationError.is(error, "locked")` checks the class and, when named, the code.

- **Existing classes extend it** with their names, messages and fields unchanged: `Exception` and its status classes, `NoDocumentError`, `InvalidInputError`, `FilterQueryError`, `MigrationError`, `McpArgumentError`, `McpAuthRequiredError`, `LogControlUnavailableError` and the image optimizer's error. An `Exception` takes the code of its status (`tooManyRequests` for a 429); its wire body is unchanged.
- **A failure the request path generalizes keeps its code and status.** An `AkanError` that is neither an `Exception` nor a missing document used to be answered as a plain `500 Internal Server Error`. It is now answered with its own status, the status's reason as `error` and its `code`, for example `{ "error": "Service Unavailable", "code": "queueFull", "statusCode": 503 }`. Its message still stays home in a production build, and a status outside 400–599 still answers 500. Anything that is not an `AkanError` is answered as before.
- **The code survives a restore.** A repeated idempotent mutation replays the first run's status and code, and a restored remote failure or client `Err` keeps `code` and writes it back out in `toJSON()`. `HttpClient` reads a 408, 413, 429 or 5xx body that carries a `code` as the server's own answer, so it restores it with its code and does not retry it, as it already did for a dictionary key.
- **MCP answers it the same way.** A tool call that fails with such an error under 500 reads `<reason>: <code>` (`Conflict: titleTaken`) instead of `The server failed to complete this request.`, and is not logged as a crash. Its message stays home here too.
- **`AkanError.is(error)` recognises an error from another copy of the module**, as a server bundle and main.js each carry one, so the redaction holds for those too. A subclass's `is` still checks `instanceof`.
