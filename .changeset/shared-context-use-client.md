---
"akanjs": patch
---

Declare `client/sharedContext.ts` a client module, fixing a boot failure in 3.0.0-alpha.58.

Under the `react-server` exports condition `react` resolves to `react.react-server.js`, which exports no
`createContext` and no stateful hook. The new helper was the one module in `client/` and `ui/` calling
`createContext` without `"use client"`, so a server component importing anything from `akanjs/client` pulled it
into the react-server graph and the app died at boot with `Export named 'createContext' not found`. Neither
typecheck nor build reports it: both resolve `react` the ordinary way.

A test now fails if any module under `client/` or `ui/` imports a react binding the react-server condition does
not provide — `createContext`, `useState`, `useEffect`, `useLayoutEffect`, `useContext`, `useRef`, `useReducer`,
`useSyncExternalStore`, `useImperativeHandle` — without declaring the directive. `useMemo`, `useCallback`,
`useId`, `createElement` and `Fragment` are provided there and stay unflagged, so a server component keeps using
them.
