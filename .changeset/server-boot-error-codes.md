---
"akanjs": patch
"@akanjs/cli": patch
---

`AkanServer`, the DI container, the RSC worker host and `AkanApp` now fail with a coded `AkanError` instead of a bare `Error`. Messages are unchanged, and so is every status a caller is answered with. The error-code reference lists the new codes.

- `AkanServer`:
  - `alreadyStarted` (500): a `set*` config call, or a second `init()`, once the server has started.
  - `notInitialized` (500): `listen()` before `init()`, or `get`/`getService`/`getSignal`/`getAdaptor` before the server is initialized.
  - `shutdownTimeout` (500): `stop()` when the teardown outlasts `setShutdownTimeout`.
- The DI container:
  - `InjectError` `notRegistered` / `notInitialized` (500): a lookup, a plug or memory inject, or the scheduler, with nothing registered or initialized under that name.
  - `invalidConfig` (500): `modules`, `disableModules` or `disableLibs` names an unknown module or lib, an `@<operationMode>` selector matches no module, or the build does not carry the database mode's drivers.
  - `circularDependency` (500): services or adaptors inject each other in a cycle.
  - `duplicateRegistration` (500): two owners claim one adaptor, use, job, fetch handler or socket key.
  - `stageFailed` (500): tasks of a boot stage failed. Its `errors` holds each task's own error.
- The RSC worker host:
  - `rscWorkerFailed` (500): the worker answered a render, a page prompt or manifest call, its boot or a reload with an error. A failed reload still carries `adopted` and `failed`.
  - `rscWorkerStopped` (500): the worker was stopped, exited, or could not be sent the request.
  - `renderAborted` (499): the request aborted with a reason that is not an `Error`. It is still named `AbortError`, so the page still answers 499.
  - `rscQueueOverflow` (500): the host's chunk queue for a render passed its cap.
  - `invalidRscResponse` (500): the worker sent a redirect or a not-found after the stream started.
- `AkanApp`:
  - `invalidConfig` (500): a desktop app's server asked for a gateway and replicas.
  - `invalidArtifact` (500): the solo server module exports neither `server` nor `app` with `start()`.

**Upgrading.** A failed DI boot stage used to throw an `AggregateError`. It is now an `AkanError` coded `stageFailed`, so `instanceof AggregateError` no longer matches it. Its `errors` still lists each task's error, and you can branch on `AkanError.is(error, "stageFailed")`.
