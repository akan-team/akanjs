---
"@akanjs/devkit": minor
---

Under `clientRuntime: "route"`, a client file that names a store, a slice or an endpoint in one of the common indirect ways now loads only the modules it names, where before it kept the whole client runtime for itself and for every page reaching it. With `"all"`, nothing changes.

- **A cast hides nothing.** `(st.use as Loose).memoList()`, `const { self } = st.get() as Wide`, `!`, `satisfies` and `<T>value` are read as the name written after them. A name the runtime does not have is reported as an unknown name, a computed key stays computed, and an object handed on stays handed on. `const get = st.get` called later reads the state as `st.get()` does, and the framework's `fetch` cast to the app's is read as the app's.
- **A key asserted as a name is read as that name.** `st.slice[sliceName as "memo"]`, or `const key = name as "memoList"` followed by `const { [key]: list } = this.get()`, `this.set({ [key]: list })` or `this.pick(key)`. Asserting a key as a name tells the build the value is that name or one owned by the same module. A union of names counts as each of them.
- **A name built from a slice the function is handed.** `` st.use[`queryArgsOf${capitalize(slice.sliceName)}`] `` loads nothing of its own when `slice` is a parameter or prop typed `SliceMeta` of `akanjs/fetch` and the name is put together from its `sliceName` or `refName` with `capitalize` of `akanjs/common`, a template or `+`: the slice arrived with its model, from `fetch` or `st.slice` in a client file or from the server with the model's reference. Where a name it may stand for belongs to a module that arrival does not load, the file loads that module itself.
- **A slice written out by hand in a client file loads its model.** `{ refName: "memo", sliceName: "memoInBoard", argLength: 0 }` is read as naming `memoInBoard`; with names that are not written out the file keeps the whole runtime.
- **State handed to a function of the same file** (`MemoStore.announce(this.get())`, a `const` arrow, a function declaration or a static method) is read where that function reads it.
- **`akanjs/store/agent`.** `ScreenSettle`, `ScreenTarget`, `ScreenReader`, `ScreenFlash`, `ScreenImage`, `AgentCursor`, `AgentVisual` and `AgentPrompts` no longer keep the whole runtime; `AgentBridge`, `AgentContext`, `StoreCatalogue` and `StoreSurfaceSource`, which hold the root store, still do.
- The note of `akan quality runtime` for a read that still keeps the whole runtime now ends with what to write instead: assert the key as a name, name the endpoint, take the slice as a parameter, or read the names where the object is. The `cast` reason is gone from its output.

**Upgrading.**

A client component that builds a store or endpoint name from a slice it was handed now relies on that slice arriving with its model, and a slice parameter that is reassigned or has a default value is not read as handed. A slice a server component writes by hand, or a copy of one (`JSON.parse(JSON.stringify(slice))`), that no client file of the route names brings no model, and the read then finds nothing; before, the reading file kept the whole runtime, so it worked. `akan quality runtime` does not report this; a page that shows nothing where such a slice is read is the sign. Take the slice from `fetch`, or name the model in a client file of the route. With `"all"`, nothing to do.
