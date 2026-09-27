// @ts-nocheck — `@types/react` declares its module via `export =`, which TS
// refuses to combine with wildcard re-export forms. At bundle time Bun sees
// the JS module (CJS) which does expose these named properties.
//
// We enumerate exports explicitly because Bun's `export * from "<cjs>"` only
// emits an internal `__reExport` object and never generates top-level ESM
// named bindings — so downstream chunks that `import { useState } from
// "react"` would silently get `undefined`. See the importmap dedup story
// in `vendorSpecifiers.ts` for the rationale behind these entries.
import * as m from "react";

export default m;
export const {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  ViewTransition,
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  __COMPILER_RUNTIME,
  act,
  addTransitionType,
  cache,
  cacheSignal,
  captureOwnerStack,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  unstable_useCacheRefresh,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = m;
