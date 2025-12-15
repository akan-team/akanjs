import { type BaseObject, Dayjs, dayjs, enumOf, type GetStateObject, Upload } from "@akanjs/base";
import type { FilterQuery, HydratedDocument } from "mongoose";

export type { FilterQuery as QueryOf };

type ObjectToId<O> = O extends BaseObject
  ? string
  : O extends BaseObject[]
    ? string[]
    : O extends Dayjs
      ? Dayjs
      : O extends { [key: string]: any }
        ? DocumentModel<O>
        : O;

type NullToUndefinedWithObjectToId<T, StateKeys extends keyof GetStateObject<T> = keyof GetStateObject<T>> = {
  [K in StateKeys as null extends T[K] ? never : K]: ObjectToId<T[K]>;
} & {
  [K in StateKeys as null extends T[K] ? K : never]?: ObjectToId<Exclude<T[K], null>> | undefined;
};
export type DocumentModel<T> = T extends (infer S)[]
  ? DocumentModel<S>[]
  : T extends string | number | boolean | Dayjs | Upload
    ? T
    : T extends Map<infer K, infer V>
      ? Map<K, DocumentModel<V>>
      : NullToUndefinedWithObjectToId<T>;

export type FieldState<T> = T extends { id: string } ? T | null : T;
export type DefaultOf<S> = { [K in keyof S]: FieldState<S[K]> };

export type GetPlainObject<T, O extends string> = Omit<
  {
    [K in keyof T as T[K] extends (...args: any) => any
      ? never
      : K extends keyof HydratedDocument<any>
        ? never
        : K]: T[K];
  },
  O
>;

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

export interface ProtoPatch {
  source: ProtoFile;
  build: ProtoFile;
  appBuild: ProtoFile | null;
  status: "active" | "expired";
  at: Dayjs;
}

export const DEFAULT_PAGE_SIZE = 20;
export interface TextDoc {
  [key: string]: string | TextDoc;
}

export type NonFunctionalKeys<T> = keyof T extends (...args: any[]) => any ? never : keyof T;

export const unsetDate = dayjs(new Date("0000"));
export const MAX_INT = 2147483647;

export class Responsive extends enumOf("responsive", ["xl", "lg", "md", "sm", "xs"] as const) {}
export const responsiveWidths = [1200, 992, 768, 576, 0] as const;
