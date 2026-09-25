import { type Cls, LOADER_META, type PromiseOrObject } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import type { DocumentModel, QueryOf } from "akanjs/constant";
import type { FilterCls, FilterQueryOf, FilterSortOf, SchemaOf } from ".";
import type { CacheDatabase, QueryMethodPart } from "./database";
import type { DataLoader } from "./dataLoader";
import type { DocumentQuery, DocumentUpdateInput, DocumentUpdateOptions } from "./documentQuery";
import { type LoaderBuilder, type ModelCls, makeLoaderBuilder } from "./loaderInfo";
import type { DocumentProjection } from "./types";

export type CRUDEventType = "create" | "update" | "remove";
export type SaveEventType = "save" | CRUDEventType;

interface DefaultMdlStats<
  TDocument,
  TSchema,
  _Partial extends Partial<TSchema> = Partial<TSchema>,
  _FilterQuery extends DocumentQuery<TSchema> = DocumentQuery<TSchema>,
  _Projection = DocumentProjection<TSchema>,
> {
  pickOneAndWrite: (query: _FilterQuery, rawData: _Partial) => Promise<TDocument>;
  pickAndWrite: (docId: string, rawData: _Partial) => Promise<TDocument>;
  pickOne: (query: _FilterQuery, projection?: _Projection) => Promise<TDocument>;
  pickById: (docId: string | undefined, projection?: _Projection) => Promise<TDocument>;
  sample: (query: _FilterQuery, size?: number) => Promise<TDocument[]>;
  sampleOne: (query: _FilterQuery) => Promise<TDocument | null>;
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
    listener: (doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>,
  ) => () => void;
  listenPost: (
    eventType: SaveEventType,
    listener: (doc: TDocument, type: CRUDEventType) => PromiseOrObject<void>,
  ) => () => void;
}
export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: string | null;
}
export interface BulkWriteOperation<Raw, _RawDoc = DocumentModel<Raw>, _RawQuery = DocumentQuery<_RawDoc>> {
  updateOne: {
    filter: _RawQuery;
    update: DocumentUpdateInput<_RawDoc>;
    upsert?: boolean;
  };
}
type FindManyChain<Doc> = Promise<Doc[]> & {
  sort(sort: Record<string, 1 | -1>): FindManyChain<Doc>;
  skip(skip: number): FindManyChain<Doc>;
  limit(limit: number): FindManyChain<Doc>;
  select(projection?: unknown): FindManyChain<Doc>;
};
type FindOneChain<Doc> = Promise<Doc | null> & {
  sort(sort: Record<string, 1 | -1>): FindOneChain<Doc>;
  skip(skip: number): FindOneChain<Doc>;
  select(projection?: unknown): FindOneChain<Doc>;
};
export type Mdl<
  Doc,
  Raw,
  _RawDoc = DocumentModel<Raw>,
  _RawQuery extends DocumentQuery<_RawDoc> = DocumentQuery<_RawDoc>,
  _Projection extends DocumentProjection<Raw> = DocumentProjection<Raw>,
> = DefaultMdlStats<Doc, _RawDoc, Partial<_RawDoc>, _RawQuery, _Projection> & {
  refName: string;
  new (data: Partial<_RawDoc> | Partial<Doc>): Doc;
  find(query: _RawQuery, projection?: _Projection): FindManyChain<Doc>;
  findOne(query: _RawQuery, projection?: _Projection): FindOneChain<Doc>;
  findById(id: string | undefined, projection?: _Projection): Promise<Doc | null>;
  countDocuments(query: _RawQuery): Promise<number>;
  exists(query: _RawQuery): Promise<string | null>;
  updateOne(
    query: _RawQuery,
    update: DocumentUpdateInput<_RawDoc>,
    options?: DocumentUpdateOptions,
  ): Promise<UpdateResult>;
  updateMany(query: _RawQuery, update: DocumentUpdateInput<_RawDoc>): Promise<UpdateResult>;
  deleteMany(query: _RawQuery): Promise<UpdateResult>;
  bulkWrite(operations: BulkWriteOperation<Raw, _RawDoc, _RawQuery>[]): Promise<UpdateResult>;
};

interface IntoConstantModel<T extends string, _CapitalizedRefName extends string, Raw> {
  refName: T;
  _CapitalizedRefName: _CapitalizedRefName;
  _Full: Raw;
}
type NoInferType<T> = [T][T extends unknown ? 0 : never];
type IntoModelActions<
  T extends string,
  _CapitalizedRefName extends string,
  Doc,
  Raw,
  _Query,
  _Sort,
  _QueryOfDoc = QueryOf<Doc>,
> = {
  [key in _CapitalizedRefName]: Mdl<Doc, Raw>;
} & {
  [key in `${Uncapitalize<_CapitalizedRefName>}Loader`]: DataLoader<string, Doc, string>;
} & {
  [key in `${Uncapitalize<_CapitalizedRefName>}Cache`]: CacheDatabase<T>;
} & {
  [K in `get${_CapitalizedRefName}`]: (id: string) => Promise<Doc>;
} & {
  [K in `load${_CapitalizedRefName}`]: (id?: string) => Promise<Doc | null>;
} & {
  [K in `load${_CapitalizedRefName}Many`]: (ids: string[]) => Promise<Doc[]>;
} & {
  [K in `create${_CapitalizedRefName}`]: (data: Partial<Doc>) => Promise<Doc>;
} & {
  [K in `update${_CapitalizedRefName}`]: (id: string, data: Partial<Doc>) => Promise<Doc>;
} & {
  [K in `remove${_CapitalizedRefName}`]: (id: string) => Promise<Doc>;
} & QueryMethodPart<_Query, _Sort, Raw, Doc, unknown, unknown, unknown, _QueryOfDoc>;

export const into = <
  Doc,
  FilterRef extends FilterCls,
  T extends string,
  Raw,
  AddDbModels extends ModelCls[],
  _CapitalizedRefName extends string,
  _QueryOfDoc = QueryOf<Doc>,
  _Query = FilterQueryOf<FilterRef>,
  _Sort = FilterSortOf<FilterRef>,
  _LoaderBuilder extends LoaderBuilder<NoInferType<Doc>> = LoaderBuilder<Doc>,
>(
  docRef: Cls<Doc>,
  filterRef: FilterRef,
  cnst: IntoConstantModel<T, _CapitalizedRefName, Raw>,
  loaderBuilder: _LoaderBuilder,
  ...addMdls: [...AddDbModels]
): ModelCls<
  IntoModelActions<T, _CapitalizedRefName, Doc, Raw, _Query, _Sort, _QueryOfDoc>,
  ReturnType<_LoaderBuilder>
> => {
  const loaderInfoMap = loaderBuilder(makeLoaderBuilder<Doc>());
  const libsOnSchemaFns = addMdls.map((mdl) => mdl._onSchema);
  const DefaultModel = Object.assign(class DefaultModel {}, {
    [LOADER_META]: Object.assign({}, ...addMdls.map((mdl) => mdl[LOADER_META]), loaderInfoMap),
    _onSchema(schema: SchemaOf) {
      //
    },
    _libsOnSchema(schema: SchemaOf) {
      libsOnSchemaFns.map((libsOnSchema) => libsOnSchema(schema));
    },
  });
  applyMixins(DefaultModel, addMdls);
  addMdls.forEach((mdl) => {
    Object.entries(Object.getOwnPropertyDescriptors(mdl)).forEach(([name, descriptor]) => {
      if (["length", "name", "prototype"].includes(name)) return;
      Object.defineProperty(DefaultModel, name, { ...descriptor, configurable: true });
    });
  });
  return DefaultModel as unknown as ModelCls<
    IntoModelActions<T, _CapitalizedRefName, Doc, Raw, _Query, _Sort, _QueryOfDoc>,
    ReturnType<_LoaderBuilder>
  >;
};
