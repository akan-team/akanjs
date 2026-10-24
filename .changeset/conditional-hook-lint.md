---
"@akanjs/devkit": patch
---

`akan lint` checks React's own hooks. Biome's `useHookAtTopLevel` runs on every `.tsx` under `apps/` and `libs/` except tests, and reports a `useState`, `useEffect` or other `use…` call behind a condition, in a loop or after an early `return`. The shared Biome config had it off, so such a call passed lint and broke the hook order only at runtime.

`no-conditional-st-hook` judges an `st` hook by the nearest function around it. An `st` hook at the top of a component defined inside `useMemo` or picked by a module-level ternary passes, as does one in a `for` loop's initializer, which runs once. The rule now also reports an `st` hook in a default value, on the right of `||=`, `&&=` or `??=`, in the arguments of an optional call such as `props.format?.(st.use.x())`, written with computed access such as `st["use"].x()`, and in a render function passed by name, such as `renderList={renderList}`.

Upgrade note: a workspace whose components call a React hook conditionally now fails `akan lint` until the hook moves to the top of the component.
