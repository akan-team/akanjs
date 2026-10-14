---
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

CLI fixes for the OTA and Akan Cloud commands:

- **One exit-code rule for the OTA commands.** `akan pack-update --against`, `akan push-update` and `akan register-binary` exit 2 when the pack needs a new store build. `push-update` also exits 2 when the project rejects the release. Any other failure exits 1. Each command's `--help` lists these codes.
- **Akan Cloud refusals are read from the status and the whole response body**, so a server `Err` key is found wherever it sits in the body. When the server asks a pack commit or binary registration to retry, the CLI waits at least its `Retry-After`, and stops at once if that wait would pass the deadline. A storage PUT that gets a 429 or 503 also waits its `Retry-After`, up to a minute.
- **Runner prompts fail fast when stdin is not a terminal.** This covers picking a script for `akan script`, installing a database mode's packages, choosing the scp env server, entering a Windows test target, going on past a platform test that did not pass, and confirming a `deploy-akan` publish. Each one used to read the piped input as its answer. Each now fails with what to pass or set instead.
- **A malformed pipeline secret name is never echoed back** by `akan upload-secret` or `akan remove-secret`. Such a "name" is often a value pasted in the wrong place, and the refusal lands in terminal scrollback and CI logs.
- **`deploy-akan`** writes each versioned `package.json` with its trailing newline, and so does the CLI dist.
- **A template's static file** (an image or a font) is kept when the caller passes `overwrite: false`, which text files already did. Before, it was copied over the user's file.

devkit adds `ExitCodeError` (a command exits with its code) and `assertPromptable(problem, { choices, remedy })` to `@akanjs/devkit/commandDecorators`. `@akanjs/devkit/cloud` gains `CloudHttpError` (status, whole body, headers), `PipelineSecrets` and `CloudUpdates`, and `@akanjs/devkit/mobile` gains `UpdatePackFolder`, the one reader and writer of a pack folder. Cloud `HttpClient` failures are `CloudHttpError`s, with the same message as before.

Upgrade note: a CI step that answered one of the runner prompts above through stdin now fails. Pass the argument or set the value the error names.
