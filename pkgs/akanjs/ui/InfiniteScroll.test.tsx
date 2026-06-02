import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { InfiniteScrollProps } from "./InfiniteScroll";

type Effect = () => (() => void) | undefined;

const effectQueue: Effect[] = [];
const effectCleanups: Array<() => void> = [];
let hookIndex = 0;
const hookStates: unknown[] = [];
let latestObserver: FakeIntersectionObserver | undefined;
const originalIntersectionObserver = globalThis.IntersectionObserver;

const fakeElement = { nodeType: 1, nodeName: "DIV" } as Element;

const resetHooks = () => {
  hookIndex = 0;
  hookStates.length = 0;
  effectQueue.length = 0;
};

const flushEffects = () => {
  for (const effect of effectQueue.splice(0)) {
    const cleanup = effect();
    if (cleanup) effectCleanups.push(cleanup);
  }
};

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

class FakeIntersectionObserver {
  observed: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    latestObserver = this;
  }

  observe = (element: Element) => {
    this.observed.push(element);
  };

  disconnect = () => {
    this.observed = [];
  };

  emit = (isIntersecting = true) => {
    this.callback(
      [{ isIntersecting, target: this.observed[0] ?? fakeElement } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  };
}

const assignRef = (ref: unknown) => {
  if (typeof ref === "function") {
    ref(fakeElement);
    return;
  }
  if (ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: Element | null }).current = fakeElement;
  }
};

const createElement = (type: unknown, props: Record<string, unknown> = {}) => {
  assignRef(props.ref);
  return { type, props };
};

beforeAll(() => {
  mock.module("react", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
    useEffect: (effect: Effect) => {
      effectQueue.push(effect);
    },
    useRef: <T,>(initial: T) => {
      const index = hookIndex++;
      if (!hookStates[index]) hookStates[index] = { current: initial };
      return hookStates[index] as { current: T };
    },
    useState: <T,>(initial: T) => {
      const index = hookIndex++;
      if (hookStates[index] === undefined)
        hookStates[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const setState = (next: T | ((prev: T) => T)) => {
        const prev = hookStates[index] as T;
        hookStates[index] = typeof next === "function" ? (next as (value: T) => T)(prev) : next;
      };
      return [hookStates[index] as T, setState] as const;
    },
  }));
  mock.module("react/jsx-dev-runtime", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
    jsxDEV: createElement,
  }));
  mock.module("react/jsx-runtime", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
    jsx: createElement,
    jsxs: createElement,
  }));
  mock.module("react-icons/bi", () => ({
    BiLoaderAlt: (props: Record<string, unknown>) => createElement("BiLoaderAlt", props),
  }));
});

afterEach(() => {
  for (const cleanup of effectCleanups.splice(0)) cleanup();
  latestObserver = undefined;
  resetHooks();
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: originalIntersectionObserver,
    configurable: true,
  });
});

const renderInfiniteScroll = async (props: InfiniteScrollProps) => {
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: FakeIntersectionObserver,
    configurable: true,
  });
  const { InfiniteScroll } = await import("./InfiniteScroll");
  hookIndex = 0;
  const result = InfiniteScroll(props);
  flushEffects();
  return result;
};

describe("InfiniteScroll", () => {
  test("loads the next page once when the sentinel intersects", async () => {
    const addPageCalls: number[] = [];
    const pageSelections: number[] = [];

    await renderInfiniteScroll({
      total: 30,
      currentPage: 1,
      itemsPerPage: 10,
      onAddPage: async (page) => {
        addPageCalls.push(page);
      },
      onPageSelect: (page) => {
        pageSelections.push(page);
      },
      children: "items",
    });

    expect(latestObserver?.observed).toHaveLength(1);

    latestObserver?.emit();
    await tick();

    expect(addPageCalls).toEqual([2]);
    expect(pageSelections).toEqual([2]);
  });
});
