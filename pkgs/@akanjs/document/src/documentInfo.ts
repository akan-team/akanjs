import type { Type } from "@akanjs/base";
import type { HydratedDocument } from "mongoose";

import type { DatabaseModel } from "./database";
import type { BaseMiddleware } from "./dbDecorators";
import { FilterInstance, getFilterQueryMap, getFilterSortMap } from "./filterMeta";

export interface DatabaseDocumentModelInfo {
  input: Type;
  doc: Type;
  model: Type;
  filter: Type;
  middleware: Type;
}
export const documentInfo = {
  database: new Map<string, DatabaseDocumentModelInfo>(),
  scalar: new Map<string, Type>(),
  modelSets: {
    input: new Set<Type>(),
    doc: new Set<Type>(),
    model: new Set<Type>(),
    filter: new Set<Type>(),
    middleware: new Set<Type>(),
    scalar: new Set<Type>(),
  },
  modelRefNameMap: new Map<Type, string>(),
  getRefName<AllowEmpty extends boolean = false>(
    modelRef: Type,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true ? string | undefined : string {
    const refName = documentInfo.modelRefNameMap.get(modelRef);
    if (!refName && !allowEmpty) throw new Error(`No ref name for modelRef: ${modelRef}`);
    return refName as AllowEmpty extends true ? string | undefined : string;
  },
  isInput(modelRef: Type) {
    return documentInfo.modelSets.input.has(modelRef);
  },
  isDoc(modelRef: Type) {
    return documentInfo.modelSets.doc.has(modelRef);
  },
  isModel(modelRef: Type) {
    return documentInfo.modelSets.model.has(modelRef);
  },
  isMiddleware(modelRef: Type) {
    return documentInfo.modelSets.middleware.has(modelRef);
  },
  isScalar(modelRef: Type) {
    return documentInfo.modelSets.scalar.has(modelRef);
  },
  setDatabase(
    refName: string,
    { Input, Doc, Model, Middleware, Filter }: Database<any, any, any, any, any, any, any, any>
  ) {
    if (!documentInfo.database.has(refName))
      documentInfo.database.set(refName, {
        input: Input,
        doc: Doc,
        model: Model,
        middleware: Middleware,
        filter: Filter,
      });
    [Input, Doc, Model, Middleware].forEach((modelRef) => {
      documentInfo.modelRefNameMap.set(modelRef, refName);
    });
  },
  getDatabase<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true ? DatabaseDocumentModelInfo | undefined : DatabaseDocumentModelInfo {
    const info = documentInfo.database.get(refName);
    if (!info && !allowEmpty) throw new Error(`No database document model info for ${refName}`);
    return info as AllowEmpty extends true ? DatabaseDocumentModelInfo | undefined : DatabaseDocumentModelInfo;
  },
  setScalar(refName: string, Model: Type) {
    if (documentInfo.scalar.has(refName)) return;
    documentInfo.scalar.set(refName, Model);
    documentInfo.modelRefNameMap.set(Model, refName);
  },
  getScalar<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true ? Type | undefined : Type {
    const model = documentInfo.scalar.get(refName);
    if (!model && !allowEmpty) throw new Error(`No scalar model for ${refName}`);
    return model as AllowEmpty extends true ? Type | undefined : Type;
  },
  getSerializedFilter(refName: string) {
    const database = documentInfo.database.get(refName);
    if (!database) return undefined;
    const sortKeys = Object.keys(getFilterSortMap(database.filter));
    const filterQueryMap = getFilterQueryMap(database.filter);
    // TODO: Serialize filter query map
    return { filter: {}, sortKeys };
  },
};

export interface Database<
  T extends string,
  Input,
  Doc extends HydratedDocument<any>,
  Model,
  Middleware extends BaseMiddleware,
  Obj,
  Insight,
  Filter extends FilterInstance,
> {
  refName: T;
  Input: Type<Input>;
  Doc: Type<Doc>;
  Model: Type<Model>;
  Middleware: Type<Middleware>;
  Obj: Type<Obj>;
  Insight: Type<Insight>;
  Filter: Type<Filter>;
}

export const dbOf = <
  T extends string,
  Input,
  Doc extends HydratedDocument<any>,
  Model extends DatabaseModel<T, Input, any, Obj, Insight, Filter>,
  Middleware extends BaseMiddleware,
  Obj,
  Insight,
  Filter extends FilterInstance,
>(
  refName: T,
  Input: Type<Input>,
  Doc: Type<Doc>,
  Model: Type<Model>,
  Middleware: Type<Middleware>,
  Obj: Type<Obj>,
  Insight: Type<Insight>,
  Filter: Type<Filter>
): Database<T, Input, Doc, Model, Middleware, Obj, Insight, Filter> => {
  const dbInfo = { refName, Input, Doc, Model, Middleware, Obj, Insight, Filter };
  documentInfo.setDatabase(refName, dbInfo);
  return dbInfo;
};
export const scalarDbOf = <T extends string, Model>(
  refName: T,
  Model: Type<Model>
): { refName: T; Model: Type<Model> } => {
  const scalarInfo = { refName, Model };
  documentInfo.setScalar(refName, Model);
  return scalarInfo;
};
