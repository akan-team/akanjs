import type { MergedValues, PromiseOrObject } from "akanjs/base";
import { Logger } from "akanjs/common";
import type { DocumentModel, QueryOf } from "akanjs/constant";
import type { CacheAdaptor, CacheSetOptions } from "akanjs/service";
import type { DataLoader } from "./dataLoader";
import type { ExtractQuery, ExtractSort, FilterInstance } from "./filterMeta";
import type { CRUDEventType, Mdl, SaveEventType } from "./into";
import type { DataInputOf, FindQueryOption, ListQueryOption } from "./types";

export class CacheDatabase<T = unknown> {
  private logger: Logger;
  constructor(
    private readonly refName: string,
    private readonly cache: CacheAdaptor,
  ) {
    this.logger = new Logger(`${refName}Cache`);
  }
  async set(topic: string, key: string, value: string | number | Buffer, option: CacheSetOptions = {}) {
    await this.cache.set(this.refName, `${topic}:${key}`, value, option);
  }
  async get<T extends string | number | Buffer>(topic: string, key: string): Promise<T | undefined> {
    return await this.cache.get<T>(this.refName, `${topic}:${key}`);
  }
  async delete(topic: string, key: string) {
    await this.cache.delete(this.refName, `${topic}:${key}`);
  }
}
type QueryMethodOfKey<
  CapitalizedK extends string,
  Doc,
  Insight,
  _Args extends any[],
  _ListArgs extends any[],
  _FindArgs extends any[],
  _QueryOfDoc = QueryOf<Doc>,
> = {
  [K in `list${CapitalizedK}`]: (...args: _ListArgs) => Promise<Doc[]>;
} & {
  [K in `listIds${CapitalizedK}`]: (...args: _ListArgs) => Promise<string[]>;
} & {
  [K in `find${CapitalizedK}`]: (...args: _FindArgs) => Promise<Doc | null>;
} & {
  [K in `findId${CapitalizedK}`]: (...args: _FindArgs) => Promise<string | null>;
} & {
  [K in `pick${CapitalizedK}`]: (...args: _FindArgs) => Promise<Doc>;
} & {
  [K in `pickId${CapitalizedK}`]: (...args: _FindArgs) => Promise<string>;
} & {
  [K in `exists${CapitalizedK}`]: (...args: _Args) => Promise<string | null>;
} & {
  [K in `count${CapitalizedK}`]: (...args: _Args) => Promise<number>;
} & {
  [K in `insight${CapitalizedK}`]: (...args: _Args) => Promise<Insight>;
} & {
  [K in `query${CapitalizedK}`]: (...args: _Args) => _QueryOfDoc;
};
type QueryMethodMap<Query, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc> = {
  [K in keyof Query]: K extends string
    ? Query[K] extends (...args: infer Args) => any
      ? QueryMethodOfKey<
          Capitalize<K>,
          Doc,
          Insight,
          Args,
          [...Args, queryOption?: _ListQueryOption],
          [...Args, queryOption?: _FindQueryOption],
          _QueryOfDoc
        >
      : never
    : never;
};

export type QueryMethodPart<
  Query,
  Sort,
  Obj,
  Doc,
  Insight,
  _FindQueryOption = FindQueryOption<Sort, Obj>,
  _ListQueryOption = ListQueryOption<Sort, Obj>,
  _QueryOfDoc = QueryOf<Doc>,
> = MergedValues<QueryMethodMap<Query, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc>>;
type DatabaseModelWithQuerySort<
  T extends string,
  Input,
  Doc,
  Obj,
  Insight,
  Query,
  Sort,
  _CapitalizedRefName extends string = Capitalize<T>,
  _QueryOfDoc = QueryOf<Doc>,
  _DocumentObj = DocumentModel<Obj>,
  _DataInput = DataInputOf<Input, _DocumentObj>,
  _FindQueryOption = FindQueryOption<Sort, Obj>,
  _ListQueryOption = ListQueryOption<Sort, Obj>,
> = {
  logger: Logger;
  __model: Mdl<Doc, Obj, _DocumentObj>;
  __cache: CacheDatabase<T>;
  __loader: DataLoader<string, Doc, string>;
  __get: (id: string) => Promise<Doc>;
  __load: (id?: string) => Promise<Doc | null>;
  __loadMany: (ids: string[]) => Promise<Doc[]>;
  __create: (data: _DataInput) => Promise<Doc>;
  __update: (id: string, data: Partial<Doc>) => Promise<Doc>;
  __remove: (id: string) => Promise<Doc>;
  __list(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<Doc[]>;
  __listIds(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<string[]>;
  __find(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc | null>;
  __findId(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string | null>;
  __pick(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc>;
  __pickId(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string>;
  __exists(query: _QueryOfDoc): Promise<string | null>;
  __count(query: _QueryOfDoc): Promise<number>;
  __insight(query: _QueryOfDoc): Promise<Insight>;
  clone(data: _DataInput & { id: string }): Promise<Doc>;
  listenPre: (type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) => () => void;
  listenPost: (type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) => () => void;
} & {
  [key in _CapitalizedRefName]: Mdl<Doc, Obj, _DocumentObj>;
} & {
  [key in `${T}Loader`]: DataLoader<string, Doc, string>;
} & {
  [key in `${T}Cache`]: CacheDatabase<T>;
} & {
  [K in `get${_CapitalizedRefName}`]: (id: string) => Promise<Doc>;
} & {
  [K in `load${_CapitalizedRefName}`]: (id?: string) => Promise<Doc | null>;
} & {
  [K in `load${_CapitalizedRefName}Many`]: (ids: string[]) => Promise<Doc[]>;
} & {
  [K in `create${_CapitalizedRefName}`]: (data: _DataInput) => Promise<Doc>;
} & {
  [K in `update${_CapitalizedRefName}`]: (id: string, data: _DataInput) => Promise<Doc>;
} & {
  [K in `remove${_CapitalizedRefName}`]: (id: string) => Promise<Doc>;
} & QueryMethodPart<Query, Sort, Obj, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc>;

export type DatabaseInstanceWithQuerySort<
  T extends string = string,
  Input = any,
  Doc = any,
  Obj = any,
  Insight = any,
  Query = ExtractQuery<FilterInstance>,
  Sort = ExtractSort<FilterInstance>,
  _CapitalizedRefName extends string = Capitalize<T>,
  _QueryOfDoc = QueryOf<Doc>,
  _DocumentObj = DocumentModel<Obj>,
  _DataInput = DataInputOf<Input, _DocumentObj>,
  _FindQueryOption = FindQueryOption<Sort, Obj>,
  _ListQueryOption = ListQueryOption<Sort, Obj>,
> = DatabaseModelWithQuerySort<
  T,
  Input,
  Doc,
  Obj,
  Insight,
  Query,
  Sort,
  _CapitalizedRefName,
  _QueryOfDoc,
  _DocumentObj,
  _DataInput,
  _FindQueryOption,
  _ListQueryOption
>;

export type DatabaseInstance<
  T extends string = string,
  Input = any,
  Doc = any,
  Obj = any,
  Insight = any,
  Filter extends FilterInstance = FilterInstance,
  _CapitalizedRefName extends string = Capitalize<T>,
  _QueryOfDoc = QueryOf<Doc>,
  _Query = ExtractQuery<Filter>,
  _Sort = ExtractSort<Filter>,
  _DocumentObj = DocumentModel<Obj>,
  _DataInput = DataInputOf<Input, _DocumentObj>,
  _FindQueryOption = FindQueryOption<_Sort, Obj>,
  _ListQueryOption = ListQueryOption<_Sort, Obj>,
> = DatabaseInstanceWithQuerySort<
  T,
  Input,
  Doc,
  Obj,
  Insight,
  _Query,
  _Sort,
  _CapitalizedRefName,
  _QueryOfDoc,
  _DocumentObj,
  _DataInput,
  _FindQueryOption,
  _ListQueryOption
>;
