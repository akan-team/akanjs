---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

Rules an app could break without any check noticing now fail a check, and each failure names the workflow that builds the right shape.

- **`akan lint` fails on size, store reach, where a write starts, chained writes and per-item service calls.** For an app or library, `akan lint` fails on:
  - **Size** (`akan.size.file`, `akan.size.component`): a `Zone`, `Util`, `Template`, `Unit`, `View`, `*.store.ts`, or `ui/` / `webkit/` file over 400 lines; a service or document over 500; an abstract over 300; a component or hook over 250.
  - **Store reach** (`akan.component.store-access`): a component or hook reaching `st` more than 16 times, form setters aside.
  - **Where a write starts** (`akan.write.placement`): a `fetch.<mutation>` outside a `*.store.ts`, or a writing `st.do.*` in `ui/` or `webkit/`. A server write leaves the browser through one store action, started by a module component; `ui/` and `webkit/` take it as a prop or hook argument.
  - **Chained writes** (`akan.store.multi-write`, `akan.store.root-write-chain`, `akan.component.write-chain`): two or more writes, or one write per item in a loop or `map`, sent from the browser by one store action, one store `static`, or one handler of a component or hook. This holds directly, through a sibling action, or through another store via `RootStore`.
  - **Per-item service calls** (`akan.service.call-in-loop`): a service method an `endpoint` or `slice` reaches that calls a service, a model or a generated query once per item. `internal` jobs and counted loops (retries, paging) are spared.

  Each failure prints its rule and, where one exists, the `akan workflow plan …` command that fixes it.
- **Adopting the gate.** In a workspace that already breaks these rules, run `akan quality baseline` once. It writes an `akan.baseline.json` at each app or library root that needs one, recording each breach under its rule id with what was measured: lines, store accesses, writes or calls. `--force` rewrites an existing file. Commit it.
  - After that, `akan lint` fails only on what grows or is new, and lowers an entry as its code shrinks.
  - It refuses a baseline that adds or raises an entry against its copy at the fork point of the default branch, so a raise committed on a branch still fails.
  - A size, store-reach or per-item entry may be added or raised when its key carries a `reasons` line, for code a person deliberately left that way. The write rules take no exceptions.
  - `akan quality scan` counts each app's adopted debt and reasoned exceptions per rule (`akan.baseline.exceptions`).
- **`akan workflow plan add-mutation`** builds the whole write path in one apply: the document chain method, the service method, the mutation, a one-line store action, the dictionary entry and signal test stubs.
  - `--guard` is required and checked against the guards the target can reach; `None` is refused.
  - `--with <ref>.<method>` runs other writes inside the mutation's `this.transaction()`.
  - `--after <ref>.<method>` runs side effects in `this.afterCommit()`.
  - A `Public` mutation gets a rate limit.
- **`akan workflow plan create-interaction`** creates a `webkit/use<X>.tsx` hook over a pure `common/<x>.ts` class, plus the class's test. It is for drag, selection, keyboard and layout logic that would otherwise grow inside a component.
- **Lists past 500 rows.** A client list asked for more than 500 rows is served 500, as before.
  - The server now logs that once per list, as it already did for `limit: 0`.
  - The lint rule `no-oversized-list-limit` fails on a literal limit above 500 in `fetch.<model>List<Suffix>(…, skip, limit)`, in `{ limit }` passed to `fetch.init…` / `st.do.init…` / `st.do.refresh…`, and in `st.do.setLimitOf…`.
  - A store list asked for more than 500 now reads `hasMoreOf…` as true when a full 500 came back, so `loadMoreOf…` fetches the rest instead of stopping.
- **`akan typecheck`** now also checks an app's `script/` files, which nothing imports; `akan build` does not.
- **`akan quality scan`** also warns about:
  - a `lib/` module or `ui/` entry whose comments pass 1 % of its lines once it holds five comment lines (`akan.comment.density`);
  - a `// deprecated` comment that should be a `/** @deprecated */` tag (`akan.comment.deprecated-marker`);
  - an export in an app's `common/`, `webkit/`, `srvkit/` or `ui/` that only tests use (`akan.global.test-only-export`);
  - a `*Kind` / `*Type` / `*Mode` enum value compared in three or more files outside its module (`akan.global.kind-branch`); a kind table declared once replaces those comparisons.
- `libs/shared` and `libs/util` ship an `akan.baseline.json` recording their current breaches.
