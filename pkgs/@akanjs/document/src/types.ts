import type { EnumInstance, GetStateObject, Type } from "@akanjs/base";
import type { Document, ProjectionType } from "mongoose";

export type DataInputOf<Input, Obj> = {
  [K in keyof Input as K extends K ? K : never]: Input[K] extends any[] ? Input[K] | undefined : Input[K];
} & Partial<Obj>;

export type GetDocObject<D> = GetStateObject<Omit<D, Exclude<keyof Document, "id"> | "__v">>;

export interface ConstantFilterMeta {
  refName: string;
  sort: { [key: string]: any };
}
export interface FilterKeyProps {
  type?: "mongo" | "meili";
}
export interface FilterKeyMeta extends FilterKeyProps {
  key: string;
  descriptor: PropertyDescriptor;
}
export interface FilterArgProps {
  nullable?: boolean;
  ref?: string;
  default?: string | number | boolean | object | null | (() => string | number | boolean | object | null);
  renderOption?: (value: any) => string;
  enum?: EnumInstance;
}
export interface FilterArgMeta extends FilterArgProps {
  name: string;
  modelRef: Type;
  arrDepth: number;
  isArray: boolean;
  optArrDepth: number;
}

export interface ListQueryOption<Sort, Obj> {
  skip?: number | null;
  limit?: number | null;
  sort?: Sort | null;
  sample?: number;
  select?: ProjectionType<Obj>;
}
export interface FindQueryOption<Sort, Obj> {
  skip?: number | null;
  sort?: Sort | null;
  sample?: boolean;
  select?: ProjectionType<Obj>;
}
