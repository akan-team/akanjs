//? Pinned to `globalThis` like the trace ALS: the app bundle and the framework runtime may each load this module.
const store = globalThis as unknown as { __akanLoggedFailures?: WeakSet<object> };
store.__akanLoggedFailures ??= new WeakSet<object>();
const logged = store.__akanLoggedFailures;

export const markFailureLogged = (error: unknown): void => {
  if (typeof error === "object" && error !== null) logged.add(error);
};

export const wasFailureLogged = (error: unknown): boolean =>
  typeof error === "object" && error !== null && logged.has(error);
