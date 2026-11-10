---
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

A CLI failure carries a code and the exit status its family takes, so a script branches on either instead of the message.

- Exit 2 (`usage`, `unknownTarget`): a flag, argument or command commander refuses, a value outside an option's choices, an argument left out where no terminal can ask for it, a run outside the workspace root, and an app, lib, package or module the workspace does not have. These exited 1 before, except for `akan migrate`, `akan pipeline` and `akan verify <name>`, which already exited 2.
- Exit 2 (`refused`) stays what it was: a pack that needs a new store build, and a release the Akan Cloud project rejected.
- Exit 3 (`checkFailed`): `akan verify`, `akan typecheck` and the typecheck of `akan build`, `akan preview` and `akan agent install --check` when they found problems. These exited 1 before.
- Exit 130 (`interrupted`) for a prompt closed with Ctrl+C, which exited 1.
- Exit 1 (`failed`, or an `AkanError`'s own code) for anything else, as before.
- `akan pack-update`, `akan push-update` and `akan register-binary` keep exiting 1 for a usage or unknown-target failure, so their 2 still means only the store-build verdict or the project's refusal. `akan agent` exits 1 for one too, and `akan agent hook` never exits 2, saying on stderr why the hook failed: Claude Code reads a hook's exit 2 as a block.

With `--json` or `--format json`, a failure now ends stdout with one line, `{"ok":false,"error":"<message>","code":"<code>"}`, and the message goes to stderr instead of stdout. An NDJSON stream (`akan code --json`, `akan logs --json`) ends with that line too. A command whose own JSON report says it failed, as `akan verify`'s does, adds no line. `akan migrate --json` answers `usage` or `notFound` for a command line or an app it cannot take before the app runs, matching its exit 2.

Upgrade: a script that tested for exit 1 after a usage error, a failed check or a closed prompt tests for non-zero, or for 2, 3 and 130. A CI step that branches on exit 2 from the OTA commands needs no change. `@akanjs/devkit/commandDecorators` exports `CliError(code, message, { exitCode })`, `ExitCodeError` is now one coded from its exit status (2 as `refused`, 3 as `checkFailed`), and a target's `usageExitCode` now also sets the exit of a `usage` or `unknownTarget` failure thrown while it runs.
