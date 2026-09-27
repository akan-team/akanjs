// A small observable value for hooks. React-free so it can be unit tested,
// and shaped for useSyncExternalStore (stable subscribe, cached snapshot).

export interface LiveValue<T> {
  get(): T;
  set(value: T): void;
  subscribe(onChange: () => void): () => void;
}

/**
 * `start` runs when the first subscriber arrives and may return a stop function,
 * which runs one microtask after the last subscriber leaves (StrictMode safe).
 */
export function createLiveValue<T>(
  initial: T,
  start?: (set: (value: T) => void) => (() => void) | void,
  equals: (a: T, b: T) => boolean = Object.is,
): LiveValue<T> {
  let value = initial;
  const subscribers = new Set<() => void>();
  let stop: (() => void) | null = null;
  let running = false;
  let stopScheduled = false;

  const set = (next: T) => {
    if (equals(value, next)) return;
    value = next;
    for (const fn of [...subscribers]) fn();
  };

  return {
    get: () => value,
    set,
    subscribe(onChange) {
      subscribers.add(onChange);
      stopScheduled = false;
      if (!running && start) {
        running = true;
        stop = start(set) ?? null;
      }
      return () => {
        if (!subscribers.delete(onChange) || subscribers.size > 0) return;
        stopScheduled = true;
        queueMicrotask(() => {
          if (!stopScheduled || subscribers.size > 0) return;
          stopScheduled = false;
          running = false;
          const fn = stop;
          stop = null;
          fn?.();
        });
      };
    },
  };
}

/** Shallow equality for plain state objects. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}
