// definePlugin: the JS side of a plugin (docs/architecture.md §6).
//
// Each method call is routed to one of three places:
//   native: the host listed the method in __AKAN_NATIVE__.plugins[id].methods
//   web:    the page runs the plugin's web implementation (web platform, or the host declared "web")
//   none:   rejected with UNSUPPORTED (PL-4)
//
// The app's capabilities (PL-11) are enforced by the host for native calls. Web implementations
// run in the page, so the page applies the same ACL to them for consistent errors; that is not a
// security boundary (page code could call the browser APIs directly).

import { aclCheck, type CallScope, listenItem } from "./acl.ts";
import { AkanNativeError } from "./errors.ts";
import {
  type BridgeRequest,
  type BridgeResponse,
  type CancelReason,
  LISTEN,
  MEMBER_NAME,
  RESERVED_MEMBERS,
  UNLISTEN,
} from "./protocol.ts";
import { cancelCall, dispatchEvent, eventKey, runtime } from "./runtime.ts";

export type Implementation = "native" | "web" | "none";

type Unsubscribe = () => void;
type Emit<T> = (data: T) => void;

/** Second argument of a web implementation method: what the app's capabilities allow this call (PL-11). */
export interface WebCallContext {
  scope?: CallScope;
  /** The caller's AbortSignal: stop the work when it fires (the call has already been rejected). */
  signal?: AbortSignal;
}

/**
 * The last argument of every plugin method (bridge v1.1 `cancel`). There is no timeout option:
 * `AbortSignal.timeout(ms)` rejects with TIMEOUT, any other abort with CANCELLED, and
 * `AbortSignal.any([...])` combines them.
 */
export interface CallOptions {
  signal?: AbortSignal;
}

export interface ListenOptions {
  /** Unsubscribes when it fires. */
  signal?: AbortSignal;
  /** Unsubscribes after the first event. */
  once?: boolean;
}

export interface WebPlugin<Api, Events> {
  methods: { [K in keyof Api]?: Api[K] };
  /** Event sources. Started for the first listener, stopped after the last one leaves. */
  events?: { [E in keyof Events]?: (emit: Emit<Events[E]>) => Unsubscribe };
}

export interface PluginOptions<Api, Events> {
  methods: readonly (keyof Api & string)[];
  events?: readonly (keyof Events & string)[];
  web?: WebPlugin<Api, Events>;
}

export interface PluginHandle<Api, Events> {
  readonly id: string;
  readonly methods: readonly (keyof Api & string)[];
  readonly events: readonly (keyof Events & string)[];
  /** Where a call to this method would go on the current host. */
  implementation(method: keyof Api & string): Implementation;
  isSupported(method: keyof Api & string): boolean;
  /** Whether the app's capabilities let this window call the method (PL-11). Independent of isSupported. */
  isAllowed(method: keyof Api & string): boolean;
  eventImplementation(event: keyof Events & string): Implementation;
  /** Subscribes to an event. Safe to call and undo repeatedly (React StrictMode). */
  listen<E extends keyof Events & string>(
    event: E,
    listener: (data: Events[E]) => void,
    options?: ListenOptions,
  ): Unsubscribe;
}

/** A method with the CallOptions argument after its own (a method without arguments takes `undefined` first). */
type WithOptions<F> = F extends (...args: infer P) => infer R
  ? (...args: P extends [] ? [args: undefined, options: CallOptions] : [...P, options: CallOptions]) => R
  : never;

/**
 * Each method keeps its own signature (generics and overloads intact) and gains an overload that
 * takes CallOptions last. With options, the argument types come from the last overload.
 */
export type PluginMethods<Api> = { [K in keyof Api]: Api[K] & WithOptions<Api[K]> };

export type Plugin<Api, Events = {}> = PluginMethods<Api> & PluginHandle<Api, Events>;

const RESERVED = new Set([...RESERVED_MEMBERS, "$$typeof"]);

/** Identity helper that gives web implementations their types. */
export function defineWebPlugin<Api, Events = {}>(impl: WebPlugin<Api, Events>): WebPlugin<Api, Events> {
  return impl;
}

export function definePlugin<Api extends object, Events extends object = {}>(
  id: string,
  options: PluginOptions<Api, Events>,
): Plugin<Api, Events> {
  const web = options.web;
  const events = options.events ?? [];

  const nativeDecl = () => {
    const decl = runtime().boot.plugins[id];
    return decl && decl !== "web" ? decl : null;
  };
  const webAllowed = () => {
    const boot = runtime().boot;
    const decl = boot.plugins[id];
    return boot.platform === "web" || decl === "web" || (typeof decl === "object" && decl.web === true);
  };

  const implementation = (method: string): Implementation => {
    if (runtime().boot.platform !== "web" && nativeDecl()?.methods.includes(method)) return "native";
    if (webAllowed() && typeof (web?.methods as Record<string, unknown> | undefined)?.[method] === "function")
      return "web";
    return "none";
  };

  const eventImplementation = (event: string): Implementation => {
    if (runtime().boot.platform !== "web" && nativeDecl()?.events.includes(event)) return "native";
    if (webAllowed() && typeof (web?.events as Record<string, unknown> | undefined)?.[event] === "function")
      return "web";
    return "none";
  };

  const callNative = async (method: string, args: unknown, signal?: AbortSignal): Promise<unknown> => {
    const rt = runtime();
    const request: BridgeRequest = { v: 1, id: ++rt.nextId, plugin: id, method };
    if (args !== undefined) request.args = args;
    if (!rt.transport) throw new AkanNativeError("UNSUPPORTED", `${id}.${method}() has no host on ${rt.boot.platform}`);
    // Dev builds: where the page made the call, as the error's cause (the host's answer comes
    // back on another stack; architecture review stage 5).
    const site = rt.boot.dev ? new Error(`${id}.${method}() was called here`) : undefined;
    if (rt.boot.dev) {
      const problem = cloneProblem(args, "args");
      if (problem)
        throw new AkanNativeError("INVALID_ARGS", `${id}.${method}(): ${problem}`, { name: "DataCloneError" });
    }
    let response: BridgeResponse;
    try {
      const sent = rt.transport.send(request);
      response = signal ? await untilAborted(sent, signal, (reason) => cancelCall(rt, request.id, reason)) : await sent;
    } catch (error) {
      throw AkanNativeError.from(error);
    }
    if (response.ok) return response.result;
    throw AkanNativeError.fromBody(response.error, site);
  };

  const access = (item: string) => {
    const boot = runtime().boot;
    return aclCheck(boot.acl, id, item, boot.windowId ?? 1);
  };
  const notAllowed = (what: string) =>
    new AkanNativeError("NOT_ALLOWED", `${id}.${what} is not allowed by the app's capabilities`);

  const call = (method: string, args: unknown, options?: CallOptions): Promise<unknown> => {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));
    switch (implementation(method)) {
      case "native":
        return callNative(method, args, signal);
      case "web": {
        const granted = access(method);
        if (!granted.allowed) return Promise.reject(notAllowed(`${method}()`));
        // Call synchronously: web implementations such as <input type=file>.click()
        // need the user activation of the click that triggered this call.
        const fn = (web!.methods as Record<string, (a: unknown, ctx: WebCallContext) => unknown>)[method]!;
        const ctx: WebCallContext = {};
        if (granted.scope) ctx.scope = granted.scope;
        if (signal) ctx.signal = signal;
        try {
          const result = Promise.resolve(fn(args, ctx)).catch((error: unknown) => {
            throw AkanNativeError.from(error);
          });
          return signal ? untilAborted(result, signal) : result;
        } catch (error) {
          return Promise.reject(AkanNativeError.from(error));
        }
      }
      case "none":
        return Promise.reject(
          new AkanNativeError("UNSUPPORTED", `${id}.${method}() is not supported on ${runtime().boot.platform}`),
        );
    }
  };

  // Event sources, reference counted per event. The stop is deferred by one
  // microtask so that StrictMode's unmount/remount does not churn the host.
  const sources = new Map<string, { stop: Unsubscribe | null; stopScheduled: boolean }>();
  const nativeChain = new Map<string, Promise<unknown>>();

  const nativeSubscribe = (event: string, method: typeof LISTEN | typeof UNLISTEN) => {
    // Chain per event so $listen / $unlisten reach the host in order even over fetch.
    const previous = nativeChain.get(event) ?? Promise.resolve();
    const next = previous
      .then(() => callNative(method, { event }))
      .catch((error) => console.warn(`[akan-native] ${id}.${method}(${event}) failed`, error));
    nativeChain.set(event, next);
  };

  const startSource = (event: string): Unsubscribe | null => {
    switch (eventImplementation(event)) {
      case "native":
        nativeSubscribe(event, LISTEN);
        return () => nativeSubscribe(event, UNLISTEN);
      case "web": {
        if (!access(listenItem(event)).allowed) {
          console.warn(`[akan-native] ${notAllowed(`${event} events`).message}`);
          return null;
        }
        const start = (web!.events as Record<string, (emit: Emit<unknown>) => Unsubscribe>)[event]!;
        try {
          return start((data) => dispatchEvent(runtime(), id, event, data));
        } catch (error) {
          console.error(`[akan-native] starting web event ${id}.${event} failed`, error);
          return null;
        }
      }
      case "none":
        return null;
    }
  };

  const listen = (event: string, listener: (data: never) => void, options?: ListenOptions): Unsubscribe => {
    const signal = options?.signal;
    if (signal?.aborted) return () => {};
    const rt = runtime();
    const key = eventKey(id, event);
    let set = rt.listeners.get(key);
    if (!set) {
      set = new Set();
      rt.listeners.set(key, set);
    }
    const entry = (data: unknown) => {
      if (options?.once) unsubscribe();
      (listener as (d: unknown) => void)(data);
    };
    set.add(entry);

    const source = sources.get(event);
    if (source) {
      source.stopScheduled = false; // resubscribed before the deferred stop ran
    } else {
      sources.set(event, { stop: startSource(event), stopScheduled: false });
    }

    let active = true;
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      signal?.removeEventListener("abort", unsubscribe);
      set.delete(entry);
      if (set.size > 0) return;
      const current = sources.get(event);
      if (!current) return;
      current.stopScheduled = true;
      queueMicrotask(() => {
        if (!current.stopScheduled || sources.get(event) !== current) return;
        sources.delete(event);
        current.stop?.();
      });
    };
    signal?.addEventListener("abort", unsubscribe, { once: true });
    return unsubscribe;
  };

  const handle: PluginHandle<Api, Events> = {
    id,
    methods: options.methods,
    events,
    implementation,
    isSupported: (method) => implementation(method) !== "none",
    isAllowed: (method) => access(method).allowed,
    eventImplementation,
    listen: listen as PluginHandle<Api, Events>["listen"],
  };

  const plugin: Record<string, unknown> = { ...handle };
  for (const method of options.methods) {
    if (RESERVED.has(method) || !MEMBER_NAME.test(method))
      throw new Error(`[akan-native] plugin ${id}: method name "${method}" is reserved or not a name`);
    plugin[method] = (args?: unknown, options?: CallOptions) => call(method, args, options);
  }
  return Object.freeze(plugin) as Plugin<Api, Events>;
}

/** What a signal's reason means for the host: a TimeoutError (AbortSignal.timeout) or any other abort. */
function reasonOf(reason: unknown): CancelReason {
  return (reason as { name?: unknown } | undefined)?.name === "TimeoutError" ? "timeout" : "abort";
}

/** The rejection for an aborted call: TIMEOUT for AbortSignal.timeout, else CANCELLED; the reason is the cause. */
function abortError(reason: unknown): AkanNativeError {
  if (reason instanceof AkanNativeError) return reason;
  const timeout = reasonOf(reason) === "timeout";
  const message = (reason as { message?: unknown } | undefined)?.message;
  return new AkanNativeError(
    timeout ? "TIMEOUT" : "CANCELLED",
    typeof message === "string" && message ? message : timeout ? "the call timed out" : "the call was aborted",
    { cause: reason },
  );
}

/** Settles with `work`, or rejects as soon as the signal fires (after `onAbort`, e.g. telling the host). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal, onAbort?: (reason: CancelReason) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort?.(reasonOf(signal.reason));
      reject(abortError(signal.reason));
    };
    signal.addEventListener("abort", abort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/**
 * Dev builds: why `value` would not survive the JSON trip to a native host, or null. JSON would
 * silently turn these into something else (a Date into a string, a Map into {}, NaN into null) or
 * throw (BigInt, a cycle). Plain objects, arrays, strings, finite numbers, booleans and null pass.
 */
export function cloneProblem(value: unknown, path: string, ancestors: object[] = []): string | null {
  switch (typeof value) {
    case "string":
    case "boolean":
    case "undefined":
      return null;
    case "number":
      return Number.isFinite(value) ? null : `${path} is ${value} (JSON has no such number)`;
    case "bigint":
      return `${path} is a BigInt (JSON has no such number)`;
    case "function":
    case "symbol":
      return `${path} is a ${typeof value}`;
  }
  if (value === null) return null;
  const object = value as object;
  if (ancestors.includes(object)) return `${path} refers back to itself (a cycle)`;
  const proto = Object.getPrototypeOf(object);
  if (!Array.isArray(object) && proto !== Object.prototype && proto !== null) {
    const name = (object as { constructor?: { name?: string } }).constructor?.name || "class instance";
    return `${path} is a ${name}: only plain objects, arrays, strings, numbers, booleans and null cross the bridge`;
  }
  ancestors.push(object);
  try {
    for (const [key, item] of Object.entries(object)) {
      const problem = cloneProblem(item, Array.isArray(object) ? `${path}[${key}]` : `${path}.${key}`, ancestors);
      if (problem) return problem;
    }
  } finally {
    ancestors.pop();
  }
  return null;
}
