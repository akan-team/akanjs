# `akanjs/document`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type BaseFilterKey = BaseFilterQueryKey | BaseFilterSortKey;

export type BaseFilterQueryKey = "any";

export type BaseFilterSortKey = "latest" | "oldest" | "relevance";

export interface BulkWriteOperation<Raw, _RawDoc = DocumentModel<Raw>, _RawQuery = DocumentQuery<_RawDoc>> {
    updateOne: {
        filter: _RawQuery;
        update: DocumentUpdateInput<_RawDoc>;
        upsert?: boolean;
    };
}

export type CRUDEventType = "create" | "remove" | "update";

export declare class CacheDatabase<_T = unknown> {
    constructor(refName: string, cache: CacheAdaptor);
    set(topic: string, key: string, value: CacheValue, option?: CacheSetOptions): Promise<void>;
    get<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined>;
    delete(topic: string, key: string): Promise<void>;
    getDel<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined>;
    setIfAbsent(topic: string, key: string, value: CacheValue, option?: CacheSetOptions): Promise<boolean>;
    incr(topic: string, key: string, by?: number, option?: CacheSetOptions): Promise<number>;
    hset(topic: string, key: string, subKey: string, value: CacheValue, option?: CacheSetOptions): Promise<void>;
    hget<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined>;
    hdelete(topic: string, key: string, subKey: string): Promise<void>;
    hkeys(topic: string, key: string): Promise<string[]>;
    hentries<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<[
        string,
        T
    ][]>;
    hclear(topic: string, key: string): Promise<void>;
    hgetDel<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined>;
    hsetIfAbsent(topic: string, key: string, subKey: string, value: CacheValue, option?: CacheSetOptions): Promise<boolean>;
    hincr(topic: string, key: string, subKey: string, by?: number, option?: CacheSetOptions): Promise<number>;
}

export interface ConstantFilterMeta {
    query: {
        [key: string]: FilterInfo;
    };
    sort: Record<string, unknown>;
}

export declare const DEFAULT_FILTER_ARG_MAX_ITEMS = 1000;

export type DataInputOf<Input = any, Obj = any> = {
    [K in keyof Input as Input[K] extends (...args: any[]) => any ? never : K]: Input[K] extends any[] ? Input[K] | undefined : Input[K];
} & Partial<Obj>;

export declare class DataLoader<Key, Value, CacheKey = Key> {
    readonly name?: string;
    constructor(batchLoadFn: BatchLoadFn<Key, Value>, options?: DataLoaderOptions<Key, Value, CacheKey>);
    load(key: Key): Promise<Value>;
    loadMany(keys: readonly Key[]): Promise<Array<Error | Value>>;
    clear(key: Key): this;
    clearAll(): this;
    prime(key: Key, value: Error | Value): this;
}

export type DatabaseCls<Schema = unknown> = Cls<Schema, {
    refName: string;
    [FIELD_META]: FieldObject;
}>;

export type DatabaseInstance<T extends string = string, Input = any, Doc = any, Obj = any, Insight = any, Filter extends FilterInstance = FilterInstance, _CapitalizedRefName extends string = Capitalize<T>, _QueryOfDoc = QueryOf<Doc>, _Query = ExtractQuery<Filter>, _Sort = ExtractSort<Filter>, _DocumentObj = DocumentModel<Obj>, _DataInput = DataInputOf<Input, _DocumentObj>, _FindQueryOption = FindQueryOption<_Sort, Obj>, _ListQueryOption = ListQueryOption<_Sort, Obj>> = DatabaseInstanceWithQuerySort<T, Input, Doc, Obj, Insight, _Query, _Sort, _CapitalizedRefName, _QueryOfDoc, _DocumentObj, _DataInput, _FindQueryOption, _ListQueryOption>;

export type DatabaseInstanceOf<DatabaseRef extends DatabaseCls> = DatabaseRef extends new (...args: never[]) => infer Instance ? Instance : never;

export type DatabaseInstanceWithQuerySort<T extends string = string, Input = any, Doc = any, Obj = any, Insight = any, Query = ExtractQuery<FilterInstance>, Sort = ExtractSort<FilterInstance>, _CapitalizedRefName extends string = Capitalize<T>, _QueryOfDoc = QueryOf<Doc>, _DocumentObj = DocumentModel<Obj>, _DataInput = DataInputOf<Input, _DocumentObj>, _FindQueryOption = FindQueryOption<Sort, Obj>, _ListQueryOption = ListQueryOption<Sort, Obj>> = {
    logger: Logger;
    __model: Mdl<Doc, Obj, _DocumentObj>;
    __cache: CacheDatabase<T>;
    __loader: DataLoader<string, Doc, string>;
    __get: (id: string) => Promise<Doc>;
    __load: (id?: string) => Promise<Doc | null>;
    __loadMany: (ids: string[]) => Promise<Doc[]>;
    __create: (data: _DataInput) => Promise<Doc>;
    __createMany: (data: _DataInput[]) => Promise<Doc[]>;
    __update: (id: string, data: Partial<Doc>) => Promise<Doc>;
    __remove: (id: string) => Promise<Doc>;
    __removeMany: (query: _QueryOfDoc) => Promise<UpdateResult>;
    __removeOne: (query: _QueryOfDoc) => Promise<UpdateResult>;
    __purgeMany: (query: _QueryOfDoc) => Promise<number>;
    __updateMany: (query: _QueryOfDoc, update: DocumentUpdateInput<Doc>, options?: DocumentTouchOptions) => Promise<UpdateResult>;
    __updateOne: (query: _QueryOfDoc, update: DocumentUpdateInput<Doc>, options?: DocumentTouchOptions) => Promise<UpdateResult>;
    __list(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<Doc[]>;
    __listIds(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<string[]>;
    __find(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc | null>;
    __findId(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<null | string>;
    __pick(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc>;
    __pickId(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string>;
    __exists(query: _QueryOfDoc): Promise<null | string>;
    __count(query: _QueryOfDoc): Promise<number>;
    __insight(query: _QueryOfDoc): Promise<Insight>;
    clone(data: _DataInput & {
        id: string;
    }): Promise<Doc>;
    listenPre: (type: SaveEventType, listener: SaveEventListener<Doc>) => () => void;
    listenPost: (type: SaveEventType, listener: SaveEventListener<Doc>) => () => void;
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

export interface DatabaseModel<T extends string = string, Input = any, Doc = any, Model = any, Obj = any, Insight = any, Filter extends FilterInstance = any, _Query extends ExtractQuery<Filter> = ExtractQuery<Filter>, _Sort extends ExtractSort<Filter> = ExtractSort<Filter>> {
    refName: T;
    input: DatabaseCls<Input>;
    doc: DatabaseCls<Doc>;
    model: ModelCls<Model>;
    filter: FilterCls<Filter>;
    obj: ConstantCls<Obj>;
    insight: DatabaseCls<Insight>;
    _Input: Input;
    _Doc: Doc;
    _Model: Model;
    _Obj: Obj;
    _Insight: Insight;
    _Filter: Filter;
    _Query: _Query;
    _Sort: _Sort;
}

export declare class DatabaseRegistry {
    static isInput(modelRef: DatabaseCls): boolean;
    static isDoc(modelRef: DatabaseCls): boolean;
    static isModel(modelRef: DatabaseCls): boolean;
    static isScalar(modelRef: DatabaseCls): boolean;
    static setDatabase(refName: string, dbModel: DatabaseModel): DatabaseModel<string, any, any, any, any, any, any, ExtractQuery<any>, number | string | symbol>;
    static getDatabase<AllowEmpty extends boolean = false>(refName: string, { allowEmpty }?: {
        allowEmpty?: AllowEmpty;
    }): AllowEmpty extends true ? DatabaseModel | undefined : DatabaseModel;
    static setScalar(refName: string, Model: DatabaseCls): void;
    static getScalar<AllowEmpty extends boolean = false>(refName: string, { allowEmpty }?: {
        allowEmpty?: AllowEmpty;
    }): AllowEmpty extends true ? DatabaseCls | undefined : DatabaseCls;
    static buildModel<T extends string, Input, Doc, Model, Obj, Insight, Filter extends FilterInstance, _Query extends ExtractQuery<Filter> = ExtractQuery<Filter>, _Sort extends ExtractSort<Filter> = ExtractSort<Filter>>(refName: T, input: DatabaseCls<Input>, doc: DatabaseCls<Doc>, model: ModelCls<Model>, obj: ConstantCls<Obj>, insight: DatabaseCls<Insight>, filter: FilterCls<Filter>): DatabaseModel<T, Input, Doc, Model, Obj, Insight, Filter, _Query, _Sort>;
    static buildScalar<T extends string, Model>(refName: T, Model: DatabaseCls<Model>): DatabaseCls<Model>;
}

export interface DefaultDocMtds<TDocument> {
    refresh(): Promise<this>;
    isModified(field?: keyof TDocument & string): boolean;
    set(data: Partial<TDocument>): this;
    save(options?: DocumentTouchOptions): Promise<this>;
    toJSON(): DocumentModel<TDocument>;
    toObject(): DocumentModel<TDocument>;
}

export type Doc<M = unknown> = HydratedDocumentWithId<DocumentModel<M>>;

export type DocumentHookName = `after${Capitalize<SaveEventType>}` | `before${Capitalize<SaveEventType>}`;

export type DocumentId = string & {
    readonly __brand: "DocumentId";
};

export interface DocumentIndexBuilder<Schema> {
    path(path: string, order?: -1 | 1): DocumentIndexBuilder<Schema>;
    unique(): DocumentIndexBuilder<Schema>;
    where(where: ((q: DocumentQueryHelper) => DocumentQuery) | DocumentQuery): DocumentIndexBuilder<Schema>;
    done(): Schema;
}

export interface DocumentIndexDescriptor {
    name?: string;
    fields: Record<string, "text" | -1 | 1 | boolean>;
    unique?: boolean;
    where?: DocumentQuery;
}

export type DocumentPath<T = any> = (string & {}) | Extract<keyof T, string>;

export type DocumentPrimitive = Date | Dayjs | boolean | null | number | string;

export type DocumentProjection<T> = Partial<Record<keyof T, boolean>>;

export type DocumentQuery<T = any> = DocumentQueryNode | {
    [K in DocumentPath<T>]?: DocumentQueryValue;
};

export declare class DocumentQueryEvaluator {
    constructor(fields?: QueryFieldMap);
    static unevaluableReason(query: DocumentQuery | undefined): null | string;
    static rowViewOf({ id, createdAt, updatedAt, removedAt, ...payload }: Record<string, unknown>): DocumentRowView;
    evaluate(query: DocumentQuery | undefined, row: DocumentRowView): boolean;
    equalityConjuncts(query: DocumentQuery | undefined): EqualityConjunct[];
    static keyAt(path: string, row: DocumentRowView): null | string;
}

export type DocumentQueryHelper = ReturnType<typeof createDocumentQueryHelper>;

export type DocumentQueryNode = ({
    kind: "search";
    text: string;
} & DocumentSearchOptions) | {
    kind: "all";
    queries: DocumentQuery[];
} | {
    kind: "any";
    queries: DocumentQuery[];
} | {
    kind: "not";
    query: DocumentQuery;
} | {
    kind: "op";
    op: DocumentQueryOperator;
    value?: unknown;
} | {
    kind: "raw";
    sql: string;
    params: unknown[];
};

export type DocumentQueryOperator = (typeof documentQueryOperators)[number];

export type DocumentQueryValue = DocumentPrimitive | DocumentPrimitive[] | DocumentQueryNode | Record<string, unknown> | undefined;

export interface DocumentRowView {
    id: unknown;
    createdAt: unknown;
    updatedAt: unknown;
    removedAt: unknown;
    doc: Record<string, unknown>;
}

export type DocumentSaveHook<Doc = unknown> = (this: Doc, next?: () => void, type?: CRUDEventType, previous?: Doc) => PromiseOrObject<void>;

export declare class DocumentSchema<Doc = unknown> {
    readonly preHooks: Map<SaveEventType, DocumentSaveHook<Doc>[]>;
    readonly postHooks: Map<SaveEventType, DocumentSaveHook<Doc>[]>;
    readonly indexes: DocumentIndexDescriptor[];
    pre<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>): this;
    post<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>): this;
    removePre<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>): this;
    removePost<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>): this;
    hook(type: DocumentHookName, hook: DocumentSaveHook<Doc>): this;
    index(fields: DocumentIndexDescriptor["fields"], options?: Omit<DocumentIndexDescriptor, "fields">): this;
    createIndex(name: string): DocumentIndexBuilder<this>;
}

export interface DocumentScopeOptions {
    withRemoved?: boolean;
}

export interface DocumentSearchOptions {
    columns?: SearchColumn[];
    prefix?: boolean;
    weights?: number[];
}

export interface DocumentTouchOptions {
    touch?: boolean;
}

export type DocumentUpdate<T = any> = {
    [K in DocumentPath<T>]?: DocumentUpdateValue;
};

export type DocumentUpdateBuilder<T = any> = (helper: DocumentUpdateHelper) => DocumentUpdate<T>;

export type DocumentUpdateHelper = ReturnType<typeof createDocumentUpdateHelper>;

export type DocumentUpdateInput<T = any> = DocumentUpdate<T> | DocumentUpdateBuilder<T>;

export interface DocumentUpdateNode {
    kind: "update";
    op: DocumentUpdateOperator;
    value?: unknown;
}

export type DocumentUpdateOperator = "addToSet" | "inc" | "max" | "min" | "mul" | "pull" | "push" | "set" | "setOnInsert" | "unset";

export interface DocumentUpdateOptions extends DocumentScopeOptions, DocumentTouchOptions {
    upsert?: boolean;
}

export type DocumentUpdateValue = DocumentPrimitive | DocumentPrimitive[] | DocumentUpdateNode | Record<string, unknown> | undefined;

export interface EqualityConjunct {
    path: string;
    keys: string[];
}

export type ExtractLoaderInfoObject<LoaderInfoMap extends {
    [key: string]: LoaderInfo;
}> = {
    [K in keyof LoaderInfoMap]: LoaderInfoMap[K] extends LoaderInfo<infer Doc, any, infer QueryArg> ? Loader<QueryArg, Doc> : never;
};

export type ExtractQuery<Filter extends FilterInstance> = {
    [K in keyof Filter["query"]]: Filter["query"][K] extends FilterInfo<any, infer Args> ? (...args: Args) => QueryOf<any> : never;
};

export type ExtractSort<Filter extends FilterInstance> = keyof Filter["sort"];

export interface FilterArgInfo {
    name: string;
    argRef: ConstantFieldType;
    arrDepth: number;
    enum?: EnumInstance;
    nullable: boolean;
    ref?: string;
    maxItems: number;
}

export interface FilterArgProps {
    nullable?: boolean;
    ref?: string;
    default?: (() => boolean | null | number | object | string) | boolean | null | number | object | string;
    enum?: EnumInstance;
}

export interface FilterCls<Filter extends FilterInstance = any, Query = unknown, Sort = unknown> extends Cls<FilterDictShapeCarrier<FilterDictShape<Filter>> & {
    [key: string]: unknown;
}> {
    [FILTER_META]: Filter;
    prototype: FilterDictShapeCarrier<FilterDictShape<Filter>> & {
        [key: string]: unknown;
    };
    sortField: Set<string>;
    _Query: Query;
    _Sort: Sort;
}

export type FilterDictArgShape = {
    query: {
        [key: string]: readonly string[];
    };
    sort: {
        [key: string]: true;
    };
};

export type FilterDictShape<Filter extends FilterInstance> = {
    query: {
        [K in keyof Filter["query"]]: Filter["query"][K] extends FilterInfo<infer ArgNames, infer _Args, infer _Model> ? ArgNames : never;
    };
    sort: {
        [K in keyof Filter["sort"]]: true;
    };
};

export interface FilterDictShapeCarrier<DictShape extends FilterDictArgShape = FilterDictArgShape> {
    readonly [FILTER_DICT_SHAPE]: DictShape;
}

export declare class FilterInfo<ArgNames extends string[] = any, Args extends any[] = any, Model = any> {
    readonly argNames: ArgNames;
    readonly args: {
        name: string;
        argRef: ConstantFieldTypeInput;
        option?: ArgProps;
    }[];
    queryFn: ((...args: [
        ...Args,
        q: DocumentQueryHelper
    ]) => DocumentQuery<Model>) | null;
    constructor();
    arg<ExplicitType, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, ArgName extends string = "unknown", _FieldToValue = DocumentModel<FieldToValue<Arg>>>(name: ArgName, argRef: Arg, option?: Omit<ArgProps<_FieldToValue>, "nullable">): FilterInfo<[
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        arg: _FieldToValue
    ], Model>;
    opt<ExplicitType, Arg extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, ArgName extends string = "unknown", _FieldToValue = DocumentModel<FieldToValue<Arg>>>(name: ArgName, argRef: Arg, option?: Omit<ArgProps<_FieldToValue>, "nullable">): FilterInfo<[
        ...ArgNames,
        ArgName
    ], [
        ...Args,
        opt?: _FieldToValue | null
    ], Model>;
    query(query: (...args: [
        ...Args,
        q: DocumentQueryHelper
    ]) => DocumentQuery<Serialized<DocumentModel<Model>>>): this;
}

export type FilterInstance<Query extends {
    [key: string]: FilterInfo;
} = Record<never, never>, Sort extends {
    [key: string]: unknown;
} = Record<never, never>> = {
    query: Query;
    sort: Sort;
};

export interface FilterKeyProps {
    type?: "database";
}

export declare class FilterQueryError extends AkanError<"invalidFilter"> {
    constructor(message?: string, options?: ErrorOptions);
}

export type FilterQueryOf<FilterRef extends FilterCls> = FilterRef extends {
    _Query: infer Query;
} ? Query : never;

export type FilterSortOf<FilterRef extends FilterCls> = FilterRef extends {
    _Sort: infer Sort;
} ? Sort : never;

export interface FindQueryOption<Sort = never, Obj = any> {
    skip?: null | number;
    sort?: Sort | null;
    sample?: boolean;
    select?: DocumentProjection<Obj>;
}

export type GetDocObject<D> = GetStateObject<Omit<D, "refresh" | "save" | "set">>;

export interface ListQueryOption<Sort = never, Obj = any> {
    skip?: null | number;
    limit?: null | number;
    sort?: Sort | null;
    sample?: number;
    select?: DocumentProjection<Obj>;
}

export declare class LiveRowScope {
    static conflictOf(query: DocumentQuery | undefined, negated?: boolean): null | string;
}

export type Loader<Field, Value> = DataLoader<Field, Value | null>;

export type LoaderBuilder<Doc = any> = (builder: ReturnType<typeof makeLoaderBuilder<Doc>>) => {
    [key: string]: LoaderInfo<Doc, any, any>;
};

export declare class LoaderInfo<Doc = any, Key extends keyof Doc = keyof Doc, QueryArg = Doc[Key]> {
    type: LoaderType;
    field: Key | Key[];
    defaultQuery: QueryOf<unknown>;
    cache: boolean | number;
    queryArg: QueryArg | undefined;
    constructor(type: LoaderType, field: Key | Key[], defaultQuery?: QueryOf<unknown>, { cache }?: LoaderOption);
}

export interface LoaderOption {
    cache?: boolean | number;
}

export type Mdl<Doc, Raw, _RawDoc = DocumentModel<Raw>, _RawQuery extends DocumentQuery<_RawDoc> = DocumentQuery<_RawDoc>, _Projection extends DocumentProjection<Raw> = DocumentProjection<Raw>> = DefaultMdlStats<Doc, _RawDoc, Partial<_RawDoc>, _RawQuery, _Projection> & {
    refName: string;
    new (data: Partial<Doc> | Partial<_RawDoc>): Doc;
    find(query: _RawQuery, projection?: _Projection | null, options?: DocumentScopeOptions): FindManyChain<Doc>;
    findOne(query: _RawQuery, projection?: _Projection | null, options?: DocumentScopeOptions): FindOneChain<Doc>;
    findById(id: string | undefined, projection?: _Projection | null, options?: DocumentScopeOptions): Promise<Doc | null>;
    count(query: _RawQuery, options?: DocumentScopeOptions): Promise<number>;
    exists(query: _RawQuery, options?: DocumentScopeOptions): Promise<null | string>;
    updateOne(query: _RawQuery, update: DocumentUpdateInput<_RawDoc>, options?: DocumentUpdateOptions): Promise<UpdateResult>;
    updateMany(query: _RawQuery, update: DocumentUpdateInput<_RawDoc>, options?: DocumentScopeOptions & DocumentTouchOptions): Promise<UpdateResult>;
    removeOne(query: _RawQuery): Promise<UpdateResult>;
    removeMany(query: _RawQuery): Promise<UpdateResult>;
    purgeMany(query: _RawQuery): Promise<number>;
    updateById(id: string, update: DocumentUpdateInput<_RawDoc>, options?: DocumentUpdateOptions): Promise<UpdateResult>;
    removeById(id: string): Promise<UpdateResult>;
    upsertById(data: Partial<_RawDoc> & {
        id: string;
    }, options: {
        where: _RawQuery;
        withRemoved?: boolean;
        preserveTimestamps?: boolean;
    }): Promise<UpdateResult>;
    upsertById(data: Partial<_RawDoc> & {
        id: string;
    }, options?: {
        preserveTimestamps?: boolean;
    }): Promise<Doc>;
    bulkWrite(operations: BulkWriteOperation<Raw, _RawDoc, _RawQuery>[]): Promise<UpdateResult>;
    countDocuments(query: _RawQuery): Promise<number>;
};

export type ModelCls<Statics = Record<never, never>, LoaderMap extends {
    [key: string]: LoaderInfo;
} = Record<never, never>> = Cls<Statics & ExtractLoaderInfoObject<LoaderMap>, {
    [LOADER_META]: LoaderMap;
    _onSchema: (schema: SchemaOf<any, any>) => void;
    _libsOnSchema: (schema: SchemaOf<any, any>) => void;
}>;

export declare class NoDocumentError extends AkanError<"documentNotFound"> {
    readonly error = "base.error.documentNotFound";
    readonly lookup?: {
        readonly refName: string;
        readonly id: string;
    };
    constructor(message?: string, options?: ErrorOptions & {
        lookup?: NoDocumentError["lookup"];
    });
    get forwarded(): boolean;
    toJSON(): {
        error: string;
        statusCode: number;
    };
}

export type QueryFieldMap = Record<string, {
    getProps?: () => Record<string, unknown>;
} & Record<string, unknown>>;

export type QueryMethodPart<Query, Sort, Obj, Doc, Insight, _FindQueryOption = FindQueryOption<Sort, Obj>, _ListQueryOption = ListQueryOption<Sort, Obj>, _QueryOfDoc = QueryOf<Doc>> = MergedValues<QueryMethodMap<Query, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc>>;

export type SaveEventListener<Doc> = (doc: Doc, type: CRUDEventType, previous?: Doc) => PromiseOrObject<void>;

export type SaveEventType = "save" | CRUDEventType;

export type SchemaOf<Mdl = unknown, Doc = unknown> = DocumentSchema<Doc> & {
    readonly __model?: Mdl;
};

export type SearchColumn = (typeof searchColumns)[number];

export interface SqlFragment {
    sql: string;
    params: unknown[];
}

export interface UpdateChain<Doc = any> {
    set(update: DocumentUpdateInput<Doc>, options?: DocumentTouchOptions): Promise<UpdateResult>;
}

export interface UpdateResult {
    acknowledged: boolean;
    matchedCount: number;
    modifiedCount: number;
    upsertedId?: null | string;
}

export declare const assertFilterFitsCrud: (refName: string, queryKey: string, className: string) => void;

export declare const baseDocumentColumns: Set<string>;

export declare function by<ModelCls extends ConstantModelCls>(modelRef: ModelCls): DatabaseCls<DocModelFor<ModelCls>>;
export declare function by<ModelCls extends ConstantModelCls, AddDbModel extends DatabaseCls>(modelRef: ModelCls, addRef: AddDbModel): DatabaseCls<DocumentActionsOf<AddDbModel, DocActionOmitKeyFor<ModelCls> & string> & DocModelFor<ModelCls>>;
export declare function by<ModelCls extends ConstantModelCls, const AddDbModels extends DatabaseCls[]>(modelRef: ModelCls, ...addRefs: AddDbModels): DatabaseCls<ByInstance<ModelCls, AddDbModels>>;

export declare const convertAggregateMatch: (query: unknown) => {
    [k: string]: unknown;
};

export declare const createArrayElementLoader: <K, V>(model: LoaderModel, fieldName?: string, defaultQuery?: QueryOf<unknown>) => DataLoader<K, V, K>;

export declare const createArrayLoader: <K, V>(model: LoaderModel, fieldName?: string, defaultQuery?: QueryOf<unknown>) => DataLoader<K, V, K>;

export declare const createDocumentId: (now?: number) => DocumentId;

export declare const createDocumentQueryHelper: () => {
    all: (...queries: (DocumentQuery | false | null | undefined)[]) => DocumentQueryNode;
    any: (...queries: (DocumentQuery | false | null | undefined)[]) => DocumentQueryNode;
    not: (query: DocumentQuery) => DocumentQueryNode;
    eq: (value: unknown) => DocumentQueryNode;
    ne: (value: unknown) => DocumentQueryNode;
    oneOf: (values: readonly unknown[]) => DocumentQueryNode;
    notOneOf: (values: readonly unknown[]) => DocumentQueryNode;
    gt: (value: unknown) => DocumentQueryNode;
    gte: (value: unknown) => DocumentQueryNode;
    lt: (value: unknown) => DocumentQueryNode;
    lte: (value: unknown) => DocumentQueryNode;
    between: (from: unknown, to: unknown) => DocumentQueryNode;
    exists: (path: string) => {
        [x: string]: DocumentQueryNode;
    };
    missing: (path: string) => {
        [x: string]: DocumentQueryNode;
    };
    empty: (path: string) => {
        [x: string]: DocumentQueryNode;
    };
    has: (value: unknown) => DocumentQueryNode;
    contains: (value: unknown) => DocumentQueryNode;
    raw: (sql: string, params?: unknown[]) => DocumentQueryNode;
    search: (text: string, options?: DocumentSearchOptions) => DocumentQueryNode;
    when: (condition: unknown, query: DocumentQuery) => DocumentQuery;
};

export declare const createDocumentUpdateHelper: () => {
    set: (value: unknown) => DocumentUpdateNode;
    unset: () => DocumentUpdateNode;
    inc: (by?: number) => DocumentUpdateNode;
    mul: (by: number) => DocumentUpdateNode;
    min: (value: unknown) => DocumentUpdateNode;
    max: (value: unknown) => DocumentUpdateNode;
    push: (value: unknown) => DocumentUpdateNode;
    pull: (value: unknown) => DocumentUpdateNode;
    addToSet: (value: unknown) => DocumentUpdateNode;
    setOnInsert: (value: unknown) => DocumentUpdateNode;
};

export declare const createLoader: <Key, Value>(model: LoaderModel, fieldName?: string, defaultQuery?: QueryOf<unknown>) => DataLoader<Key, Value, Key>;

export declare const createQueryLoader: <Key, Value>(model: LoaderModel, queryKeys: string[], defaultQuery?: QueryOf<unknown>) => DataLoader<Key, Value, Key>;

export declare const documentQueryHelper: {
    all: (...queries: (DocumentQuery | false | null | undefined)[]) => DocumentQueryNode;
    any: (...queries: (DocumentQuery | false | null | undefined)[]) => DocumentQueryNode;
    not: (query: DocumentQuery) => DocumentQueryNode;
    eq: (value: unknown) => DocumentQueryNode;
    ne: (value: unknown) => DocumentQueryNode;
    oneOf: (values: readonly unknown[]) => DocumentQueryNode;
    notOneOf: (values: readonly unknown[]) => DocumentQueryNode;
    gt: (value: unknown) => DocumentQueryNode;
    gte: (value: unknown) => DocumentQueryNode;
    lt: (value: unknown) => DocumentQueryNode;
    lte: (value: unknown) => DocumentQueryNode;
    between: (from: unknown, to: unknown) => DocumentQueryNode;
    exists: (path: string) => {
        [x: string]: DocumentQueryNode;
    };
    missing: (path: string) => {
        [x: string]: DocumentQueryNode;
    };
    empty: (path: string) => {
        [x: string]: DocumentQueryNode;
    };
    has: (value: unknown) => DocumentQueryNode;
    contains: (value: unknown) => DocumentQueryNode;
    raw: (sql: string, params?: unknown[]) => DocumentQueryNode;
    search: (text: string, options?: DocumentSearchOptions) => DocumentQueryNode;
    when: (condition: unknown, query: DocumentQuery) => DocumentQuery;
};

export declare const documentUpdateHelper: {
    set: (value: unknown) => DocumentUpdateNode;
    unset: () => DocumentUpdateNode;
    inc: (by?: number) => DocumentUpdateNode;
    mul: (by: number) => DocumentUpdateNode;
    min: (value: unknown) => DocumentUpdateNode;
    max: (value: unknown) => DocumentUpdateNode;
    push: (value: unknown) => DocumentUpdateNode;
    pull: (value: unknown) => DocumentUpdateNode;
    addToSet: (value: unknown) => DocumentUpdateNode;
    setOnInsert: (value: unknown) => DocumentUpdateNode;
};

export declare const encodeDocumentValue: (value: unknown) => unknown;

export declare const fieldValueProblem: (path: string, value: unknown) => null | string;

export declare const fillMissingFilterArgs: (filterInfo: FilterInfo, args: unknown[]) => any[];

export declare const filter: () => FilterInfo<[
], [
], any>;

export declare const from: <Full extends BaseObject, BuildFilter extends (filter: () => FilterInfo<[
], [
], Full>) => FilterInstance, LibFilters extends FilterCls[], _Filter extends ReturnType<BuildFilter>, _MergedFilter extends FilterInstance = MergedFilterInstance<Full, LibFilters, _Filter>, _Query = ExtractQuery<_MergedFilter>, _Sort = ExtractSort<_MergedFilter>>(modelRef: Cls<Full>, buildFilter: BuildFilter, ...libFilterRefs: LibFilters) => FilterCls<_MergedFilter, _Query, _Sort>;

/** @deprecated */
export declare const getDefaultSchemaOptions: <_TSchema, TDocument>() => DocumentSchema<TDocument>;

/** @internal */
export declare const getFilterArgInfo: (arg: FilterInfo["args"][number]) => FilterArgInfo;

export declare const getFilterArgInfos: (filterInfo: FilterInfo) => FilterArgInfo[];

export declare const getFilterInfoByKey: <ArgNames extends string[] = [
], Args extends any[] = any[], Model = any>(modelRef: FilterCls, key: string) => FilterInfo<ArgNames, Args, Model>;

export declare const getFilterMeta: <AllowEmpty extends boolean = false>(filterRef: Cls<unknown, {
    [FILTER_META]?: ConstantFilterMeta;
}> | FilterCls, { allowEmpty }?: {
    allowEmpty?: AllowEmpty;
}) => AllowEmpty extends true ? ConstantFilterMeta | undefined : ConstantFilterMeta;

export declare const getFilterSortByKey: (modelRef: FilterCls, key: string) => unknown;

export declare const getLoaderInfos: (modelRef: ModelCls) => {
    [key: string]: LoaderInfo;
};

export declare const into: <Doc, FilterRef extends FilterCls, T extends string, Raw, Insight, AddDbModels extends ModelCls[], _CapitalizedRefName extends string, _QueryOfDoc = QueryOf<Doc>, _Query = FilterQueryOf<FilterRef>, _Sort = FilterSortOf<FilterRef>, _LoaderBuilder extends LoaderBuilder<NoInferType<Doc>> = LoaderBuilder<Doc>>(docRef: Cls<Doc>, filterRef: FilterRef, cnst: IntoConstantModel<T, _CapitalizedRefName, Raw, Insight>, loaderBuilder: _LoaderBuilder, ...addMdls: [
    ...AddDbModels
]) => ModelCls<IntoModelActions<T, _CapitalizedRefName, Doc, Raw, Insight, _Query, _Sort, _QueryOfDoc>, ReturnType<_LoaderBuilder>>;

export declare const isBuiltQueryNode: (node: object) => boolean;

export declare const isDocumentId: (value: unknown) => value is DocumentId;

export declare const isDocumentQueryNode: (value: unknown) => value is DocumentQueryNode;

export declare const isDocumentUpdateNode: (value: unknown) => value is DocumentUpdateNode;

/** @deprecated */
export declare const isFilterModel: (filterRef: Cls<unknown, {
    [FILTER_META]?: ConstantFilterMeta;
}>) => boolean;

export declare const makeLoaderBuilder: <Doc>() => {
    byField: <Key extends keyof Doc & string>(fieldName: Key, defaultQuery?: QueryOf<unknown>, option?: LoaderOption) => LoaderInfo<Doc, Key, Doc[Key]>;
    byArrayField: <Key extends keyof Doc & string>(fieldName: Key, defaultQuery?: QueryOf<unknown>, option?: LoaderOption) => LoaderInfo<Doc, Key, Doc[Key]>;
    byQuery: <Key extends keyof Doc & string>(queryKeys: readonly Key[], defaultQuery?: QueryOf<unknown>, option?: LoaderOption) => LoaderInfo<Doc, Key, Pick<Doc, Key>>;
};

export declare const queryNodeProblem: (node: DocumentQueryNode) => null | string;

export declare const queryOperatorKeys: Set<string>;

export declare const resolveDocumentUpdate: <T>(update: DocumentUpdateInput<T>) => DocumentUpdate<T>;

export declare const resolveFilterQuery: (filterRef: FilterCls, queryKey?: null | string, args?: null | unknown[]) => QueryOf<any>;

export declare const sanitizeJson: (value: unknown) => unknown;

export declare const searchColumns: readonly [
    "title",
    "desc",
    "tag",
    "filter"
];

/** @deprecated */
export declare const setFilterInfoByKey: <ArgNames extends string[] = [
], Args extends any[] = any[], Model = any>(modelRef: Cls<Model>, key: string, filterInfo: FilterInfo<ArgNames, Args, Model>) => void;

/** @internal */
export declare const setFilterMeta: (filterRef: Cls<unknown, {
    [FILTER_META]?: ConstantFilterMeta;
    sortField: Set<string>;
}>, filterMeta: ConstantFilterMeta, ...libFilterMetas: ConstantFilterMeta[]) => void;

export declare const splitFilterArgs: (filterInfo: FilterInfo, args: unknown[]) => {
    queryArgs: any[];
    queryOption: Record<string, unknown>;
};
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface ArgProps<Value = unknown> {
    nullable?: boolean;
    ref?: string;
    default?: Value;
    maxItems?: number;
}

interface BaseQuery<Model> {
    any: FilterInfo<[
    ], [
    ], Model>;
}

interface BaseSort {
    latest: {
        createdAt: -1;
    };
    oldest: {
        createdAt: 1;
    };
    relevance: Record<string, never>;
}

type BatchLoadFn<Key, Value> = (keys: readonly Key[]) => PromiseLike<ReadonlyArray<Error | Value>> | ReadonlyArray<Error | Value>;

type ByInstance<ModelCls extends ConstantModelCls, AddDbModels extends readonly DatabaseCls[], _OmitKey extends string = DocActionOmitKeyFor<ModelCls> & string, _DocModel = DocModelFor<ModelCls>> = MergeDocumentActions<AddDbModels, _OmitKey> & _DocModel;

type ChainableHydratedDocument<TDocument> = TDocument & {
    id: string;
} & ChainableHydratedMethods<TDocument>;

interface ChainableHydratedMethods<TDocument> extends Omit<DefaultDocMtds<TDocument>, "isModified" | "refresh" | "save" | "set"> {
    refresh(): Promise<this>;
    isModified(field?: keyof TDocument & string): boolean;
    set(data: Partial<TDocument>): this;
    save(options?: DocumentTouchOptions): Promise<this>;
}

type ConstantModelCls = DocumentConstantModelRef<unknown>;

interface DataLoaderOptions<Key, Value, CacheKey> {
    cache?: boolean | number;
    cacheKeyFn?: (key: Key) => CacheKey;
    copy?: (value: Value) => Value;
    batch?: boolean;
    batchScheduleFn?: (callback: () => void) => void;
    maxBatchSize?: number;
    name?: string;
}

type DatabaseSchemaFor<ModelCls extends ConstantModelCls> = DatabaseSchemaOf<ModelCls>;

type DatabaseSchemaOf<ModelCls> = ModelCls extends {
    _DatabaseSchema: infer Schema;
} ? Schema : never;

interface DefaultMdlStats<TDocument, TSchema, _Partial extends Partial<TSchema> = Partial<TSchema>, _FilterQuery extends DocumentQuery<TSchema> = DocumentQuery<TSchema>, _Projection = DocumentProjection<TSchema>> {
    pickOneAndWrite: (query: _FilterQuery, rawData: _Partial, options?: DocumentTouchOptions) => Promise<TDocument>;
    pickAndWrite: (docId: string, rawData: _Partial, options?: DocumentTouchOptions) => Promise<TDocument>;
    pickOne: (query: _FilterQuery, projection?: _Projection) => Promise<TDocument>;
    pickById: (docId: string | undefined, projection?: _Projection) => Promise<TDocument>;
    sample: (query: _FilterQuery, size?: number) => Promise<TDocument[]>;
    sampleOne: (query: _FilterQuery) => Promise<TDocument | null>;
    listenPre: (eventType: SaveEventType, listener: SaveEventListener<TDocument>) => () => void;
    listenPost: (eventType: SaveEventType, listener: SaveEventListener<TDocument>) => () => void;
}

type DocActionOmitKey<ModelCls, Schema = DatabaseSchemaOf<ModelCls>> = (IsObjectModel<ModelCls> extends true ? "id" | keyof DefaultDocMtds<unknown> : never) | (keyof Schema & string);

type DocActionOmitKeyFor<ModelCls extends ConstantModelCls> = DocActionOmitKey<ModelCls, DatabaseSchemaFor<ModelCls>>;

type DocModelFor<ModelCls extends ConstantModelCls> = DocModelOf<ModelCls, DatabaseSchemaFor<ModelCls>>;

type DocModelOf<ModelCls, Schema = DatabaseSchemaOf<ModelCls>> = IsObjectModel<ModelCls> extends true ? ChainableHydratedDocument<DocumentModel<Schema>> : DocumentModel<Schema>;

type DocumentActionsOf<AddDbModel extends DatabaseCls, OmitKey extends string> = Omit<StrictDocumentActions<DatabaseInstanceOf<AddDbModel>>, OmitKey>;

type FilterQuery<Full, LibFilters extends FilterCls[], Filter extends FilterInstance> = BaseQuery<Full> & LibFilterQuery<LibFilters> & Filter["query"];

type FilterSort<LibFilters extends FilterCls[], Filter extends FilterInstance> = BaseSort & LibFilterSort<LibFilters> & Filter["sort"];

type FindManyChain<Doc> = Promise<Doc[]> & {
    sort(sort: Record<string, -1 | 1>): FindManyChain<Doc>;
    skip(skip: number): FindManyChain<Doc>;
    limit(limit: number): FindManyChain<Doc>;
    select(projection?: unknown): FindManyChain<Doc>;
};

type FindOneChain<Doc> = Promise<Doc | null> & {
    sort(sort: Record<string, -1 | 1>): FindOneChain<Doc>;
    skip(skip: number): FindOneChain<Doc>;
    select(projection?: unknown): FindOneChain<Doc>;
};

type HydratedDocumentMethods<TDocument, Self> = Omit<DefaultDocMtds<TDocument>, "isModified" | "refresh" | "save" | "set"> & {
    refresh(): Promise<Self>;
    isModified(field?: keyof TDocument & string): boolean;
    set(data: Partial<TDocument>): Self;
    save(options?: DocumentTouchOptions): Promise<Self>;
};

type HydratedDocumentWithId<TDocument> = TDocument & {
    id: string;
} & HydratedDocumentMethods<TDocument, TDocument>;

interface IntoConstantModel<T extends string, _CapitalizedRefName extends string, Raw, Insight> {
    refName: T;
    _CapitalizedRefName: _CapitalizedRefName;
    _Full: Raw;
    _Insight: Insight;
}

type IntoModelActions<T extends string, _CapitalizedRefName extends string, Doc, Raw, Insight, _Query, _Sort, _QueryOfDoc = QueryOf<Doc>> = {
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
} & QueryMethodPart<_Query, _Sort, Raw, Doc, DocumentModel<Insight>, unknown, unknown, _QueryOfDoc>;

type IsObjectModel<ModelCls> = ModelTypeOf<ModelCls> extends ObjectDocumentModelType ? true : false;

type LibFilterQuery<LibFilters extends FilterCls[]> = MergeAllDoubleKeyOfObjects<LibFilters, typeof FILTER_META, "query">;

type LibFilterSort<LibFilters extends FilterCls[]> = MergeAllDoubleKeyOfObjects<LibFilters, typeof FILTER_META, "sort">;

type LoaderItem = Record<string, unknown>;

type LoaderModel = {
    find: (query: QueryOf<unknown>) => Promise<LoaderItem[]> | {
        then: Promise<LoaderItem[]>["then"];
    };
};

type LoaderType = "arrayField" | "field" | "query";

type MergeDocumentActions<AddDbModels extends readonly DatabaseCls[], OmitKey extends string, Acc = Record<never, never>> = AddDbModels extends readonly [
    infer First extends DatabaseCls,
    ...infer Rest extends readonly DatabaseCls[]
] ? MergeDocumentActions<Rest, OmitKey, Acc & DocumentActionsOf<First, OmitKey>> : AddDbModels extends readonly (infer AddDbModel extends DatabaseCls)[] ? Acc & DocumentActionsOf<AddDbModel, OmitKey> : Acc;

type MergedFilterInstance<Full, LibFilters extends FilterCls[], Filter extends FilterInstance> = {
    query: FilterQuery<Full, LibFilters, Filter>;
    sort: FilterSort<LibFilters, Filter>;
};

type ModelTypeOf<ModelCls> = ModelCls extends {
    _ModelType: infer ModelType;
} ? ModelType : never;

type NoInferType<T> = [
    T
][T extends unknown ? 0 : never];

type ObjectDocumentModelType = "full" | "light" | "object";

type QueryMethodMap<Query, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc> = {
    [K in keyof Query]: K extends string ? Query[K] extends (...args: infer Args) => any ? QueryMethodOfKey<Capitalize<K>, Doc, Insight, Args, [
        ...Args,
        queryOption?: _ListQueryOption
    ], [
        ...Args,
        queryOption?: _FindQueryOption
    ], _QueryOfDoc> : never : never;
};

type QueryMethodOfKey<CapitalizedK extends string, Doc, Insight, _Args extends any[], _ListArgs extends any[], _FindArgs extends any[], _QueryOfDoc = QueryOf<Doc>> = {
    [K in `list${CapitalizedK}`]: (...args: _ListArgs) => Promise<Doc[]>;
} & {
    [K in `listIds${CapitalizedK}`]: (...args: _ListArgs) => Promise<string[]>;
} & {
    [K in `find${CapitalizedK}`]: (...args: _FindArgs) => Promise<Doc | null>;
} & {
    [K in `findId${CapitalizedK}`]: (...args: _FindArgs) => Promise<null | string>;
} & {
    [K in `pick${CapitalizedK}`]: (...args: _FindArgs) => Promise<Doc>;
} & {
    [K in `pickId${CapitalizedK}`]: (...args: _FindArgs) => Promise<string>;
} & {
    [K in `exists${CapitalizedK}`]: (...args: _Args) => Promise<null | string>;
} & {
    [K in `count${CapitalizedK}`]: (...args: _Args) => Promise<number>;
} & {
    [K in `insight${CapitalizedK}`]: (...args: _Args) => Promise<Insight>;
} & {
    [K in `query${CapitalizedK}`]: (...args: _Args) => _QueryOfDoc;
} & {
    [K in `remove${CapitalizedK}`]: (...args: _Args) => Promise<UpdateResult>;
} & {
    [K in `removeOne${CapitalizedK}`]: (...args: _Args) => Promise<UpdateResult>;
} & {
    [K in `purge${CapitalizedK}`]: (...args: _Args) => Promise<number>;
} & {
    [K in `update${CapitalizedK}`]: (...args: _Args) => UpdateChain<Doc>;
} & {
    [K in `updateOne${CapitalizedK}`]: (...args: _Args) => UpdateChain<Doc>;
};

type StrictDocumentActions<T> = string extends keyof T ? T[string] extends never ? Record<never, never> : GetActionObject<T> : GetActionObject<T>;

declare const documentQueryOperators: readonly [
    "eq",
    "ne",
    "oneOf",
    "notOneOf",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "exists",
    "missing",
    "empty",
    "has",
    "contains"
];
```
