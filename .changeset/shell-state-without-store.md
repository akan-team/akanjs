---
"akanjs": patch
---

perf(akanjs): a page that uses no store no longer loads `akanjs/store`

The root shell (`System`), `Link`, the toasts, `Copy` and `usePageLocation` read the current path, the theme, the
toast list and the page state through `st`, so every route of every app loaded the store bundle and the agent
library inside it, about 27 KB of brotli JS, whether or not its own code touched a store. They now read a small
shell state in `akanjs/client`, and the store copies those keys to and from its own state of the same name once
it is on the page. A route none of whose chunks import `akanjs/store` drops from 202.3 KB in 36 files to 175.1 KB
in 34 (the empty page of `apps/groupedroot`).

Nothing changes for an app that uses the store: `st.use.pathname()`, `st.use.theme()`, `st.do.setTheme()`,
`st.do.showMessage()`, `msg.*` and the rest read and write as before, on the server render too, and a store that
arrives with a later page starts from what the shell holds. Its routes carry the shell state on top of the
store, about 0.6 KB. `Dialog`, `Dropdown`, `Tab`, `ScreenNavigator`, `ThemeToggle`, `KeyboardAvoiding`, `Sider`,
`Table`, `Menu` and the model, data and field components still load the store on a page that uses them.

Two things to know when upgrading:

- A test that replaces `akanjs/client` with `mock.module` and then loads `akanjs/store`, `Link`, `System`, `Copy` or
  `usePageLocation` needs `ShellState` in its mock: pass the real one through.
- `msg.*`, `Copy` and the theme a restored page gets back write the shell state, not `st.do.showMessage` and
  `st.do.setTheme`, so a store that declares an action of either name is no longer called for them.

- `ShellState` is exported from `akanjs/client`: `ShellState.use("pathname")` and its other keys (`path`, `params`,
  `searchParams`, `theme`, `uiOperation`, `messages`, `keyboardHeight`, `pageState`) read the same values as the
  `st.use.*` of the same name without loading the store.
