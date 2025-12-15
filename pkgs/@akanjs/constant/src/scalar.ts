import "reflect-metadata";

import {
  EnumInstance,
  Float,
  getNonArrayModel,
  type GqlScalar,
  ID,
  Int,
  JSON,
  scalarNameMap,
  type SingleFieldType,
  type Type,
  Upload,
} from "@akanjs/base";
import { capitalize } from "@akanjs/common";
import type { AccumulatorOperator } from "mongoose";

import { constantInfo } from "./constantInfo";

export const scalarExampleMap = new Map<GqlScalar, string | number | boolean | object>([
  [ID, "1234567890abcdef12345678"],
  [Int, 0],
  [Float, 0],
  [String, "String"],
  [Boolean, true],
  [Date, new Date().toISOString()],
  [Upload, "FileUpload"],
  [JSON, {}],
  [Map, {}],
]);
export const getScalarExample = (ref: GqlScalar) => scalarExampleMap.get(ref) ?? null;
export const getGqlTypeStr = (ref: GqlScalar): string =>
  scalarNameMap.get(ref) ??
  `${constantInfo.isLight(ref) ? "Light" : ""}${capitalize(constantInfo.getRefName(ref))}${constantInfo.isInsight(ref) ? "Insight" : ""}`;

export interface ConstantClassMeta {
  refName: string;
  modelRef: any;
  type: "input" | "full" | "light" | "scalar";
  modelType: "data" | "ephemeral" | "insight";
  hasTextField: boolean;
}

export const fieldPresets = ["email", "password", "url"] as const;
export type FieldPreset = (typeof fieldPresets)[number];

export type GqlReturn<T extends SingleFieldType = SingleFieldType> = (of?: any) => T | [T] | [[T]] | Map<string, any>;
export interface ConstantFieldProps<FieldValue = any, MapValue = any, Metadata = { [key: string]: any }> {
  nullable?: boolean;
  ref?: string;
  refPath?: string;
  refType?: "child" | "parent" | "relation";
  default?: FieldValue | ((doc: { id: string }) => FieldValue);
  type?: FieldPreset;
  fieldType?: "property" | "hidden" | "resolve";
  immutable?: boolean;
  min?: number;
  max?: number;
  enum?: EnumInstance;
  select?: boolean;
  minlength?: number;
  maxlength?: number;
  accumulate?: AccumulatorOperator;
  example?: FieldValue;
  of?: MapValue; // for Map type fields
  validate?: (value: FieldValue, model: any) => boolean;
  text?: "search" | "filter";
  meta?: Metadata;
}
export type ConstantFieldMeta<FieldValue = any, MapValue = any, Metadata = { [key: string]: any }> = ConstantFieldProps<
  FieldValue,
  MapValue,
  Metadata
> & {
  nullable: boolean;
  default: any;
  fieldType: "property" | "hidden" | "resolve";
  immutable: boolean;
  select: boolean;
} & {
  key: string;
  isClass: boolean;
  isScalar: boolean;
  modelRef: Type;
  arrDepth: number;
  isArray: boolean;
  optArrDepth: number;
  isMap: boolean;
  meta: Metadata;
};
export const getFieldMetas = (modelRef: Type): ConstantFieldMeta[] => {
  const [target] = getNonArrayModel(modelRef);
  const metadataMap =
    (Reflect.getMetadata("fields", target.prototype as object) as Map<string, ConstantFieldMeta> | undefined) ??
    new Map<string, ConstantFieldMeta>();
  const keySortMap: Record<string, number> = { id: -1, createdAt: 1, updatedAt: 2, removedAt: 3 };
  return [...metadataMap.values()].sort(
    (a, b) => (keySortMap[a.key] ?? 0) - (keySortMap[b.key] ?? 0)
  ) as unknown as ConstantFieldMeta[];
};
export const isConstantModel = (modelRef: Type): boolean => {
  return Reflect.getMetadata("class", modelRef.prototype as object) !== undefined;
};
export const getFieldMetaMap = (modelRef: Type): Map<string, ConstantFieldMeta> => {
  const [target] = getNonArrayModel(modelRef);
  const metadataMap =
    (Reflect.getMetadata("fields", target.prototype as object) as Map<string, ConstantFieldMeta> | undefined) ??
    new Map<string, ConstantFieldMeta>();
  return metadataMap;
};
export const setFieldMetaMap = (modelRef: Type, metadataMap: Map<string, ConstantFieldMeta>) => {
  const [target] = getNonArrayModel(modelRef);
  Reflect.defineMetadata("fields", metadataMap, target.prototype as object);
};
export const getFieldMetaMapOnPrototype = (prototype: object): Map<string, ConstantFieldMeta> => {
  const metadataMap =
    (Reflect.getMetadata("fields", prototype) as Map<string, ConstantFieldMeta> | undefined) ??
    new Map<string, ConstantFieldMeta>();
  return metadataMap;
};
export const setFieldMetaMapOnPrototype = (prototype: object, metadataMap: Map<string, ConstantFieldMeta>) => {
  Reflect.defineMetadata("fields", metadataMap, prototype);
};
