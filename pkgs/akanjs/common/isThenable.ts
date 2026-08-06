/**
 * Whether a value is awaitable. Duck-typed rather than `instanceof Promise` so a thenable produced by a
 * different realm or promise implementation still counts — a same-realm check silently misses those.
 *
 * `<Button>` uses this to decide whether a click handler is asynchronous: a handler that returns a
 * thenable gets the pending/success states, a plain one renders as an ordinary button. That makes the
 * distinction impossible to forget, unlike an explicit flag.
 */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value &&
  (typeof value === "object" || typeof value === "function") &&
  typeof Reflect.get(value, "then") === "function";
