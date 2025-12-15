/* eslint-disable @typescript-eslint/no-unsafe-return */
import { BaseObject, type MergeAllActionTypes, PromiseOrObject, Type } from "@akanjs/base";
import { type ConstantModel, type DocumentModel, getFieldMetaMap, setFieldMetaMap } from "@akanjs/constant";
import type {
  FilterQuery,
  HydratedDocument,
  Model as MongooseModel,
  PipelineStage,
  ProjectionType,
  Schema,
} from "mongoose";

import { ExtractQuery, ExtractSort, FilterInstance } from ".";
import type { DatabaseModel } from "./database";
import { ExtractLoaderInfoObject, LoaderBuilder, makeLoaderBuilder } from "./loaderInfo";

export type { FilterQuery as QueryOf };

export interface DefaultDocMtds<TDocument> {
  refresh(): Promise<this>;
  set(data: Partial<TDocument>): this;
  save(): Promise<this>;
}
type HydratedDocumentWithId<TDocument> = Omit<
  HydratedDocument<TDocument, DefaultDocMtds<TDocument>>,
  "id" | "set" | "save"
> & { id: string } & DefaultDocMtds<TDocument>;
export type Doc<M> = HydratedDocumentWithId<DocumentModel<M>>;

export type CRUDEventType = "create" | "update" | "remove";
export type SaveEventType = "save" | CRUDEventType;

interface DefaultMdlStats<
  TDocument,
  TSchema,
  _Partial extends Partial<TSchema> = Partial<TSchema>,
  _FilterQuery extends FilterQuery<TSchema> = FilterQuery<TSchema>,
  _Projection extends ProjectionType<TSchema> = ProjectionType<TSchema>,
> {
  pickOneAndWrite: (query: _FilterQuery, rawData: _Partial) => Promise<TDocument>;
  pickAndWrite: (docId: string, rawData: _Partial) => Promise<TDocument>;
  pickOne: (query: _FilterQuery, projection?: _Projection) => Promise<TDocument>;
  pickById: (docId: string | undefined, projection?: _Projection) => Promise<TDocument>;
  sample: (query: _FilterQuery, size?: number, aggregations?: PipelineStage[]) => Promise<TDocument[]>;
  sampleOne: (query: _FilterQuery, aggregations?: PipelineStage[]) => Promise<TDocument | null>;
  preSaveListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  postSaveListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  preCreateListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  postCreateListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  preUpdateListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  postUpdateListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  preRemoveListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  postRemoveListenerSet: Set<(doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>>;
  listenPre: (
    eventType: SaveEventType,
    listener: (doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>
  ) => () => void;
  listenPost: (
    eventType: SaveEventType,
    listener: (doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>
  ) => () => void;
}
export type Mdl<Doc extends HydratedDocument<any>, Raw> = MongooseModel<Raw, unknown, unknown, unknown, Doc> &
  DefaultMdlStats<Doc, DocumentModel<Raw>>;
export type SchemaOf<Mdl, Doc> = Schema<null, Mdl, Doc, undefined, null, Mdl>;
export interface BaseMiddleware {
  onSchema: (schema: SchemaOf<any, any>) => void;
}

const Model = <
  Doc,
  Filter extends FilterInstance,
  T extends string,
  Input,
  Obj,
  Full,
  Light,
  Insight,
  AddDbModels extends Type[],
  _CapitalizedT extends string,
  _Default,
  _DefaultInput,
  _DefaultState,
  _DefaultStateInput,
  _DefaultInsight,
  _PurifiedInput,
  _Doc,
  _DocInput,
  _QueryOfDoc,
  _Query = ExtractQuery<Filter>,
  _Sort = ExtractSort<Filter>,
  _DatabaseModel = DatabaseModel<T, _DocInput, Doc, Full, Insight, Filter, _CapitalizedT, _QueryOfDoc, _Query, _Sort>,
  _LoaderBuilder extends LoaderBuilder<_Doc> = LoaderBuilder<_Doc>,
>(
  docRef: Type<Doc>,
  filterRef: Type<Filter>,
  cnst: ConstantModel<
    T,
    Input,
    Obj,
    Full,
    Light,
    Insight,
    _CapitalizedT,
    _Default,
    _DefaultInput,
    _DefaultState,
    _DefaultStateInput,
    _DefaultInsight,
    _PurifiedInput,
    _Doc,
    _DocInput,
    _QueryOfDoc
  >,
  loaderBuilder: _LoaderBuilder,
  ...addMdls: AddDbModels
): Type<
  MergeAllActionTypes<AddDbModels, keyof _DatabaseModel & string> &
    _DatabaseModel &
    ExtractLoaderInfoObject<ReturnType<_LoaderBuilder>>
> => {
  class DefaultModel {}
  const loaderInfoMap = loaderBuilder(makeLoaderBuilder());
  Object.entries(loaderInfoMap).forEach(([key, loaderInfo]) => {
    loaderInfo.applyLoaderInfo(DefaultModel, key);
  });
  return DefaultModel as any;
};
export const into = Model;

export const by = <
  Model,
  AddDbModels extends Type[],
  _DocModel = Model extends BaseObject ? Doc<Model> : DocumentModel<Model>,
>(
  modelRef: Type<Model>,
  ...addRefs: AddDbModels
): Type<MergeAllActionTypes<AddDbModels, keyof _DocModel & string> & _DocModel> => {
  addRefs.forEach((addRef) => {
    AddInputOrDocument(modelRef, addRef);
  });
  return modelRef as any;
};

const AddInputOrDocument = <A, B>(
  modelRef: Type<A>,
  addRef: Type<B>
): Type<A & B extends BaseObject ? Doc<B> : DocumentModel<B>> => {
  const fieldMetaMap = getFieldMetaMap(modelRef);
  const addFieldMetas = getFieldMetaMap(addRef);
  setFieldMetaMap(modelRef, new Map([...fieldMetaMap, ...addFieldMetas]));
  return modelRef as unknown as Type<A & B extends BaseObject ? Doc<B> : DocumentModel<B>>;
};

export const beyond = <DbModel, Doc>(model: Type<DbModel>, doc: Type<Doc>) => {
  return class Middleware {
    onSchema(schema: SchemaOf<DbModel, Doc>) {
      //
    }
  };
};
