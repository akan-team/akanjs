import type { EnumInstance, GetStateObject } from "akanjs/base";
import type { FilterInfo } from ".";

export type DataInputOf<Input = any, Obj = any> = {
  [K in keyof Input as Input[K] extends (...args: any[]) => any ? never : K]: Input[K] extends any[]
    ? Input[K] | undefined
    : Input[K];
} & Partial<Obj>;

export type GetDocObject<D> = GetStateObject<Omit<D, "set" | "save" | "refresh">>;

export interface ConstantFilterMeta {
  query: { [key: string]: FilterInfo };
  sort: Record<string, unknown>;
}
export interface FilterKeyProps {
  type?: "database";
}

export interface FilterArgProps {
  nullable?: boolean;
  ref?: string;
  default?: string | number | boolean | object | null | (() => string | number | boolean | object | null);
  renderOption?: (value: never) => string;
  enum?: EnumInstance;
}

export type DocumentProjection<T> = Partial<Record<keyof T, boolean>>;

export interface ListQueryOption<Sort = never, Obj = any> {
  skip?: number | null;
  limit?: number | null;
  sort?: Sort | null;
  sample?: number;
  select?: DocumentProjection<Obj>;
}
export interface FindQueryOption<Sort = never, Obj = any> {
  skip?: number | null;
  sort?: Sort | null;
  sample?: boolean;
  select?: DocumentProjection<Obj>;
}
export type { SchemaOf } from "./documentSchema";
