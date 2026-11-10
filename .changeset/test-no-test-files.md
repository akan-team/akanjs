---
"@akanjs/cli": patch
---

`akan test <target>` on an app, library or package with no test file now prints `No *.test.ts or *.spec.ts file in apps/<app>, so no test ran.` and exits 0. For an app or library the line also says where a signal test goes. Before, Bun answered `error: 0 test files matching …` and the command exited 1, so a fresh `akan create-application` app read as a failing suite. Naming files or folders that hold no test still exits non-zero, and a target with any test file runs as before.
