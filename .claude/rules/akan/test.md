---
description: Tests: Bun's runner, one suite per module file, the signal test split and how to run them.
paths:
  - "apps/**/*.test.ts"
  - "apps/**/*.spec.ts"
  - "libs/**/*.test.ts"
  - "libs/**/*.spec.ts"
---

<!-- akan:generated -->

# Test Code

- Bun's runner (`describe`, `expect`, `test` from `bun:test`); colocated `*.test.ts` / `*.spec.ts`; focused behavior
  tests of public contracts and edge cases. A placeholder `it` with a descriptive title is the floor; a
  security-relevant behaviour gets a real suite.
- Run `bun run akan test <pkg> [files]` from the root (`files`: comma-separated paths from the target or the root;
  the only way a signal test runs), or `cd <pkg> && bun test --isolate ./<file>`. Plain `bun test` shares one global
  object across files and fails dozens of tests from that pollution (`bunfig.toml` `[test] isolate` is not honored as
  of Bun 1.4.4); from the repo root it breaks subprocess stdio pipes.
- Signal tests split in two: `<model>.signal.spec.ts` holds fixtures on `sampleOf(cnst.XInput)` with explicit
  `Promise<cnst.X>` returns and **no assertions**; `<model>.signal.test.ts` holds `describe("<Model> Signal")`,
  describe-scope `let` fixtures, one `beforeAll`, story-ordered `it`s, negatives via
  `await expect(p).rejects.toThrow()`. Each `fetch.clone()` reports its own address (`198.18.x.y`), so an `ip` rate
  limit counts it apart: clone once per simulated user, signup included (`clone({ clientIp })` names one).
- **One suite per module file**: `<model>.<role>.test.ts` beside the file it covers — never topic splits
  (`chatMessage.trim.signal.test.ts`); add a `describe`. A suite spanning modules goes in `srvkit/`
  (`libs/shared/srvkit/guards.signal.test.ts`), never the `lib/` root; `akan sync` refuses all three shapes. Only
  `akan verify` and `akan typecheck <app-or-lib>` typecheck tests (`bun:test` types included) and the `script/`
  files nothing imports.
- Delete an export only tests reference together with its test (`akan quality scan` reports
  `akan.global.test-only-export` in an app's `common/`, `webkit/`, `srvkit/`, `ui/`).
- Import `UserAgent` / `AdminAgent` from `lib/user/user.signal.spec.ts`, the one place agent types are re-typed.

**Verify endpoints with signal tests, not raw HTTP.** The canonical way to check a query/mutation/slice
contract is an in-memory signal test (`<model>.signal.test.ts`), using the test fetch harness
(`getOrSetupSignalTestFetch`) — it is fast, needs no running server, and exercises `fetch.*`, `view/edit/merge<Model>`,
and slice `init`/`list`/`insight` directly. Prefer it over `curl`: the dev gateway locale-prefixes routes (`/en/...`),
so hand-rolled HTTP calls against a raw path can redirect unexpectedly. See `akan test <app>`.
