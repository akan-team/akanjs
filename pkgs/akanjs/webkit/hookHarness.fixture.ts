import { createContext } from "react";

export const hooks = {
  index: 0,
  states: [] as unknown[],
  memos: [] as Array<{ deps: unknown[]; value: unknown }>,
  cleanups: [] as Array<() => void>,
};

export const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

export const fakeReact = (overrides: { useEffect: unknown; lazy: unknown }) => ({
  Fragment: ({ children }: { children: unknown }) => children,
  useCallback: <T>(fn: T, deps?: unknown[]) => {
    const index = hooks.index++;
    const memo = hooks.memos[index];
    if (memo && sameDeps(memo.deps, deps)) return memo.value as T;
    hooks.memos[index] = { deps: deps ?? [], value: fn };
    return fn;
  },
  useMemo: <T>(factory: () => T, deps?: unknown[]) => {
    const index = hooks.index++;
    const memo = hooks.memos[index];
    if (memo && sameDeps(memo.deps, deps)) return memo.value as T;
    const value = factory();
    hooks.memos[index] = { deps: deps ?? [], value };
    return value;
  },
  useRef: <T>(initial: T) => {
    const index = hooks.index++;
    if (!hooks.states[index]) hooks.states[index] = { current: initial };
    return hooks.states[index] as { current: T };
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (hooks.states[index] === undefined)
      hooks.states[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    const setState = (next: T | ((prev: T) => T)) => {
      const state = hooks.states[index] as T;
      const nextState = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      if (typeof state === "object" && state && typeof nextState === "object" && nextState) {
        Object.assign(state, nextState);
      } else {
        hooks.states[index] = nextState;
      }
    };
    return [hooks.states[index] as T, setState] as const;
  },
  forwardRef: (fn: unknown) => fn,
  memo: <T>(component: T) => component,
  act: async (fn: () => void | Promise<void>) => await fn(),
  ...overrides,
});

export const fakeElement = (tagName = "div") =>
  ({
    nodeType: 1,
    nodeName: tagName.toUpperCase(),
    tagName: tagName.toUpperCase(),
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: null,
    style: {},
    childNodes: [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    appendChild: () => undefined,
    removeChild: () => undefined,
    insertBefore: () => undefined,
    setAttribute: () => undefined,
    removeAttribute: () => undefined,
  }) as unknown as HTMLDivElement;

export const csrClientBase = () => ({
  DEFAULT_BOTTOM_INSET: 34,
  DEFAULT_TOP_INSET: 44,
  RouteDefinition: { renderArgsKey: () => "" },
  csrContext: { Provider: ({ children }: { children: unknown }) => children },
  debugFrame: () => undefined,
  pageActivityContext: createContext({ activity: "current", focused: true }),
  router: { redirectCount: () => 0 },
  usePathCtx: () => ({}),
  defaultPageState: {
    transition: "none",
    topSafeArea: 0,
    bottomSafeArea: 0,
    topInset: 0,
    bottomInset: 0,
    gesture: true,
    cache: false,
  },
});
