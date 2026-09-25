import { type Dayjs, dayjs, enumOf, type GetStateObject } from "akanjs/base";

export type QueryOf<T = any> = any;

export type ConstantType = "input" | "object" | "full" | "light" | "insight" | "scalar";

type ObjectToId<O> = O extends BaseObject
  ? string
  : O extends BaseObject[]
    ? string[]
    : O extends Dayjs
      ? Dayjs
      : O extends object
        ? DocumentModel<O>
        : O;

type Docify<T, _StateKeys extends keyof GetStateObject<T> = keyof GetStateObject<T>> = {
  [K in _StateKeys as null extends T[K] ? never : K]-?: ObjectToId<NonNullable<T[K]>>;
} & {
  [K in _StateKeys as null extends T[K] ? K : never]?: ObjectToId<NonNullable<T[K]>> | undefined;
};
export type DocumentModel<T> = T extends (infer S)[]
  ? DocumentModel<S>[]
  : T extends string | number | boolean | Dayjs | File
    ? T
    : T extends Map<infer K, infer V>
      ? Map<K, DocumentModel<V>>
      : Docify<T>;

export type FieldState<T> = T extends { id: string } ? T | null : T;
export type DefaultOf<S> = GetStateObject<{ [K in keyof S]: FieldState<S[K]> }>;

export type DefaultOfSchema<Schema, RelationKey = never> = [RelationKey] extends [never]
  ? Schema
  : {
      [K in keyof Schema]: Schema[K] | (K extends RelationKey ? null : never);
    };

export type GetPlainObject<T, O extends string> = Omit<
  {
    [K in keyof T as T[K] extends (...args: never[]) => unknown
      ? never
      : K extends "set" | "save" | "refresh"
        ? never
        : K]: T[K];
  },
  O
>;

export class BaseObject {
  declare id: string;
  declare createdAt: Dayjs;
  declare updatedAt: Dayjs;
  declare removedAt: Dayjs | null;
}
export class BaseInsight {
  declare count: number;
}

// TODO: migrate this to shared
export interface ProtoFile {
  id: string;
  filename: string;
  abstractData: string | null;
  imageSize: [number, number];
  progress: number | null;
  url: string;
  size: number;
  status: string;
  createdAt: Dayjs;
  updatedAt: Dayjs;
  removedAt: Dayjs | null;
  mimetype: string;
  encoding: string;
  origin: string | null;
  lastModifiedAt: Dayjs;
}

// TODO: migrate this to shared
export interface ProtoAppInfo {
  appId: string | null;
  appName: string;
  deviceId: string | null;
  platform: "ios" | "android" | null;
  major: number;
  minor: number;
  patch: number;
  branch: string;
  buildNum: string | null;
  versionOs: string | null;
  isEmulator: boolean | null;
}

// TODO: migrate this to shared
export interface ProtoPatch {
  source: ProtoFile;
  build: ProtoFile;
  appBuild: ProtoFile | null;
  status: "active" | "expired";
  at: Dayjs;
}

export const DEFAULT_PAGE_SIZE = 20;
export type NonFunctionalKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? never : K;
}[keyof T];

export const unsetDate = dayjs(new Date("0000"));
export const MAX_INT = 2147483647;

// TODO: migrate this to akanjs/client
export class Responsive extends enumOf("responsive", ["xl", "lg", "md", "sm", "xs"] as const) {}
export const responsiveWidths = [1200, 992, 768, 576, 0] as const;
