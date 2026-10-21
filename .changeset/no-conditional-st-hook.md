---
"@akanjs/devkit": patch
---

A new lint rule, `no-conditional-st-hook`, runs on every `.tsx` under `apps/` and `libs/`. It reports an `st` hook that does not run on every render:

- The hooks it checks are `st.use.*`, `st.slice.<name>.use.*`, `st.sel`, `st.ref`, and the last step of `st.tool(…)` (`.exec` / `.card`), `st.useState(…)` (`.init`) and `st.expose(…)` (`.value`).
- It reports them on the right of `||`, `&&` or `??`, in a ternary branch, an `if` / `else` body, a `switch` case, a loop or a `catch` block, and in a callback that a component hands to a call or a JSX prop.

Biome's `useHookAtTopLevel` cannot see these hooks, because their names do not start with `use`. A skipped call shifts every later hook by one slot, and production React does not check the order. A later `useRef` then gets another hook's frozen store value, and the screen crashes with "Cannot add property current, object is not extensible".

The fix is to read each hook into its own `const` at the top of the component, then combine the values.

The rule does not report a hook after an early `return`, or one inside a local helper the component calls.

Upgrade note: `akan lint` now fails on these call sites. One common case is a hook inside `Load.Units`' `renderList`. `Load.Units` calls it only while the list is non-empty, or when `renderEmpty={false}`. Move the hook into the component that renders `Load.Units`.
