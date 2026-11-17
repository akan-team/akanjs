---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A page registers the constants of the models its client code names, not every model's. A page that keeps the whole runtime still loads `lib/cnst.ts`; the one change there is that a registered model no longer carries its type-only `_`-prefixed members as `null` values.

- `akan sync` writes one registration piece per model and scalar, `lib/__client/<model>.cnst.ts`, which imports that module's constant file and the pieces of the models the file names, then registers the model. `lib/cnst.ts` keeps its shape and exports. A model's `.fetch` and `.st` pieces load its registration piece first, and so does a handoff reference (`<model>.ref.ts`), which loads one of them. A `.fetch` piece names the pieces it needs first in its own `FetchClient.build` call, so loading them first adds no statement to a page. A registration piece that no page loading only pieces reaches (only pages that also load the whole runtime, or only a handoff) takes its model from `lib/cnst.ts` instead, so those pages keep every constant in the one chunk they already share.
- The build rewrites `cnst.Memo`, `cnst.memo`, `cnst.MemoStatus`, a lib's `cnst.util.File` and `const { MemoStatus } = cnst` to imports of those names from the file declaring each; a type-only use loads nothing. A file keeps the whole `lib/cnst.ts` when it passes `cnst` on (as an argument, a spread, `Object.keys(cnst)` or another variable), picks a member with a computed key, names something `cnst` does not hand out, or hides names behind a rest or nested destructuring, and so does a constant file that reads its own app's or lib's `cnst`.
- A framework component that walks every registered model (the API explorer, the schema page, relation pickers, query makers) loads the whole runtime, `lib/cnst.ts` included, so it sees every model on any page. So does `Data.Dashboard`, whose tiles read their filters from a model a prop names: the server registers every model, so with fewer in the browser the tiles would render differently after hydration.
- Registering the same model or scalar again, from its piece and from `lib/cnst.ts` in one tab, returns the first registration; another class claiming a taken name still fails. A repeat is the same name with the same classes from the same constant file: a file that registers several names registers each, and a name that comes again with other classes registers those.
- In development, saving a `*.constant.ts` file reloads the tab, which registers the model before its fetch and store pieces run, as a built page does. The names a saved scalar file (`lib/__scalar/<name>/<name>.constant.ts`) declares are read again, as a model's are.
- The agent's form tools find the setters of a model a page registers after their first lookup.
- `akan quality runtime` notes each client or constant file that keeps every constant (`akan.runtime.whole-constants`), with its reason, and counts them per app and lib.
- The build's own check also fails when a registration piece is imported back by a file it loads, or when a page built to load pieces reaches `lib/cnst.ts` other than through a file `akan quality runtime` names or a registration piece answering from it. A page that such a file or piece already makes load every constant may reach them by another path too: a handoff reference no route hands over takes its models from `lib/cnst.ts`, and their constant files stay as written.

In the sample apps the memo pages of `apps/minimal` went from 263.5 KB to 262.3 KB and from 236.1 KB to 234.8 KB (brotli); every other route stays within 0.2 KB of before.

**Upgrading.**

Until the pieces exist (an `akan build` or `akan sync <app>` writes them) the build keeps the whole `lib/cnst.ts`. `akan quality runtime` lists the files that keep every constant and why; rewriting one to `cnst.<Name>` or `const { … } = cnst` lets its pages load fewer constants. What changes for code that looks a model up by name is in the upgrade note of the entry that makes every app load per route.
