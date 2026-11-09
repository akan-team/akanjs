---
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

`akan lint`, `akan lint-all` and `akan verify` now hold each package under a workspace's `pkgs/` to a structure budget, as they already hold apps and libs: a file up to 800 lines, a function up to 150 lines (`akan.size.function`) and a class up to 60 members (`akan.size.class`). Tests, `.d.ts` files, re-export barrels and a package's `examples/` are left out, and a package in a git repository is listed through git, so ignored files are never measured. Each package keeps its own `akan.baseline.json`, which only shrinks from the default branch's copy; `akan quality baseline` now seeds one for each package too, and published packages leave it out.

Upgrading: in a workspace whose packages are over the budget, run `akan quality baseline` once to record what they hold today.

`akan test <target> --coverage` measures coverage: a summary on stdout and `lcov.info` under `local/coverage/<target path>`. CI runs each package's tests this way and keeps the report as an artifact.
