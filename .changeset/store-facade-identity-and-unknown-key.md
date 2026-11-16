---
"akanjs": patch
---

`st.do.<action>` and a generated `st.do.set<Key>` stay the same function when a later store root repeats their store, so a component that holds one in an effect's dependency array no longer reruns that effect once when, for example, a lib's root and then the app's root are built. An action whose method changed, as after an edit under hot reload, is still replaced, and a later root's `static silent` still quiets an action an earlier root built.

In development (`NODE_ENV=development`, as under `akan start`), `st.use`, `st.do` and `st.slice` throw on a key no loaded store declares, naming it (`st.do.initMemo is not registered: …`), where they answered `undefined` and the call failed later with `… is not a function`. `in`, `Object.keys` and a symbol key still answer as before, and a production build and a test run are unchanged.
