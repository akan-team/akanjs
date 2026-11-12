# Akan.js error codes

Generated from the akanjs sources of this release: every code a framework error carries, so a caller branches on
`error.code`, or the `code` of the JSON it was answered with, rather than on the message.

- A **forwarded** error answers with its own JSON. Any other `AkanError` answers with its code and status, and in
  production with the status's reason in place of its message, which can name a table, a file or what a provider
  said (`akan start` and `AKAN_ERROR_DETAIL=1` keep the message).
- **Code on the wire** says whether that JSON carries `code`. A forwarded error whose JSON leaves it out is told
  apart by its `error` key and status.
- An app's own failure is a dictionary `Err`, which carries its key in `error` instead of one of these codes.
- In code, `AkanError.is(error, "<code>")` tests any framework error for a code, and `<Class>.is(error)` one class.

## Codes

| Code | Status | Error | Forwarded | Code on the wire | Source |
|---|---|---|---|---|---|
| `alreadyApplied` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `alreadyStarted` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `artifactMissing` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `authRequired` | 401 | `McpAuthRequiredError` | no | yes | `server/mcp/McpDispatcher.ts` |
| `badGateway` | 502 | `ImageOptimizerError` | no | yes | `server/imageOptimizerError.ts` |
| `badRequest` | 400 | `Exception.BadRequest` | yes | no | `signal/exception.ts` |
| `badRequest` | 400 | `ImageOptimizerError` | no | yes | `server/imageOptimizerError.ts` |
| `baseMismatch` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `buildFailed` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `builderUnavailable` | 503 | `AkanError` | no | yes | `base/akanError.ts` |
| `bytesThroughAny` | 500 | `SignalContractError` | no | yes | `signal/signalContractError.ts` |
| `circularDependency` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `clientComponentOnServer` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `compressorNotInitialized` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `conflict` | 409 | `Exception.Conflict` | yes | no | `signal/exception.ts` |
| `consoleDisabled` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `databaseLocked` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `desktopAppRequired` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `documentNotFound` | 404 | `NoDocumentError` | yes | no | `document/noDocumentError.ts` |
| `duplicateRegistration` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `failed` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `fileGrantRefused` | 403 | `AkanError` | no | yes | `base/akanError.ts` |
| `fileGrantUnavailable` | 503 | `AkanError` | no | yes | `base/akanError.ts` |
| `forbidden` | 403 | `Exception.Forbidden` | yes | no | `signal/exception.ts` |
| `gatewayTimeout` | 504 | `Exception` | yes | no | `signal/exception.ts` |
| `handlerAlreadySet` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `inlineFailed` | 502 | `PromptError` | no | yes | `signal/mcp/promptError.ts` |
| `insightTimeout` | 504 | `InsightQueryError` | yes | yes | `service/insightQueryError.ts` |
| `insightUnavailable` | 500 | `InsightQueryError` | no | yes | `service/insightQueryError.ts` |
| `internalError` | 500 | `Exception.Error` | yes | no | `signal/exception.ts` |
| `invalidArgType` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `invalidArgument` | 400 | `McpArgumentError` | no | yes | `server/mcp/McpExecutionContext.ts` |
| `invalidArtifact` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidCascade` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidConfig` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidDocument` | 500 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `invalidErrors` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `invalidFileGrant` | 400 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidFilter` | 400 | `FilterQueryError` | no | yes | `document/filterMeta.ts` |
| `invalidIdentity` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidInject` | 500 | `InjectError` | no | yes | `service/injectError.ts` |
| `invalidInput` | 400 | `InvalidInputError` | no | yes | `constant/invalidInputError.ts` |
| `invalidInsightQuery` | 400 | `InsightQueryError` | yes | yes | `service/insightQueryError.ts` |
| `invalidKey` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidMessage` | 400 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidParam` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `invalidPrompt` | 500 | `PromptError` | no | yes | `signal/mcp/promptError.ts` |
| `invalidQuery` | 500 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `invalidRoute` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidRscResponse` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidSchema` | 500 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `invalidSignal` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `invalidStorageKey` | 400 | `AkanError` | no | yes | `base/akanError.ts` |
| `ipcRequired` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `jobStalled` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `listFailed` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `liveAlreadySet` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `livePaused` | 409 | `AkanError` | no | yes | `base/akanError.ts` |
| `liveRoomTaken` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `locked` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `logControlUnavailable` | 503 | `LogControlUnavailableError` | no | yes | `server/logging/logTailClient.ts` |
| `missingFilterQuery` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `missingInput` | 400 | `InvalidInputError` | no | yes | `constant/invalidInputError.ts` |
| `missingModel` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `missingSlice` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `noHandler` | 500 | `SignalContractError` | no | yes | `signal/signalContractError.ts` |
| `notApplied` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `notFound` | 404 | `Exception.NotFound` | yes | no | `signal/exception.ts` |
| `notFound` | 404 | `ImageOptimizerError` | no | yes | `server/imageOptimizerError.ts` |
| `notFound` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `notInitialized` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `notInitialized` | 500 | `InjectError` | no | yes | `service/injectError.ts` |
| `notRegistered` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `notRegistered` | 500 | `InjectError` | no | yes | `service/injectError.ts` |
| `notRegistered` | 500 | `SignalContractError` | no | yes | `signal/signalContractError.ts` |
| `nullableLastArg` | 500 | `SignalDeclarationError` | no | yes | `signal/signalDeclarationError.ts` |
| `payloadTooLarge` | 413 | `AkanError` | no | yes | `base/akanError.ts` |
| `payloadTooLarge` | 413 | `ImageOptimizerError` | no | yes | `server/imageOptimizerError.ts` |
| `planChanged` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `redisUriMissing` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `renderAborted` | 499 | `AkanError` | no | yes | `base/akanError.ts` |
| `routeConflict` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `routeNotFound` | 404 | `AkanError` | no | yes | `base/akanError.ts` |
| `routeNotFound` | 404 | `RscRouteNotFound` | no | yes | `server/rscClient.tsx` |
| `routerNotReady` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `rpcDisposed` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `rscFetchFailed` | 502 | `AkanError` | no | yes | `base/akanError.ts` |
| `rscQueueOverflow` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `rscRedirectStarted` | 303 | `RscRedirectNavigationStarted` | no | yes | `server/rscClient.tsx` |
| `rscWorkerFailed` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `rscWorkerStopped` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `searchMisconfigured` | 500 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `searchUnavailable` | 500 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `secretRefused` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `secretStoreUnavailable` | 503 | `AkanError` | no | yes | `base/akanError.ts` |
| `serviceUnavailable` | 503 | `ImageOptimizerError` | no | yes | `server/imageOptimizerError.ts` |
| `shutdownTimeout` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `stageFailed` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `storageNotShared` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `tableMissing` | 500 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `tooManyRequests` | 429 | `Exception` | yes | no | `signal/exception.ts` |
| `transferUnsupported` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `unauthorized` | 401 | `Exception.Unauthorized` | yes | no | `signal/exception.ts` |
| `undefinedReturn` | 500 | `SignalContractError` | no | yes | `signal/signalContractError.ts` |
| `unencodableValue` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `unguardedEndpoint` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `unmaskedResource` | 500 | `PromptError` | no | yes | `signal/mcp/promptError.ts` |
| `unroutableLiveQuery` | 500 | `AkanError` | no | yes | `base/akanError.ts` |
| `unstorableValue` | 400 | `DocumentStoreError` | no | yes | `service/documentStoreError.ts` |
| `unsupportedMediaType` | 415 | `Exception.UnsupportedMediaType` | yes | no | `signal/exception.ts` |
| `usage` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `verifyFailed` | 500 | `MigrationError` | no | yes | `server/migration/migrationError.ts` |
| `wrongTransport` | 500 | `SignalContractError` | no | yes | `signal/signalContractError.ts` |
| set when thrown | set when thrown | `Err` | yes | yes | `common/err.ts` |
| set when thrown | set when thrown | `Err.BadRequest` | yes | yes | `common/err.ts` |
| set when thrown | set when thrown | `Err.Conflict` | yes | yes | `common/err.ts` |
| set when thrown | set when thrown | `Err.Forbidden` | yes | yes | `common/err.ts` |
| set when thrown | set when thrown | `Err.NotFound` | yes | yes | `common/err.ts` |
| set when thrown | set when thrown | `Err.Unauthorized` | yes | yes | `common/err.ts` |

## Codes by status

An error coded by its status, such as an `Exception`, takes its code from `AkanError.codeOfStatus`:

| Status | Code | Reason |
|---|---|---|
| 400 | `badRequest` | Bad Request |
| 401 | `unauthorized` | Unauthorized |
| 403 | `forbidden` | Forbidden |
| 404 | `notFound` | Not Found |
| 409 | `conflict` | Conflict |
| 413 | `payloadTooLarge` | Payload Too Large |
| 415 | `unsupportedMediaType` | Unsupported Media Type |
| 429 | `tooManyRequests` | Too Many Requests |
| 500 | `internalError` | Internal Server Error |
| 502 | `badGateway` | Bad Gateway |
| 503 | `serviceUnavailable` | Service Unavailable |
| 504 | `gatewayTimeout` | Gateway Timeout |

Any other status is coded `http<status>`, with the reason `Internal Server Error` from 500 and `Request Failed`
below it.
