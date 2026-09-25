import type { Cls, MergeAllTypes, PromiseOrObject } from "akanjs/base";
import type { Logger } from "akanjs/common";
import type { QueryOf } from "akanjs/constant";
import type {
  CRUDEventType,
  DatabaseModel,
  DataInputOf,
  FilterInstance,
  FindQueryOption,
  GetDocObject,
  ListQueryOption,
  QueryMethodPart,
  SaveEventType,
} from "akanjs/document";

type ServiceMixinOmitKey =
  | "onInit"
  | "onDestroy"
  | "_libsOnInit"
  | "_libsOnDestroy"
  | "_preCreate"
  | "_postCreate"
  | "_preUpdate"
  | "_postUpdate"
  | "_preRemove"
  | "_postRemove"
  | "_libsPreCreate"
  | "_libsPostCreate"
  | "_libsPreUpdate"
  | "_libsPostUpdate"
  | "_libsPreRemove"
  | "_libsPostRemove";

type DatabaseQueryMethods<Query, Sort, Obj, Doc, Insight, FindQueryOption, ListQueryOption, DocQuery> = QueryMethodPart<
  Query,
  Sort,
  Obj,
  Doc,
  Insight,
  FindQueryOption,
  ListQueryOption,
  DocQuery
>;

type DocumentLike = {
  id: string;
  set: (...args: never[]) => unknown;
  save: (...args: never[]) => unknown;
};
type MixedLibServiceReturn<Value, Doc, DocObjectOfDoc> = Value extends (infer SingleValue)[]
  ? SingleValue extends DocumentLike
    ? DocObjectOfDoc extends GetDocObject<SingleValue>
      ? Doc[]
      : Value
    : Value
  : Value extends DocumentLike
    ? DocObjectOfDoc extends GetDocObject<Value>
      ? Doc
      : Value
    : Value;
type MixedLibServiceMethods<MixedLibSrv, Doc, DocObjectOfDoc> = {
  [K in keyof MixedLibSrv]: MixedLibSrv[K] extends (...args: infer Args) => Promise<infer Value>
    ? (...args: Args) => Promise<MixedLibServiceReturn<Value, Doc, DocObjectOfDoc>>
    : MixedLibSrv[K];
};

export type DbRefName<Db extends DatabaseModel> = Db["refName"];
export type DbInput<Db extends DatabaseModel> = Db["_Input"];
export type DbDoc<Db extends DatabaseModel> = Db["_Doc"];
export type DbObj<Db extends DatabaseModel> = Db["_Obj"];
export type DbModel<Db extends DatabaseModel> = Db["_Model"];
export type DbInsight<Db extends DatabaseModel> = Db["_Insight"];
export type DbFilter<Db extends DatabaseModel> = Db["_Filter"];
export type DbQuery<Db extends DatabaseModel> = Db["_Query"];
export type DbSort<Db extends DatabaseModel> = Db["_Sort"];

export type DatabaseService<
  T extends string = string,
  Input = any,
  Doc = any,
  Obj = any,
  Model = any,
  Insight = any,
  Filter extends FilterInstance = FilterInstance,
  LibSrvs extends Cls[] = [],
  _Query = Filter extends FilterInstance ? any : never,
  _Sort = Filter extends FilterInstance ? any : never,
  _CapitalizedRefName extends Capitalize<T> = Capitalize<T>,
  _DataInputOfDoc extends DataInputOf<Input, Doc> = DataInputOf<Input, Doc>,
  _QueryOfDoc extends QueryOf<Doc> = QueryOf<Doc>,
  _FindQueryOption extends FindQueryOption<_Sort, Obj> = FindQueryOption<_Sort, Obj>,
  _ListQueryOption extends ListQueryOption<_Sort, Obj> = ListQueryOption<_Sort, Obj>,
  _DocObjectOfDoc = GetDocObject<Doc>,
  _MixedLibSrv = MergeAllTypes<LibSrvs, ServiceMixinOmitKey>,
> = {
  logger: Logger;
  __databaseModel: Model;
  __get: (id: string) => Promise<Doc>;
  __load: (id?: string) => Promise<Doc | null>;
  __loadMany: (ids: string[]) => Promise<Doc[]>;
  __create: (data: _DataInputOfDoc) => Promise<Doc>;
  __update: (id: string, data: Partial<Doc>) => Promise<Doc>;
  __remove: (id: string) => Promise<Doc>;
  __list(query?: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<Doc[]>;
  __listIds(query?: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<string[]>;
  __find(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc | null>;
  __findId(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string | null>;
  __pick(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc>;
  __pickId(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string>;
  __exists(query?: _QueryOfDoc): Promise<string | null>;
  __count(query?: _QueryOfDoc): Promise<number>;
  __insight(query?: _QueryOfDoc): Promise<Insight>;
  _preCreate?(data: _DataInputOfDoc): PromiseOrObject<_DataInputOfDoc>;
  _postCreate?(doc: Doc): Promise<Doc> | Doc;
  _preUpdate?(id: string, data: Partial<Doc>): PromiseOrObject<Partial<Doc>>;
  _postUpdate?(doc: Doc): Promise<Doc> | Doc;
  _preRemove?(id: string): Promise<void> | void;
  _postRemove?(doc: Doc): Promise<Doc> | Doc;
  __libsPreCreate: (data: _DataInputOfDoc) => Promise<_DataInputOfDoc>;
  __libsPostCreate: (doc: Doc) => Promise<Doc>;
  __libsPreUpdate: (id: string, data: Partial<Doc>) => Promise<Partial<Doc>>;
  __libsPostUpdate: (doc: Doc) => Promise<Doc>;
  __libsPreRemove: (id: string) => Promise<void>;
  __libsPostRemove: (doc: Doc) => Promise<Doc>;
  listenPre: (type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) => () => void;
  listenPost: (type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) => () => void;
} & { [key in `${T}Model`]: Model } & {
  [K in `get${_CapitalizedRefName}`]: (id: string) => Promise<Doc>;
} & {
  [K in `load${_CapitalizedRefName}`]: (id?: string) => Promise<Doc | null>;
} & {
  [K in `load${_CapitalizedRefName}Many`]: (ids: string[]) => Promise<Doc[]>;
} & {
  [K in `create${_CapitalizedRefName}`]: (data: _DataInputOfDoc) => Promise<Doc>;
} & {
  [K in `update${_CapitalizedRefName}`]: (id: string, data: Partial<Doc>) => Promise<Doc>;
} & {
  [K in `remove${_CapitalizedRefName}`]: (id: string) => Promise<Doc>;
} & DatabaseQueryMethods<_Query, _Sort, Obj, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc> &
  MixedLibServiceMethods<_MixedLibSrv, Doc, _DocObjectOfDoc>;

export type DatabaseServiceForModel<Db extends DatabaseModel, LibSrvs extends Cls[] = []> = DatabaseService<
  DbRefName<Db>,
  DbInput<Db>,
  DbDoc<Db>,
  DbObj<Db>,
  DbModel<Db>,
  DbInsight<Db>,
  DbFilter<Db>,
  LibSrvs,
  DbQuery<Db>,
  DbSort<Db>
>;
