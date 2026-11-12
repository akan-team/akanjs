---
"@akanjs/devkit": patch
---

Subspace sync passes the repository and branch to `git clone`, `fetch` and `push` after `--`, so neither can be read as a git option, and `subspace` config refuses a repo starting with `-`. The store-access scanner's form-setter check and the convention and AGENTS.md readers no longer backtrack quadratically on a long name or a long run of spaces.
