import {
  applyFnToArrayObjects,
  type Cls,
  dayjs,
  type GetStateObject,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";

import type { FieldProps } from ".";

export type CrystalizeFunc<Model> = (self: GetStateObject<Model>, isChild?: boolean) => Model;

export const crystalize = (field: FieldProps, value: unknown): unknown => {
  if (value === undefined || value === null) return value as undefined | null;
  if (field.isArray && Array.isArray(value))
    return value.map((v: unknown) =>
      crystalize({ ...field, isArray: field.arrDepth > 1, arrDepth: field.arrDepth - 1 }, v),
    );
  const crystalizeValue = PrimitiveRegistry.has(field.modelRef)
    ? (value: unknown) => (field.modelRef as unknown as typeof PrimitiveScalar)._parse(value as never)
    : (value: unknown) => value as object;
  if (field.isMap) {
    const mapValueField = {
      ...field,
      modelRef: field.of ?? field.modelRef,
      isMap: false,
      isClass: !!field.of && !PrimitiveRegistry.has(field.of),
      isScalar: !!field.of && PrimitiveRegistry.has(field.of),
      isArray: false,
      arrDepth: 0,
    };
    // An already-crystalized value arrives as a Map, whose entries are not own enumerable keys.
    const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as Record<string, unknown>);
    return new Map(
      entries.map(([key, val]: [string, unknown]) => [
        key,
        field.of
          ? applyFnToArrayObjects(val, (v: never) => crystalize(mapValueField, v))
          : applyFnToArrayObjects(val, crystalizeValue),
      ]),
    );
  }
  if (field.isClass) return new (field.modelRef as Cls<{ set: (obj: object) => object }>)().set(value as object);
  if (field.modelRef === Date) return dayjs(value as Date);
  return crystalizeValue(value);
};
