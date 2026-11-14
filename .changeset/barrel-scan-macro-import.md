---
"@akanjs/devkit": patch
---

`akan start` no longer logs `[BarrelAnalyzer] ERROR scan failed: Parse error` over and over. The message came from each app's and lib's generated `lib/useClient.ts`.

- The barrel analyzer now reads a module that calls a `with { type: "macro" }` import. Bun's `Transpiler.scan` used to throw on such a module, so the analyzer skipped it.
- Imports rewritten from the generated `client` barrels were already correct, so the output stays the same.
- A file that still fails to scan is now named in the log line.

No upgrade step is needed.
