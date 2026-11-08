---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A new `rename-key` workflow renames a slice key or a Filter query key everywhere it is spelled. That covers the key itself, every name derived from it (`initMemoInPublic`, `memoListInPublic`, `queryByName`) in the app and every lib, and its module dictionary entry. It is the same rename the editor extension's F2 runs, so agents get it through `plan_workflow` / `apply_workflow` and the CLI through `akan workflow plan rename-key --app <app> --module <module> --slice <key> --to <newKey>` (or `--query <key>`). The plan lists each file it will change. A use that could also be another model's is left alone, and `akan verify` then reports it.
