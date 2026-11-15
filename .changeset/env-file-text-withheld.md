---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A problem in an env file is reported without the file's text, so a build or lint log holds no secret.

- **Type errors.** `akan build`, `akan typecheck` and `akan verify` report a TypeScript error in `env/env.server.*.ts` or `env/env.client.*.ts` by file, line, column and code alone. The source line and TypeScript's message are left out, because either can quote a value.
- **Lint.** `akan lint` and `akan verify` report a diagnostic in those files by file, line, column and rule, with no code frame, formatter diff or rule message. The files are still linted and formatted, and their errors still fail the run. Every other file prints as before.
- **`akan lint` output.** The `Found N errors.` lines are printed once at the end and the "Checked N files in …" line is gone. When Biome cannot read `biome.json`, the error is Biome's own explanation.

**Upgrading.** A failed `akan lint` now exits with 3, the code of a failed check, where it exited with 1. A script that tests for a non-zero exit needs no change; one that tests for exactly 1 does. To see what is wrong on a line of an env file, open the file at the position the diagnostic names.
