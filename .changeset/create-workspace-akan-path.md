---
"create-akan-workspace": patch
---

`create-akan-workspace` no longer hangs when it cannot start `akan`. When Bun was installed through npm, `bun install -g @akanjs/cli` puts `akan` in Bun's global bin folder (`~/.bun/bin`), which is not on that machine's PATH. Starting `akan create-workspace` then failed with "Executable not found in $PATH", nothing listened for the error, and the process spun at full CPU without exiting. It now runs `akan` with Bun's global bin folder (`bun pm bin -g`) on PATH, exits with the error if a step cannot start, and, when that folder is not on your PATH, says so after creating the workspace so you can add it.
