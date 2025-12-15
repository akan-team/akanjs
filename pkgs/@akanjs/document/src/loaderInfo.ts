import { Type } from "@akanjs/base";
import { FilterQuery } from "mongoose";

import { Loader } from ".";

type LoaderType = "field" | "arrayField" | "query";

export class LoaderInfo<Doc, Key extends keyof Doc, QueryArg = Doc[Key]> {
  type: LoaderType;
  field: Key | Key[];
  defaultQuery: FilterQuery<unknown>;
  queryArg: QueryArg;
  constructor(type: LoaderType, field: Key | Key[], defaultQuery: FilterQuery<unknown> = {}) {
    this.type = type;
    this.field = field;
    this.defaultQuery = defaultQuery;
  }
  applyLoaderInfo(mdlRef: Type, key: string) {
    switch (this.type) {
      case "field":
        Loader.ByField(this.field as string, this.defaultQuery)(mdlRef.prototype as object, key);
        break;
      case "arrayField":
        Loader.ByArrayField(this.field as string, this.defaultQuery)(mdlRef.prototype as object, key);
        break;
      case "query":
        Loader.ByQuery(this.field as string[], this.defaultQuery)(mdlRef.prototype as object, key);
        break;
      default:
        throw new Error(`Invalid inject type: ${this.type}`);
    }
  }
}

export const makeLoaderBuilder = <Doc>() => ({
  byField: <Key extends keyof Doc & string>(fieldName: Key, defaultQuery: FilterQuery<unknown> = {}) =>
    new LoaderInfo<Doc, Key>("field", fieldName, defaultQuery),
  byArrayField: <Key extends keyof Doc & string>(fieldName: Key, defaultQuery: FilterQuery<unknown> = {}) =>
    new LoaderInfo<Doc, Key>("arrayField", fieldName, defaultQuery),
  byQuery: <Key extends keyof Doc & string>(queryKeys: readonly Key[], defaultQuery: FilterQuery<unknown> = {}) =>
    new LoaderInfo<Doc, Key, Pick<Doc, Key>>("query", queryKeys as Key[], defaultQuery),
});

export type LoaderBuilder<Doc = any> = (builder: ReturnType<typeof makeLoaderBuilder<Doc>>) => {
  [key: string]: LoaderInfo<Doc, any, any>;
};

export type ExtractLoaderInfoObject<LoaderInfoMap extends { [key: string]: LoaderInfo<any, any, any> }> = {
  [K in keyof LoaderInfoMap]: LoaderInfoMap[K] extends LoaderInfo<infer Doc, any, infer QueryArg>
    ? Loader<QueryArg, Doc>
    : never;
};
