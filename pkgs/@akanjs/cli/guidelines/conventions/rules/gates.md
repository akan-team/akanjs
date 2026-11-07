---
description: The akan lint gates on size, store reach, where writes start and per-item calls, and the baseline.
paths:
  - "{apps,libs}/**/*.tsx"
  - "{apps,libs}/**/*.{store,service,document}.ts"
  - "{apps,libs}/*/{ui,webkit}/**"
  - "{apps,libs}/*/akan.baseline.json"
---

# Lint Gates

- **Size, store reach, where writes start, and per-item calls fail `akan lint`** for an app or lib, each failure
  naming its rule and the `akan workflow plan …` path that fixes it:
  - `akan.size.file`: a `Zone` / `Util` / `Template` / `Unit` / `View`, a `*.store.ts`, or a `ui/` / `webkit/` file
    over 400 lines; a service or document over 500; an abstract over 300. `akan.size.component`: a component or hook
    over 250. `akan.component.store-access`: a component or hook reaching `st` more than 16 times (form setters aside).
  - `akan.write.placement`: a server write leaves the browser only through a store action, started by a module
    component — no `fetch.<mutation>` outside a `*.store.ts`, and no writing `st.do.*` in `ui/` or `webkit/`, which
    take the write as an `onX` prop or hook argument.
  - `akan.store.multi-write`, `akan.store.root-write-chain`, `akan.component.write-chain`: a store action, a store
    `static`, or one handler (a hook's included) sending two or more writes — directly, through a sibling action,
    through another store via `RootStore`, or once per item in a loop or `map`. Make them one service method
    (`this.transaction(fn)`, a side effect in `this.afterCommit(fn)`) behind one endpoint, taking the list, that the
    action calls once.
  - `akan.service.call-in-loop`: a service method an `endpoint` or `slice` reaches calling a service, a model or a
    generated query once per item (`for … of`, `map`, `forEach`); load the set once (`load<Model>Many`, one
    filter query) or write it once. An `internal` job and a counted loop (a retry, paging) are spared.
  - `akan.baseline.json` records, per rule, the debt adopted with the gate, and is compared with its copy at the
    fork point of the default branch, so it only ever shrinks: never add or raise an entry. A size, store-reach or
    per-item entry with a `reasons` line is an exception a person decided on, never an agent; the write rules take
    no exceptions.
