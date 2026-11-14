import { PrimitiveRegistry } from "akanjs/base";
import { ConstantRegistry, deserialize, serialize } from "akanjs/constant";
import type { SerializedArg, SerializedEndpoint, SerializedReturns, SerializedSignal } from "akanjs/signal";

interface SharedSignalRegistry {
  signal: { [key: string]: SerializedSignal };
  version: number;
}

const SHARED_SIGNAL_KEY = Symbol.for("akanjs.fetch.sharedSignalRegistry");
const globalWithSharedSignal = globalThis as typeof globalThis & { [SHARED_SIGNAL_KEY]?: SharedSignalRegistry };
export const sharedSignalRegistry: SharedSignalRegistry = globalWithSharedSignal[SHARED_SIGNAL_KEY] ?? {
  signal: {},
  version: 0,
};
globalWithSharedSignal[SHARED_SIGNAL_KEY] = sharedSignalRegistry;

export const mergeSerializedSignalInto = (
  serializedSignal: { [key: string]: SerializedSignal },
  refName: string,
  signal: SerializedSignal,
) => {
  const current = serializedSignal[refName];
  if (!current) serializedSignal[refName] = signal;
  else if (folds(current, signal))
    serializedSignal[refName] = definedOnly({
      ...merged(signal, current),
      origin: current.origin,
    });
  else serializedSignal[refName] = definedOnly(merged(current, signal));
};
//? An app's entry already merged each lib it extends, so that lib's own signal, applied after it, must not win back.
const folds = (current: SerializedSignal, signal: SerializedSignal) => {
  const origin = signal.origin ?? [];
  const folded = new Set(current.origin);
  return origin.length > 0 && folded.size > origin.length && origin.every((owner) => folded.has(owner));
};
//? A macro inlines its return as written, so a merge must not leave keys an unmerged signal does not have.
const definedOnly = (signal: SerializedSignal): SerializedSignal => {
  return Object.fromEntries(Object.entries(signal).filter(([, value]) => value !== undefined)) as SerializedSignal;
};
const merged = (current: SerializedSignal, signal: SerializedSignal): SerializedSignal => {
  return {
    ...current,
    ...signal,
    endpoint: { ...current.endpoint, ...signal.endpoint },
    slice: current.slice || signal.slice ? { ...current.slice, ...signal.slice } : undefined,
    filter:
      current.filter || signal.filter
        ? {
            filter: { ...current.filter?.filter, ...signal.filter?.filter },
            sortKeys: [...new Set([...(current.filter?.sortKeys ?? []), ...(signal.filter?.sortKeys ?? [])])],
            sorts: { ...current.filter?.sorts, ...signal.filter?.sorts },
          }
        : undefined,
    ...sliceFacts(signal.slice ? signal : current),
    origin:
      current.origin || signal.origin ? [...new Set([...(current.origin ?? []), ...(signal.origin ?? [])])] : undefined,
  };
};
// The server mounts the last module's slice whole, so a later slice's guards and verb maps never mix with a lib's.
const sliceFacts = ({
  getGuards,
  cruGuards,
  createGuards,
  updateGuards,
  removeGuards,
  mcp,
  agents,
  crud,
}: SerializedSignal) => {
  return { getGuards, cruGuards, createGuards, updateGuards, removeGuards, mcp, agents, crud };
};
export const mountedGuards = (signal: SerializedSignal, verb: "get" | "create" | "update" | "remove") => {
  if (signal.crud?.[verb] === false) return undefined;
  const guards = verb === "get" ? signal.getGuards : (signal[`${verb}Guards`] ?? signal.cruGuards);
  return guards?.some((guard) => guard !== "None") ? guards : undefined;
};
// view/edit exist exactly when the get handler does; edit also needs a write endpoint; merge wraps updateModel.
export const helpersOf = (signal: SerializedSignal) => {
  const get = !!mountedGuards(signal, "get");
  const update = !!mountedGuards(signal, "update");
  const write = update || !!mountedGuards(signal, "create") || !!mountedGuards(signal, "remove");
  return { view: get, edit: get && write, merge: update };
};
export const makeArgSerializer = (args: SerializedArg[]) => {
  const serializerMap = new Map(
    args.map((arg) => {
      const argRef = arg.modelType
        ? ConstantRegistry.getModelRef(arg.refName, arg.modelType)
        : PrimitiveRegistry.get(arg.refName);
      return [
        arg.name,
        (value: unknown) =>
          serialize(argRef, arg.arrDepth ?? 0, value, "input", {
            nullable: arg.nullable ?? arg.type === "search",
          }),
      ] as const;
    }),
  );
  return serializerMap;
};
export const refusingUndeclaredNull = <Parse extends (value: unknown, option?: { crystalize?: boolean }) => unknown>(
  key: string,
  endpoint: SerializedEndpoint,
  parse: Parse,
): Parse => {
  if (endpoint.returns.nullable) return parse;
  return ((value: unknown, option?: { crystalize?: boolean }) => {
    if (value === null || value === undefined)
      throw new Error(
        `${endpoint.type} ${key} answered ${value}, but its return is not nullable: answer a value, or declare { nullable: true } and answer null`,
      );
    return parse(value, option);
  }) as Parse;
};
export const makeReturnParser = (returns: SerializedReturns) => {
  if (returns.modelType) {
    const returnRef = ConstantRegistry.getModelRef(returns.refName, returns.modelType);
    return (value: unknown, { crystalize = true }: { crystalize?: boolean } = {}) =>
      deserialize(returnRef, returns.arrDepth ?? 0, value, {
        key: returns.refName,
        nullable: returns.nullable,
        convertFn: crystalize ? (value: unknown) => new (returnRef as new (arg: unknown) => object)(value) : undefined,
      });
  } else {
    const returnRef = PrimitiveRegistry.get(returns.refName);
    return (value: unknown, { crystalize = true }: { crystalize?: boolean } = {}) =>
      deserialize(returnRef, returns.arrDepth ?? 0, value, { key: returns.refName, nullable: returns.nullable });
  }
};
