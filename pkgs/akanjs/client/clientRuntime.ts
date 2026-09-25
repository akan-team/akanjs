import type { SliceMeta } from "akanjs/fetch";
import type { ReactNode } from "react";
import type { TransMessageOption } from "./makePageProto";

type RuntimeTranslate = ((key: string, param?: Record<string, string | number>) => string) & {
  _: (key: string, param?: Record<string, string | number>) => string;
  rich: (key: string, param?: Record<string, string | number>) => ReactNode;
  trans: <Returns extends ReactNode>(
    translation: Record<"en" | "ko" | (string & {}), Returns>,
  ) => Returns extends string ? string : Returns;
};

type RuntimePage = {
  path: string;
  l: RuntimeTranslate;
  lang: string;
};

type RuntimeMsg = {
  info: (key: string, option?: TransMessageOption) => void;
  success: (key: string, option?: TransMessageOption) => void;
  error: (key: string, option?: TransMessageOption) => void;
  warning: (key: string, option?: TransMessageOption) => void;
  loading: (key: string, option?: TransMessageOption) => void;
};

type RuntimeErr = {
  new (key: string, data?: Record<string, unknown>, option?: Record<string, unknown>): Error;
  BadRequest?: RuntimeErr;
  Conflict?: RuntimeErr;
  Forbidden?: RuntimeErr;
  NotFound?: RuntimeErr;
  Unauthorized?: RuntimeErr;
  fromJSON?: (payload: Record<string, unknown>) => Error;
  [key: string]: unknown;
};

type RuntimeWs = {
  connected: boolean;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
};

type RuntimeFetch = typeof globalThis.fetch & {
  instance: unknown;
  origin: string;
  serializedSignal: Record<string, unknown>;
  setJwt: (jwt: string | null) => void;
  slice: Record<string, SliceMeta>;
  ws: RuntimeWs;
  [key: string]: unknown;
};

export interface ClientRuntime {
  msg: RuntimeMsg;
  Err: RuntimeErr;
  usePage: () => RuntimePage;
  fetch: RuntimeFetch;
  sig: Record<PropertyKey, unknown>;
}

const CLIENT_RUNTIME_KEY = Symbol.for("akanjs.client.runtime");

type RuntimeScope = "app" | "lib";

type RuntimeState = {
  runtime: ClientRuntime | null;
  scope: RuntimeScope | null;
};

const globalWithRuntime = globalThis as typeof globalThis & { [CLIENT_RUNTIME_KEY]?: RuntimeState };
const state = globalWithRuntime[CLIENT_RUNTIME_KEY] ?? { runtime: null, scope: null };
globalWithRuntime[CLIENT_RUNTIME_KEY] = state;

const missingRuntimeError = () =>
  new Error("Akan client runtime is not registered. Import the generated app client first.");

export const registerClientRuntime = <Runtime>(
  runtime: Runtime,
  { scope = "app" }: { scope?: RuntimeScope } = {},
): Runtime => {
  if (state.scope === "app" && scope === "lib") return runtime;
  state.runtime = runtime as ClientRuntime;
  state.scope = scope;
  return runtime;
};

export const getClientRuntime = () => {
  if (!state.runtime) throw missingRuntimeError();
  return state.runtime;
};

export const isClientRuntimeRegistered = () => state.runtime !== null;

export const msg = new Proxy({} as ClientRuntime["msg"], {
  get(_target, prop, receiver) {
    return Reflect.get(getClientRuntime().msg, prop, receiver);
  },
  set(_target, prop, value) {
    return Reflect.set(getClientRuntime().msg, prop, value);
  },
});

const ErrTarget = function AkanClientRuntimeErr(...args: ConstructorParameters<RuntimeErr>) {
  return Reflect.construct(getClientRuntime().Err, args);
} as unknown as RuntimeErr;

Object.defineProperty(ErrTarget, Symbol.hasInstance, {
  value(instance: unknown) {
    return instance instanceof getClientRuntime().Err;
  },
});

export const Err = new Proxy(ErrTarget, {
  get(_target, prop, receiver) {
    return Reflect.get(getClientRuntime().Err, prop, receiver);
  },
  construct(_target, args) {
    return Reflect.construct(getClientRuntime().Err, args);
  },
  apply(_target, _thisArg, args) {
    return Reflect.construct(getClientRuntime().Err, args);
  },
});

export const usePage: ClientRuntime["usePage"] = (...args) => getClientRuntime().usePage(...args);

export const fetch = new Proxy((...args: Parameters<typeof globalThis.fetch>) => getClientRuntime().fetch(...args), {
  get(_target, prop, receiver) {
    return Reflect.get(getClientRuntime().fetch, prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getClientRuntime().fetch, prop, value, receiver);
  },
  apply(_target, thisArg, args) {
    return Reflect.apply(getClientRuntime().fetch, thisArg, args);
  },
}) as RuntimeFetch;

export const sig = new Proxy({} as ClientRuntime["sig"], {
  get(_target, prop, receiver) {
    return Reflect.get(getClientRuntime().sig, prop, receiver);
  },
});
