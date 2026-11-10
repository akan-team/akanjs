---
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

`akan lint`, `akan lint-all` and `akan verify` now hold each package under a workspace's `pkgs/` to a structure budget, as they already hold apps and libs: a file up to 800 lines, a function up to 150 lines (`akan.size.function`) and a class up to 60 members (`akan.size.class`). Tests and their fixtures (`*.test`, `*.spec`, `*.fixture`, `*.instance` and `*.bench` files, and `test/`, `tests/`, `__tests__/`, `__fixtures__/` and `__mocks__/` folders), `.d.ts` files, re-export barrels and a package's `examples/` are left out, and a package in a git repository is listed through git, so ignored files are never measured. Each package keeps its own `akan.baseline.json`; `akan quality baseline` now seeds one for each package too, `akan quality scan` reports its exceptions, and packing a package that would publish one fails.

A baseline only shrinks from the default branch's copy. Where the default branch has none, an app's, lib's or package's baseline may hold only the breaches the default branch's code already has, so a new one starts empty instead of skipping the check. A file's line count no longer includes the newline ending its last line, so a recorded size may drop by one on the next `akan lint`.

Upgrading: in a workspace whose packages are over the budget, run `akan quality baseline` once to record what they hold today.

`akan test <target> --coverage` measures coverage: a summary on stdout and `lcov.info` under `local/coverage/<target path>`. CI runs each package's tests this way and keeps the report as an artifact.
