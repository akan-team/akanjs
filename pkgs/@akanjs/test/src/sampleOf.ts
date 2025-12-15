import { BaseObject, Float, type GqlScalar, ID, Int, isGqlScalar, JSON, Type, Upload } from "@akanjs/base";
import { randomPick } from "@akanjs/common";
import { ConstantFieldMeta, DocumentModel, FieldPreset, getFieldMetas } from "@akanjs/constant";

import { sample } from "./sample";

const getFieldTypeExample: { [key in FieldPreset]: () => any } = {
  email: () => sample.email(),
  password: () => sample.string({ length: 8 }),
  url: () => sample.url(),
};

const scalarSampleMap = new Map<GqlScalar, () => any>([
  [ID, () => sample.hash({ length: 24 })],
  [Int, () => sample.integer({ min: -10000, max: 10000 })],
  [Float, () => sample.floating({ min: -10000, max: 10000 })],
  [String, () => sample.string({ length: 100 })],
  [Boolean, () => sample.bool()],
  [Date, () => sample.dayjs()],
  [Upload, () => "FileUpload"],
  [JSON, () => ({})],
]);
const getScalarSample = (ref: Type, fieldMeta: Partial<ConstantFieldMeta>) => {
  if (fieldMeta.type) {
    return getFieldTypeExample[fieldMeta.type]() as string;
  } else if (typeof fieldMeta.min === "number") {
    return fieldMeta.min;
  } else if (typeof fieldMeta.max === "number") {
    return fieldMeta.max;
  } else {
    return (scalarSampleMap.get(ref)?.() ?? null) as string | null;
  }
};

const makeSample = (fieldMeta: ConstantFieldMeta) => {
  if (fieldMeta.default)
    return typeof fieldMeta.default === "function"
      ? (fieldMeta.default as () => object)()
      : (fieldMeta.default as object);
  else if (fieldMeta.enum) return randomPick([...fieldMeta.enum.values]);
  if (isGqlScalar(fieldMeta.modelRef)) return getScalarSample(fieldMeta.modelRef, fieldMeta);
  return Object.fromEntries(
    getFieldMetas(fieldMeta.modelRef).map(
      (fieldMeta) =>
        [
          fieldMeta.key,
          fieldMeta.arrDepth ? [] : fieldMeta.isClass && !fieldMeta.isScalar ? null : makeSample(fieldMeta),
        ] as const
    )
  );
};

export type SampleOf<Model> = DocumentModel<{
  [K in keyof Model as Model[K] extends BaseObject ? never : K]: NonNullable<Model[K]>;
}>;
export const sampleOf = <Model>(
  modelRef: Type<Model>
): DocumentModel<{ [K in keyof Model as Model[K] extends BaseObject ? never : K]: NonNullable<Model[K]> }> => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return Object.fromEntries(
    getFieldMetas(modelRef).map((fieldMeta) => [
      fieldMeta.key,
      fieldMeta.arrDepth ? [] : fieldMeta.isClass && !fieldMeta.isScalar ? null : makeSample(fieldMeta),
    ])
  ) as any;
};
