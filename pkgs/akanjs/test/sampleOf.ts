import {
  Any,
  type Cls,
  FIELD_META,
  Float,
  ID,
  Int,
  PrimitiveRegistry,
  type PrimitiveScalar,
  Upload,
} from "akanjs/base";
import { randomPick } from "akanjs/common";
import type { BaseObject, ConstantCls, ConstantField, DocumentModel, FieldObject, FieldPreset } from "akanjs/constant";

import { sample } from "./sample";

const getFieldTypeExample: { [key in FieldPreset]: () => any } = {
  email: () => sample.email(),
  password: () => sample.string({ length: 8 }),
  url: () => sample.url(),
};

const scalarSampleMap = new Map<PrimitiveScalar, () => any>([
  [ID, () => sample.hash({ length: 24 })],
  [Int, () => sample.integer({ min: -10000, max: 10000 })],
  [Float, () => sample.floating({ min: -10000, max: 10000 })],
  [String, () => sample.string({ length: 100 })],
  [Boolean, () => sample.bool()],
  [Date, () => sample.dayjs()],
  [Upload, () => "FileUpload"],
  [Any, () => ({})],
]);
const getPrimitiveSample = (ref: Cls, field: ConstantField) => {
  if (field.type) {
    return getFieldTypeExample[field.type]() as string;
  } else if (typeof field.min === "number") {
    return field.min;
  } else if (typeof field.max === "number") {
    return field.max;
  } else {
    return (scalarSampleMap.get(ref)?.() ?? null) as string | null;
  }
};

const makeSample = (field: ConstantField): any => {
  if (field.default)
    return typeof field.default === "function" ? (field.default as () => object)() : (field.default as object);
  else if (field.enum) return randomPick([...field.enum.values]);
  if (PrimitiveRegistry.has(field.modelRef)) return getPrimitiveSample(field.modelRef, field);
  return Object.fromEntries(
    Object.entries(field.modelRef[FIELD_META]).map(
      ([key, fld]) => [key, fld.arrDepth ? [] : fld.isClass && !fld.isScalar ? null : makeSample(fld)] as const,
    ),
  );
};

export type SampleOf<Model> = DocumentModel<{
  [K in keyof Model as Model[K] extends BaseObject ? never : K]: NonNullable<Model[K]>;
}>;
export const sampleOf = <Model, FieldObj extends FieldObject>(
  modelRef: ConstantCls<Model, FieldObj>,
): DocumentModel<{ [K in keyof Model as Model[K] extends BaseObject ? never : K]: NonNullable<Model[K]> }> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Object.fromEntries(
    Object.entries(modelRef[FIELD_META]).map(([key, field]) => [
      key,
      field.arrDepth ? [] : field.isClass && !field.isScalar ? null : makeSample(field),
    ]),
  ) as any;
};
