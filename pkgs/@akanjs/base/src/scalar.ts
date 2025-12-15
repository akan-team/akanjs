import dayjsLib, { Dayjs } from "dayjs";
import type { ReadStream } from "fs";
import type { Readable } from "stream";

import type { GraphQLJSON, GraphQLUpload, Type } from "./types";

export { Dayjs };

export const dayjs = dayjsLib;
export class BaseObject {
  declare id: string;
  declare createdAt: Dayjs;
  declare updatedAt: Dayjs;
  declare removedAt: Dayjs | null;
}
export class BaseInsight {
  declare count: number;
}
export class Int {
  declare __Scalar__: "int";
}
export class Upload {
  declare __Scalar__: "upload";
  declare filename: string;
  declare mimetype: string;
  declare encoding: string;
  declare createReadStream: () => ReadStream | Readable;
}

export class Float {
  declare __Scalar__: "float";
}
export class ID {
  declare __Scalar__: "id";
}
export class JSON {
  declare __Scalar__: "json";
}
export type SingleFieldType =
  | Int
  | Float
  | StringConstructor
  | BooleanConstructor
  | ID
  | DateConstructor
  | JSON
  | Type
  | GraphQLJSON
  | GraphQLUpload;

export const getNonArrayModel = <T>(arraiedModel: T | T[]): [T, number] => {
  let arrDepth = 0;
  let target: T | T[] = arraiedModel;
  while (Array.isArray(target)) {
    target = target[0];
    arrDepth++;
  }
  return [target, arrDepth];
};
export const arraiedModel = <T = any>(modelRef: T, arrDepth = 0) => {
  let target: T | T[] | T[][] | T[][][] = modelRef;
  for (let i = 0; i < arrDepth; i++) target = [target as T];
  return target;
};
export const applyFnToArrayObjects = (arraiedData: any, fn: (arg: any) => any): any[] => {
  if (Array.isArray(arraiedData)) return arraiedData.map((data) => applyFnToArrayObjects(data, fn) as unknown);
  return fn(arraiedData) as unknown as any[];
};

export const gqlScalars = [String, Boolean, Date, ID, Int, Float, Upload, JSON, Map] as const;
export type GqlScalar = (typeof gqlScalars)[number];
export const gqlScalarNames = ["ID", "Int", "Float", "String", "Boolean", "Date", "Upload", "JSON", "Map"] as const;
export type GqlScalarName = (typeof gqlScalarNames)[number];
export const scalarSet = new Set<GqlScalar>([String, Boolean, Date, ID, Int, Float, Upload, JSON, Map]);
export const gqlScalarMap = new Map<GqlScalarName, GqlScalar>([
  ["ID", ID],
  ["Int", Int],
  ["Float", Float],
  ["String", String],
  ["Boolean", Boolean],
  ["Date", Date],
  ["Upload", Upload],
  ["JSON", JSON],
  ["Map", Map],
]);
export const scalarNameMap = new Map<GqlScalar, GqlScalarName>([
  [ID, "ID"],
  [Int, "Int"],
  [Float, "Float"],
  [String, "String"],
  [Boolean, "Boolean"],
  [Date, "Date"],
  [Upload, "Upload"],
  [JSON, "JSON"],
  [Map, "Map"],
]);
export const scalarArgMap = new Map<GqlScalar, any>([
  [ID, null],
  [String, ""],
  [Boolean, false],
  [Date, dayjs(new Date(-1))],
  [Int, 0],
  [Float, 0],
  [JSON, {}],
  [Map, {}],
]);
export const scalarDefaultMap = new Map<GqlScalar, any>([
  [ID, null],
  [String, ""],
  [Boolean, false],
  [Date, dayjs(new Date(-1))],
  [Int, 0],
  [Float, 0],
  [JSON, {}],
]);
export const isGqlClass = (modelRef: Type) => !scalarSet.has(modelRef);
export const isGqlScalar = (modelRef: Type) => scalarSet.has(modelRef);
export const isGqlMap = (modelRef: any) => modelRef === Map;
