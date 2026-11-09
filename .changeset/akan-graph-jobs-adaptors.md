---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

The Akan Graph draws a module's jobs and the adaptors its services plug. Each key of an `internal()` class is an `internal` node, `internal:apps/demo:memo.sweepMemos` labelled `MemoInternal.sweepMemos`, whose `detail` reads its type, its schedule (a cron expression, or an interval or timeout such as `5m`), its `serverMode` and `operationMode`, `disabled` for `enabled: false`, `once` for `once: true` and `unlocked` for `lock: false`; a job links to the service methods its `exec` calls, as an endpoint does. A `resolveField` is a field resolver, not a job, and stays out. Each `adapt()` or `dangerouslyAdapt()` class is an `adaptor` node keyed by the app or lib that declares it, with its registered name in `detail`, its location, the comment above it and a digest; anything a service plugs from `akanjs`, such as `DatabaseAdaptorRole`, is `adaptor::DatabaseAdaptorRole` with no location. A service method that calls a plugged field (`this.storageApi.deleteData(url)`) links to that adaptor rather than to whatever else shares the method's name, and a `plugs` edge runs from an adaptor to each adaptor it plugs. Studio's signals view shows jobs in its "Endpoints, slices & jobs" column and adaptors in "Queries, models & adaptors".

- **`internal`, `adaptor` and `plugs`** join `AkanGraphNodeKind` and `AkanGraphEdgeKind` in `akanjs/common`.
- **`FileFacts.internals` and `FileFacts.adaptors`** in `@akanjs/language`, with `ServiceClassFact.plugs`; `AkanIndex.setFile` also reads non-test files that call `adapt` or `dangerouslyAdapt`.
