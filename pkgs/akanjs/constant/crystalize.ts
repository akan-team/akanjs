import {
  applyFnToArrayObjects,
  type Cls,
  dayjs,
  type GetStateObject,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import { ConstantRegistry } from "./constantRegistry";
import type { FieldProps } from "./fieldInfo";

export type CrystalizeFunc<Model> = (self: GetStateObject<Model>, isChild?: boolean) => Model;
export type Converter = (value: unknown) => unknown;

// Relation instances built in the current pass, by class then id. Sharing is safe because a constant model is
// `[immerable]`; module-scoped because a model constructor cannot carry it, and a pass is wholly synchronous.
let sharedInstances: Map<Cls, Map<string, object>> | null = null;

/** Runs one hydration pass, sharing a relation instance across every value in it that names the same id. */
export const withSharedInstances = <T>(hydrate: () => T): T => {
  if (sharedInstances) return hydrate();
  sharedInstances = new Map();
  try {
    return hydrate();
  } finally {
    sharedInstances = null;
  }
};

type ModelCls = new (obj?: object) => object;

const relationIdOf = (value: object): string | null => {
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
};

const modelConverterOf = (props: FieldProps): Converter => {
  const modelRef = props.modelRef as unknown as ModelCls;
  // Already an instance (a shared relation, or a model handed to `set()`): a copy would only equal it.
  if (props.isScalar) return (value) => (value instanceof modelRef ? value : new modelRef(value as object));
  return (value) => {
    if (value instanceof modelRef) return value;
    // Only a relation's `id` is a document identity; an embedded scalar's `id` names whatever the scalar wanted.
    const id = relationIdOf(value as object);
    if (!sharedInstances || !id) return new modelRef(value as object);
    const byId = sharedInstances.get(modelRef as unknown as Cls) ?? new Map<string, object>();
    if (!sharedInstances.has(modelRef as unknown as Cls)) sharedInstances.set(modelRef as unknown as Cls, byId);
    const shared = byId.get(id) ?? new modelRef(value as object);
    byId.set(id, shared);
    return shared;
  };
};

const mapConverterOf = (props: FieldProps): Converter => {
  const of = props.of as Cls | undefined;
  const valueConverter: Converter = of
    ? singleConverterOf({
        ...props,
        modelRef: of as FieldProps["modelRef"],
        isMap: false,
        isClass: !PrimitiveRegistry.has(of),
        isScalar: PrimitiveRegistry.has(of) || ConstantRegistry.isScalar(of),
        isArray: false,
        arrDepth: 0,
      })
    : (value) => value;
  return (value) => {
    // An already-crystalized value arrives as a Map, whose entries are not own enumerable keys.
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as Record<string, unknown>);
    return new Map(
      entries.map(([key, val]: [string, unknown]) => [key, applyFnToArrayObjects(val, valueConverter as never)]),
    );
  };
};

const singleConverterOf = (props: FieldProps): Converter => {
  if (props.isMap) return mapConverterOf(props);
  if (props.isClass) return modelConverterOf(props);
  // A date inside an array or a map has no slot to be lazy in, so it is a dayjs from the start.
  if ((props.modelRef as unknown) === Date) return (value) => dayjs(value as Date);
  if (PrimitiveRegistry.has(props.modelRef as Cls))
    return (value) => (props.modelRef as unknown as typeof PrimitiveScalar)._parse(value as never);
  return (value) => value;
};

const converters = new WeakMap<FieldProps, Converter>();

/** The converter for one field, compiled once per `FieldProps` — which `getProps()` freezes and shares per field. */
export const converterOf = (props: FieldProps): Converter => {
  const cached = converters.get(props);
  if (cached) return cached;
  const single = singleConverterOf(props);
  let convert: Converter = (value) => (value === null || value === undefined ? value : single(value));
  for (let depth = props.arrDepth; depth > 0; depth--) {
    const inner: Converter = convert;
    convert = (value: unknown): unknown => (Array.isArray(value) ? value.map(inner) : inner(value));
  }
  converters.set(props, convert);
  return convert;
};

export const crystalize = (field: FieldProps, value: unknown): unknown => converterOf(field)(value);
