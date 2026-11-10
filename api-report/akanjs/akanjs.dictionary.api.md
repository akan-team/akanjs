# `akanjs/dictionary`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface DictModule<DictKey extends string, ErrorKey extends string> {
    __Dict_Key__: DictKey;
    __Error_Key__: ErrorKey;
    dict: ModelDictInfo<[
        string,
        ...string[]
    ]> | ScalarDictInfo<[
        string,
        ...string[]
    ]> | ServiceDictInfo<[
        string,
        ...string[]
    ]>;
}

export declare class DictionaryLookup {
    readonly language: string;
    constructor(language?: string);
    text(key: string): string | undefined;
}

export interface DictionaryModuleInfo {
    kind: DictionaryModuleKind;
    languages: string[];
}

export type DictionaryModuleKind = "model" | "scalar" | "service";

export type DictionaryNode = Record<string, unknown>;

export declare class DictionaryRegistry {
    static register(root: RootDictionary, transMap: Record<string, DictModule<string, string>>): void;
    static getRoot(): RootDictionary;
    static getLanguages(): string[];
    static getModules(): Record<string, DictionaryModuleInfo>;
    static getLocaleGaps(locales?: string[]): LocaleGap[];
    static getKeys(root?: RootDictionary): string[];
    static clear(): void;
}

export type EnumTrans<EnumValue extends number | string> = {
    [key in EnumValue]: Trans;
};

export type EnumTranslatorKey<EnumKey extends string> = `${EnumKey}.${string}${"" | ".desc"}`;

export declare const Err: import("./trans").ErrConstructor<"agent.error.contextOverflow" | "agent.error.llmRequestFailed" | "agent.error.llmUnavailable" | "agent.error.quotaExceeded" | "agent.error.requestRefused" | "base.error.documentNotFound" | "base.error.endpointClosed" | "base.error.gatewayTimeout" | "base.error.idempotencyInFlight" | "base.error.immutableField" | "base.error.invalidArgument" | "base.error.invalidField" | "base.error.mutationInApp" | "base.error.mutationInRender" | "base.error.payloadTooLarge" | "base.error.readOnlyDeployment" | "base.error.relationNotFound" | "base.error.requiredArgument" | "base.error.serverUnavailable" | "base.error.serverUnreachable" | "base.error.tooManyRequests" | "base.error.unexpectedResponse">;

export type ErrConstructor<ErrorKey extends string> = {
    new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption): ErrInstance;
    prototype: ErrInstance;
    fromJSON(payload: ErrPayload): ErrInstance;
    is<Key extends ErrorKey>(error: unknown, ...keys: Key[]): error is ErrInstance & {
        readonly error: Key;
    };
    BadRequest: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
    Unauthorized: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
    Forbidden: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
    NotFound: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
    Conflict: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
};

export type ErrInstance = Error & {
    readonly error: string;
    readonly statusCode: number;
    readonly code?: string;
    readonly details?: unknown;
    readonly data?: TranslationData;
    readonly path?: string;
    readonly timestamp?: string;
    toJSON(): ErrPayload & {
        statusCode: number;
    };
};

export interface ErrPayload extends ErrRestoreOption {
    error: string;
    data?: TranslationData;
}

export interface ErrRestoreOption {
    statusCode?: number;
    code?: string;
    details?: unknown;
    path?: string;
    timestamp?: string;
}

export interface LocaleGap {
    locale: string;
    total: number;
    missing: string[];
}

export declare class ModelDictInfo<Languages extends [
    string,
    ...string[]
] = [
    string
], ModelKey extends string = keyof BaseObject, InsightKey extends string = keyof BaseInsight, QueryKey extends string = BaseFilterQueryKey, SortKey extends string = BaseFilterSortKey, EnumKey extends string = never, BaseSignalKey extends string = never, SliceKey extends string = "", EndpointKey extends string = never, ErrorKey extends string = never, EtcKey extends string = never> {
    static baseModelDictionary: {
        [key in keyof BaseObject]: FieldTranslation<[
            string,
            string
        ]>;
    };
    static baseInsightDictionary: {
        [key in keyof BaseInsight]: FieldTranslation<[
            string,
            string
        ]>;
    };
    static baseQueryDictionary: {
        [key in BaseFilterQueryKey]: FieldTranslation<[
            string,
            string
        ]>;
    };
    static baseSortDictionary: {
        [key in BaseFilterSortKey]: FieldTranslation<[
            string,
            string
        ]>;
    };
    static getBaseSignalDictionary<T extends string>(refName: T): BaseModelCrudGetSignalTranslation<T, [
        string,
        string
    ]>;
    static baseSliceDictionary: {
        [key in ""]: FunctionTranslation<[
            string,
            string
        ], "args" | "queryKey">;
    };
    languages: Languages;
    modelTranslation?: FieldTranslation<Languages>;
    modelDictionary: {
        [K in ModelKey]: FieldTranslation<Languages>;
    };
    insightDictionary: {
        [K in InsightKey]: FieldTranslation<Languages>;
    };
    queryDictionary: {
        [K in QueryKey]: FunctionTranslation<Languages>;
    };
    sortDictionary: {
        [K in SortKey]: FieldTranslation<Languages>;
    };
    enumDictionary: {
        [K in EnumKey]: {
            [key: string]: FieldTranslation<Languages>;
        };
    };
    baseSignalDictionary: {
        [K in BaseSignalKey]: FunctionTranslation<Languages>;
    };
    sliceDictionary: {
        [K in SliceKey]: FunctionTranslation<Languages>;
    };
    endpointDictionary: {
        [K in EndpointKey]: FunctionTranslation<Languages>;
    };
    errorDictionary: {
        [K in ErrorKey]: Languages;
    };
    etcDictionary: {
        [K in EtcKey]: Languages;
    };
    constructor(languages: Languages);
    of(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => FieldTranslation<Languages>): this;
    model<Model extends object>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
        [K in Exclude<keyof GetStateObject<Model>, ModelKey>]: FieldTranslation<Languages>;
    }): ModelDictInfo<Languages, keyof GetStateObject<Model> & string, InsightKey, QueryKey, SortKey, EnumKey, BaseSignalKey, SliceKey, EndpointKey, ErrorKey, EtcKey>;
    insight<Insight extends object>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
        [K in Exclude<keyof GetStateObject<Insight>, InsightKey>]: FieldTranslation<Languages>;
    }): ModelDictInfo<Languages, ModelKey, keyof GetStateObject<Insight> & string, QueryKey, SortKey, EnumKey, BaseSignalKey, SliceKey, EndpointKey, ErrorKey, EtcKey>;
    query<Filter>(translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
        [K in Exclude<keyof DictFilterQuery<Filter>, QueryKey>]: FunctionTranslation<Languages, DictArgNames<DictFilterQuery<Filter>[K]>>;
    }): ModelDictInfo<Languages, ModelKey, InsightKey, keyof DictFilterQuery<Filter> & string, SortKey, EnumKey, BaseSignalKey, SliceKey, EndpointKey, ErrorKey, EtcKey>;
    sort<Filter>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
        [K in Exclude<keyof DictFilterSort<Filter>, SortKey>]: FieldTranslation<Languages>;
    }): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, keyof DictFilterSort<Filter> & string, EnumKey, BaseSignalKey, SliceKey, EndpointKey, ErrorKey, EtcKey>;
    enum<Enum extends {
        refName: string;
        value: EnumValueKey;
    }>(enumName: Enum["refName"], translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
        [K in Enum["value"]]: FieldTranslation<Languages>;
    }): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, SortKey, EnumKey | Enum["refName"], BaseSignalKey, SliceKey, EndpointKey, ErrorKey, EtcKey>;
    slice<Slice>(translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
        [K in Exclude<keyof DictSliceShape<Slice>, SliceKey>]: FunctionTranslation<Languages, DictArgNames<DictSliceShape<Slice>[K]>>;
    }): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, SortKey, EnumKey, BaseSignalKey, keyof DictSliceShape<Slice> & string, EndpointKey, ErrorKey, EtcKey>;
    endpoint<Endpoint>(translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
        [K in Exclude<keyof DictEndpointShape<Endpoint>, EndpointKey>]: FunctionTranslation<Languages, DictArgNames<DictEndpointShape<Endpoint>[K]>>;
    }): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, SortKey, EnumKey, BaseSignalKey, SliceKey, keyof DictEndpointShape<Endpoint> & string, ErrorKey, EtcKey>;
    error<ErrorDict extends {
        [key: string]: Languages;
    }>(errorDictionary: ErrorDict): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, SortKey, EnumKey, BaseSignalKey, SliceKey, EndpointKey, (keyof ErrorDict & string) | ErrorKey, EtcKey>;
    translate<EtcDict extends {
        [key: string]: Languages;
    }>(etcDictionary: EtcDict): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, SortKey, EnumKey, BaseSignalKey, SliceKey, EndpointKey, ErrorKey, (keyof EtcDict & string) | EtcKey>;
    applyBaseSignal<RefName extends string>(refName: RefName): ModelDictInfo<Languages, ModelKey, InsightKey, QueryKey, SortKey, EnumKey, GetBaseSignalKey<RefName>, SliceKey, EndpointKey, ErrorKey, EtcKey>;
    _registerToRoot(refName: string, rootDict: RootDictionary): void;
    getEnum<Enum extends {
        refName: string;
        value: EnumValueKey;
    }>(enumName: EnumKey): {
        [K in Enum["value"]]: FieldTranslation<Languages>;
    };
}

export type ModelTrans<T extends string, Model extends BaseObject, Insight extends BaseInsight, Filter, Slice, Endpoint, ErrorKey extends string, EtcKey extends string> = {
    modelName: Trans;
    modelDesc: Trans;
    model: {
        [K in keyof GetStateObject<Model>]: FieldTrans;
    };
    insight: {
        [K in keyof GetStateObject<Insight>]: FieldTrans;
    };
    query: {
        [K in keyof DictFilterQuery<Filter>]: FnTrans<DictArgNames<DictFilterQuery<Filter>[K]>>;
    };
    sort: {
        [K in keyof DictFilterSort<Filter>]: FieldTrans;
    };
    api: {
        [K in keyof DictEndpointShape<Endpoint>]: FnTrans<DictArgNames<DictEndpointShape<Endpoint>[K]>>;
    } & BaseModelCrudGetApiTrans<T> & MergedValues<{
        [K in keyof DictSliceShape<Slice>]: SliceApiTrans<T, K & string, DictArgNames<DictSliceShape<Slice>[K]>>;
    }>;
    error: {
        [K in ErrorKey]: Trans;
    };
} & {
    [K in EtcKey]: Trans;
};

export type ModelTranslatorKey<T extends string, Model, Insight, Filter, Slice, Endpoint, EtcKey extends string> = `${T}.${EtcKey}` | `${T}.${keyof GetStateObject<Model> & string}${"" | ".desc"}` | `${T}.insight.${keyof GetStateObject<Insight> & string}${"" | ".desc"}` | `${T}.modelDesc` | `${T}.modelName` | `${T}.query.${FilterTranslatorKey<Filter>}` | `${T}.signal.${EndpointTranslatorKey<Endpoint> | SliceTranslatorKey<T, Slice>}` | `${T}.sort.${keyof DictFilterSort<Filter> & string}${"" | ".desc"}`;

export type RootDictionary = Record<string, Record<string, DictionaryNode>>;

export declare class ScalarDictInfo<Languages extends [
    string,
    ...string[]
] = [
    string
], ModelKey extends string = keyof BaseObject, EnumKey extends string = never, ErrorKey extends string = never, EtcKey extends string = never> {
    languages: Languages;
    modelTranslation?: FieldTranslation<Languages>;
    modelDictionary: {
        [K in ModelKey]: FieldTranslation<Languages>;
    };
    enumDictionary: {
        [K in EnumKey]: {
            [key: string]: FieldTranslation<Languages>;
        };
    };
    errorDictionary: {
        [K in ErrorKey]: Languages;
    };
    etcDictionary: {
        [K in EtcKey]: Languages;
    };
    constructor(languages: Languages);
    of(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => FieldTranslation<Languages>): this;
    model<Model>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
        [K in keyof GetStateObject<Model>]: FieldTranslation<Languages>;
    }): ScalarDictInfo<Languages, keyof GetStateObject<Model> & string, EnumKey, ErrorKey, EtcKey>;
    enum<Enum extends {
        refName: string;
        value: EnumValueKey;
    }>(enumName: Enum["refName"], translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
        [K in Enum["value"]]: FieldTranslation<Languages>;
    }): ScalarDictInfo<Languages, ModelKey, EnumKey | Enum["refName"], ErrorKey, EtcKey>;
    error<ErrorDict extends {
        [key: string]: Languages;
    }>(errorDictionary: ErrorDict): ScalarDictInfo<Languages, ModelKey, EnumKey, keyof ErrorDict & string, EtcKey>;
    translate<EtcDict extends {
        [key: string]: Languages;
    }>(etcDictionary: EtcDict): ScalarDictInfo<Languages, ModelKey, EnumKey, ErrorKey, keyof EtcDict & string>;
    _registerToRoot(refName: string, rootDict: RootDictionary): void;
}

export type ScalarTrans<_T extends string, Model, ErrorKey extends string, EtcKey extends string> = {
    name: Trans;
    desc: Trans;
    model: {
        [K in keyof GetStateObject<Model>]: FieldTrans;
    };
    error: {
        [K in ErrorKey]: Trans;
    };
} & {
    [K in EtcKey]: Trans;
};

export type ScalarTranslatorKey<T extends string, Model, EtcKey extends string> = `${T}.${EtcKey}` | `${T}.${keyof GetStateObject<Model> & string}${"" | ".desc"}` | `${T}.modelDesc` | `${T}.modelName`;

export declare class ServiceDictInfo<Languages extends [
    string,
    ...string[]
] = [
    string
], EndpointKey extends string = never, ErrorKey extends string = never, EtcKey extends string = never> {
    languages: Languages;
    endpointDictionary: {
        [K in EndpointKey]: FunctionTranslation<Languages>;
    };
    errorDictionary: {
        [K in ErrorKey]: Languages;
    };
    etcDictionary: {
        [K in EtcKey]: Languages;
    };
    constructor(languages: Languages);
    endpoint<Endpoint>(translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
        [K in keyof DictEndpointShape<Endpoint>]: FunctionTranslation<Languages, DictArgNames<DictEndpointShape<Endpoint>[K]>>;
    }): ServiceDictInfo<Languages, keyof DictEndpointShape<Endpoint> & string, ErrorKey, EtcKey>;
    error<ErrorDict extends {
        [key: string]: Languages;
    }>(errorDictionary: ErrorDict): ServiceDictInfo<Languages, EndpointKey, keyof ErrorDict & string, EtcKey>;
    translate<EtcDict extends {
        [key: string]: Languages;
    }>(etcDictionary: EtcDict): ServiceDictInfo<Languages, EndpointKey, ErrorKey, keyof EtcDict & string>;
    _toTranslation(): {
        [key: string]: string[];
    };
    _registerToRoot(refName: string, rootDict: RootDictionary): void;
}

export type ServiceTrans<_T extends string, Endpoint, ErrorKey extends string, EtcKey extends string> = {
    api: {
        [K in keyof DictEndpointShape<Endpoint>]: FnTrans<DictArgNames<DictEndpointShape<Endpoint>[K]>>;
    };
    error: {
        [K in ErrorKey]: Trans;
    };
} & {
    [K in EtcKey]: Trans;
};

export type ServiceTranslatorKey<T extends string, Endpoint, EtcKey extends string> = `${T}.${EtcKey}` | `${T}.signal.${EndpointTranslatorKey<Endpoint>}`;

export type TransMessage<Locale extends Record<string, unknown>> = {
    [K in keyof Locale]-?: `${K & string}${Locale[K] extends Record<string, unknown> ? `.${keyof Locale[K] extends string ? keyof Locale[K] : never}` : ""}`;
}[keyof Locale];

export interface TransMessageOption {
    key?: string;
    duration?: number;
    data?: TranslationData;
}

export type Translate<Checker> = {
    [K in keyof GetStateObject<Checker>]: Translation;
} & Record<string, Translation> & {
    modelName: Translation;
};

export type Translation = TranslationSingle | TranslationWithParam;

export type TranslationData = Record<string, unknown>;

export declare const __Dict_Key__: `agentStop.${string}.desc` | `agentStop.${string}` | import("./locale").ScalarTranslatorKey<"agentTurn", AgentTurn, never> | import("./locale").ServiceTranslatorKey<"agent", AgentEndpoint, never> | import("./locale").ServiceTranslatorKey<"base", BaseEndpoint, "actions" | "addModel" | "agent" | "agentAnswer" | "agentAnswerNeeded" | "agentAttach" | "agentAttachDuplicate" | "agentAttachReading" | "agentAttachRemove" | "agentAttachTooLarge" | "agentAttachTooMany" | "agentAttachTooMuch" | "agentAttachUnsupported" | "agentBusy" | "agentClear" | "agentCmdCompact" | "agentCmdCopy" | "agentCmdHelp" | "agentCmdNew" | "agentCmdRetry" | "agentCmdTools" | "agentCompacted" | "agentCompactsAt" | "agentContinue" | "agentCopied" | "agentCopyFailed" | "agentHelpIntro" | "agentHelpNote" | "agentIntro" | "agentKeepGoing" | "agentListen" | "agentNothingToCompact" | "agentNothingToRetry" | "agentPlaceholder" | "agentQuestion" | "agentQueue" | "agentQueueCancel" | "agentQueueEdit" | "agentQueuePlaceholder" | "agentQueued" | "agentReferenceFailed" | "agentReferenceRemove" | "agentSummarizing" | "agentSummary" | "agentTokens" | "agentTokensOf" | "agentToolCard" | "agentToolDone" | "agentToolFailed" | "agentToolResult" | "agentToolRunning" | "agentToolsHead" | "agentToolsState" | "agentVoiceFailed" | "approve" | "cameraPromptCancel" | "cameraPromptHeader" | "cameraPromptPhoto" | "cameraPromptPicture" | "cancel" | "cardView" | "checkServerStatus" | "confirmClose" | "confirmMsg" | "connected" | "connecting" | "copy" | "createModel" | "createSuccess" | "decline" | "draftApplied" | "draftConflict" | "draftDiscard" | "draftRestore" | "draftStartOver" | "edit" | "emailInvalidError" | "error" | "exportCsv" | "exportJson" | "failed" | "goBack" | "invalidValueError" | "irreversibleOps" | "loadFailed" | "new" | "noData" | "noOptions" | "noSelection" | "numberTooBigError" | "numberTooSmallError" | "ok" | "pageLoadFailed" | "pageNotFound" | "password" | "passwordConfirm" | "passwordNotMatchError" | "perPage" | "phoneInvalidError" | "priceUnit" | "processed" | "processing" | "refresh" | "refreshing" | "remove" | "removeModel" | "removeMsg" | "removeSuccess" | "retry" | "save" | "selectDateError" | "selectTooLongError" | "selectTooShortError" | "send" | "serverDisconnected" | "serverHasProblem" | "skip" | "somethingWrong" | "stop" | "success" | "sureToRemove" | "tableView" | "textTooLongError" | "textTooShortError" | "tryReconnecting" | "typeNameToRemove" | "unauthorized" | "updateModel" | "updateSuccess" | "view" | "yesRemove">;

export declare const __Error_Key__: "agent.error.contextOverflow" | "agent.error.llmRequestFailed" | "agent.error.llmUnavailable" | "agent.error.quotaExceeded" | "agent.error.requestRefused" | "base.error.documentNotFound" | "base.error.endpointClosed" | "base.error.gatewayTimeout" | "base.error.idempotencyInFlight" | "base.error.immutableField" | "base.error.invalidArgument" | "base.error.invalidField" | "base.error.mutationInApp" | "base.error.mutationInRender" | "base.error.payloadTooLarge" | "base.error.readOnlyDeployment" | "base.error.relationNotFound" | "base.error.requiredArgument" | "base.error.serverUnavailable" | "base.error.serverUnreachable" | "base.error.tooManyRequests" | "base.error.unexpectedResponse";

export declare const dictionary: {
    base: import("./locale").DictModule<import("./locale").ServiceTranslatorKey<"base", BaseEndpoint, "actions" | "addModel" | "agent" | "agentAnswer" | "agentAnswerNeeded" | "agentAttach" | "agentAttachDuplicate" | "agentAttachReading" | "agentAttachRemove" | "agentAttachTooLarge" | "agentAttachTooMany" | "agentAttachTooMuch" | "agentAttachUnsupported" | "agentBusy" | "agentClear" | "agentCmdCompact" | "agentCmdCopy" | "agentCmdHelp" | "agentCmdNew" | "agentCmdRetry" | "agentCmdTools" | "agentCompacted" | "agentCompactsAt" | "agentContinue" | "agentCopied" | "agentCopyFailed" | "agentHelpIntro" | "agentHelpNote" | "agentIntro" | "agentKeepGoing" | "agentListen" | "agentNothingToCompact" | "agentNothingToRetry" | "agentPlaceholder" | "agentQuestion" | "agentQueue" | "agentQueueCancel" | "agentQueueEdit" | "agentQueuePlaceholder" | "agentQueued" | "agentReferenceFailed" | "agentReferenceRemove" | "agentSummarizing" | "agentSummary" | "agentTokens" | "agentTokensOf" | "agentToolCard" | "agentToolDone" | "agentToolFailed" | "agentToolResult" | "agentToolRunning" | "agentToolsHead" | "agentToolsState" | "agentVoiceFailed" | "approve" | "cameraPromptCancel" | "cameraPromptHeader" | "cameraPromptPhoto" | "cameraPromptPicture" | "cancel" | "cardView" | "checkServerStatus" | "confirmClose" | "confirmMsg" | "connected" | "connecting" | "copy" | "createModel" | "createSuccess" | "decline" | "draftApplied" | "draftConflict" | "draftDiscard" | "draftRestore" | "draftStartOver" | "edit" | "emailInvalidError" | "error" | "exportCsv" | "exportJson" | "failed" | "goBack" | "invalidValueError" | "irreversibleOps" | "loadFailed" | "new" | "noData" | "noOptions" | "noSelection" | "numberTooBigError" | "numberTooSmallError" | "ok" | "pageLoadFailed" | "pageNotFound" | "password" | "passwordConfirm" | "passwordNotMatchError" | "perPage" | "phoneInvalidError" | "priceUnit" | "processed" | "processing" | "refresh" | "refreshing" | "remove" | "removeModel" | "removeMsg" | "removeSuccess" | "retry" | "save" | "selectDateError" | "selectTooLongError" | "selectTooShortError" | "send" | "serverDisconnected" | "serverHasProblem" | "skip" | "somethingWrong" | "stop" | "success" | "sureToRemove" | "tableView" | "textTooLongError" | "textTooShortError" | "tryReconnecting" | "typeNameToRemove" | "unauthorized" | "updateModel" | "updateSuccess" | "view" | "yesRemove">, "base.error.documentNotFound" | "base.error.endpointClosed" | "base.error.gatewayTimeout" | "base.error.idempotencyInFlight" | "base.error.immutableField" | "base.error.invalidArgument" | "base.error.invalidField" | "base.error.mutationInApp" | "base.error.mutationInRender" | "base.error.payloadTooLarge" | "base.error.readOnlyDeployment" | "base.error.relationNotFound" | "base.error.requiredArgument" | "base.error.serverUnavailable" | "base.error.serverUnreachable" | "base.error.tooManyRequests" | "base.error.unexpectedResponse">;
    agentTurn: import("./locale").DictModule<`agentStop.${string}.desc` | `agentStop.${string}` | import("./locale").ScalarTranslatorKey<"agentTurn", AgentTurn, never>, never>;
    agent: import("./locale").DictModule<import("./locale").ServiceTranslatorKey<"agent", AgentEndpoint, never>, "agent.error.contextOverflow" | "agent.error.llmRequestFailed" | "agent.error.llmUnavailable" | "agent.error.quotaExceeded" | "agent.error.requestRefused">;
};

export declare const getAllDictionary: () => import("./trans").RootDictionary;

export declare const getDictionary: (lang: "en" | "ja" | "ko" | "zhChs" | "zhCht" | (string & {})) => object;

export declare const makeDictionary: <Dicts extends Record<string, unknown>[]>(...dicts: Dicts) => Prettify<ObjectAssign<Dicts>>;

export declare const makeTrans: <GlobalTransMap extends Record<string, DictModule<string, string>>, _DictKey extends string = GlobalTransMap[keyof GlobalTransMap]["__Dict_Key__"], _ErrorKey extends string = GlobalTransMap[keyof GlobalTransMap]["__Error_Key__"]>(transMap: GlobalTransMap, { build }?: {
    build?: boolean;
}) => {
    Err: ErrConstructor<_ErrorKey>;
    translate: (lang: Language, key: _DictKey, data?: TranslationData) => string;
    msg: MsgApi<_DictKey>;
    getDictionary: (lang: Language) => object;
    getAllDictionary: () => RootDictionary;
    __Dict_Key__: _DictKey;
    __Error_Key__: _ErrorKey;
};

export declare const modelDictionary: <Languages extends [
    string,
    ...string[]
] = [
    string
], ExtendModelDicts extends AnyModelDictInfo[] = [
]>(languages?: Languages, ...extendModelDicts: ExtendModelDicts) => MergeModelDicts<[
    ModelDictInfo<Languages>,
    ...ExtendModelDicts
]>;

export declare const msg: MsgApi<TransMessage<Record<string, unknown>>>;

export declare const registerModelTrans: <RefName extends string, Model extends BaseObject, Insight extends BaseInsight, Filter, Slice, Endpoint, ModelDict>(modelDict: ModelDict) => ModelDictModule<RefName, Model, Insight, Filter, Slice, Endpoint, ModelDict>;

export declare const registerScalarTrans: <T extends string, Model, ScalarDict>(scalarDict: ScalarDict) => ScalarDictModule<T, Model, ScalarDict>;

export declare const registerServiceTrans: <T extends string, Endpoint, ServiceDict>(serviceDict: ServiceDict) => ServiceDictModule<T, Endpoint, ServiceDict>;

export declare const scalarDictionary: <Languages extends [
    string,
    ...string[]
] = [
    string
]>(languages?: Languages) => ScalarDictInfo<Languages, keyof BaseObject, never, never, never>;

export declare const serviceDictionary: <Languages extends [
    string,
    ...string[]
] = [
    string
]>(languages?: Languages) => ServiceDictInfo<Languages, never, never, never>;

export declare const translate: (lang: "en" | "ja" | "ko" | "zhChs" | "zhCht" | (string & {}), key: `agentStop.${string}.desc` | `agentStop.${string}` | import("./locale").ScalarTranslatorKey<"agentTurn", AgentTurn, never> | import("./locale").ServiceTranslatorKey<"agent", AgentEndpoint, never> | import("./locale").ServiceTranslatorKey<"base", BaseEndpoint, "actions" | "addModel" | "agent" | "agentAnswer" | "agentAnswerNeeded" | "agentAttach" | "agentAttachDuplicate" | "agentAttachReading" | "agentAttachRemove" | "agentAttachTooLarge" | "agentAttachTooMany" | "agentAttachTooMuch" | "agentAttachUnsupported" | "agentBusy" | "agentClear" | "agentCmdCompact" | "agentCmdCopy" | "agentCmdHelp" | "agentCmdNew" | "agentCmdRetry" | "agentCmdTools" | "agentCompacted" | "agentCompactsAt" | "agentContinue" | "agentCopied" | "agentCopyFailed" | "agentHelpIntro" | "agentHelpNote" | "agentIntro" | "agentKeepGoing" | "agentListen" | "agentNothingToCompact" | "agentNothingToRetry" | "agentPlaceholder" | "agentQuestion" | "agentQueue" | "agentQueueCancel" | "agentQueueEdit" | "agentQueuePlaceholder" | "agentQueued" | "agentReferenceFailed" | "agentReferenceRemove" | "agentSummarizing" | "agentSummary" | "agentTokens" | "agentTokensOf" | "agentToolCard" | "agentToolDone" | "agentToolFailed" | "agentToolResult" | "agentToolRunning" | "agentToolsHead" | "agentToolsState" | "agentVoiceFailed" | "approve" | "cameraPromptCancel" | "cameraPromptHeader" | "cameraPromptPhoto" | "cameraPromptPicture" | "cancel" | "cardView" | "checkServerStatus" | "confirmClose" | "confirmMsg" | "connected" | "connecting" | "copy" | "createModel" | "createSuccess" | "decline" | "draftApplied" | "draftConflict" | "draftDiscard" | "draftRestore" | "draftStartOver" | "edit" | "emailInvalidError" | "error" | "exportCsv" | "exportJson" | "failed" | "goBack" | "invalidValueError" | "irreversibleOps" | "loadFailed" | "new" | "noData" | "noOptions" | "noSelection" | "numberTooBigError" | "numberTooSmallError" | "ok" | "pageLoadFailed" | "pageNotFound" | "password" | "passwordConfirm" | "passwordNotMatchError" | "perPage" | "phoneInvalidError" | "priceUnit" | "processed" | "processing" | "refresh" | "refreshing" | "remove" | "removeModel" | "removeMsg" | "removeSuccess" | "retry" | "save" | "selectDateError" | "selectTooLongError" | "selectTooShortError" | "send" | "serverDisconnected" | "serverHasProblem" | "skip" | "somethingWrong" | "stop" | "success" | "sureToRemove" | "tableView" | "textTooLongError" | "textTooShortError" | "tryReconnecting" | "typeNameToRemove" | "unauthorized" | "updateModel" | "updateSuccess" | "view" | "yesRemove">, data?: import("./trans").TranslationData) => string;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type AnyFilterShape = FilterCompactShape<FilterInstance<Record<string, FilterInfo>, Record<string, unknown>>>;

type AnyModelDictInfo = ModelDictInfo<any, any, any, any, any, any, any, any, any, any, any>;

type BaseModelCrudGetApiTrans<T extends string> = {
    [K in T]: FnTrans<`${T}Id`>;
} & {
    [K in `light${T}`]: FnTrans<`${T}Id`>;
} & {
    [K in `create${T}`]: FnTrans<"data">;
} & {
    [K in `update${T}`]: FnTrans<"data" | `${T}Id`>;
} & {
    [K in `remove${T}`]: FnTrans<`${T}Id`>;
};

type BaseModelCrudGetSignalTranslation<T extends string, Languages extends [
    string,
    ...string[]
] = [
    string
], _CapitalizedRefName extends string = Capitalize<T>> = {
    [K in T]: FunctionTranslation<Languages, `${T}Id`>;
} & {
    [K in `light${_CapitalizedRefName}`]: FunctionTranslation<Languages, `${T}Id`>;
} & {
    [K in `create${_CapitalizedRefName}`]: FunctionTranslation<Languages, "data">;
} & {
    [K in `update${_CapitalizedRefName}`]: FunctionTranslation<Languages, "data" | `${T}Id`>;
} & {
    [K in `remove${_CapitalizedRefName}`]: FunctionTranslation<Languages, `${T}Id`>;
};

type CompactSliceTranslatorKey<T extends string, Slice> = {
    [Key in keyof DictSliceShape<Slice> & string]: Key extends "" ? never : `${T}Insight${Capitalize<Key>}.arg.${DictArgNames<DictSliceShape<Slice>[Key]>}.desc` | `${T}Insight${Capitalize<Key>}.arg.${DictArgNames<DictSliceShape<Slice>[Key]>}` | `${T}Insight${Capitalize<Key>}.desc` | `${T}Insight${Capitalize<Key>}` | `${T}List${Capitalize<Key>}.arg.${"limit" | "skip" | "sort" | DictArgNames<DictSliceShape<Slice>[Key]>}.desc` | `${T}List${Capitalize<Key>}.arg.${"limit" | "skip" | "sort" | DictArgNames<DictSliceShape<Slice>[Key]>}` | `${T}List${Capitalize<Key>}.desc` | `${T}List${Capitalize<Key>}`;
}[keyof DictSliceShape<Slice> & string];

type DictArgNames<ArgNames> = ArgNames extends readonly string[] ? ArgNames[number] : never;

type DictArgShape = {
    [key: string]: readonly string[];
};

type DictEndpointShape<Endpoint> = Endpoint extends EndpointCls<infer _SrvModule, infer EndpointInfoObj> ? EndpointCompactShape<EndpointInfoObj> : Endpoint extends {
    readonly [ENDPOINT_DICT_SHAPE]: infer CompactShape extends DictArgShape;
} ? CompactShape : Endpoint extends DictArgShape ? Endpoint : Endpoint extends Record<string, EndpointInfo> ? EndpointCompactShape<Endpoint> : Record<never, never>;

type DictFilterQuery<Filter> = DictFilterShape<Filter>["query"];

type DictFilterShape<Filter> = Filter extends FilterCls<infer FilterShape> ? FilterCompactShape<FilterShape> : Filter extends {
    readonly [FILTER_DICT_SHAPE]: infer CompactShape extends FilterDictArgShape;
} ? CompactShape : Filter extends FilterInstance ? FilterCompactShape<Filter> : Filter extends {
    query: Record<string, FilterInfo>;
    sort: Record<string, unknown>;
} ? FilterCompactShape<Filter> : Filter extends {
    query: DictArgShape;
    sort: Record<string, true>;
} ? Filter : AnyFilterShape;

type DictFilterSort<Filter> = DictFilterShape<Filter>["sort"];

type DictSliceShape<Slice> = Slice extends SliceCls<infer _SrvModule, infer SliceInfoObj> ? SliceCompactShape<SliceInfoObj> : Slice extends {
    readonly [SLICE_DICT_SHAPE]: infer CompactShape extends DictArgShape;
} ? CompactShape : Slice extends DictArgShape ? Slice : Slice extends Record<string, SliceInfo> ? SliceCompactShape<Slice> : Record<never, never>;

type EndpointTranslatorKey<Endpoint> = {
    [Key in keyof DictEndpointShape<Endpoint> & string]: `${Key}.arg.${DictArgNames<DictEndpointShape<Endpoint>[Key]>}.desc` | `${Key}.arg.${DictArgNames<DictEndpointShape<Endpoint>[Key]>}` | `${Key}.desc` | `${Key}`;
}[keyof DictEndpointShape<Endpoint> & string];

type EnumValueKey = number | string;

interface FieldTrans {
    t: string;
    desc?: string;
}

declare class FieldTranslation<Languages extends [
    string,
    ...string[]
]> {
    static translate: <Languages_1 extends [
        string,
        ...string[]
    ]>(trans: Languages_1) => FieldTranslation<Languages_1>;
    trans: Languages;
    descTrans?: Languages;
    constructor(trans: Languages);
    desc(descTrans: Languages): this;
}

type FilterTranslatorKey<Filter> = {
    [Key in keyof DictFilterQuery<Filter> & string]: (DictArgNames<DictFilterQuery<Filter>[Key]> extends string ? `${Key}.arg.${DictArgNames<DictFilterQuery<Filter>[Key]>}.desc` | `${Key}.arg.${DictArgNames<DictFilterQuery<Filter>[Key]>}` : never) | `${Key}.desc` | `${Key}`;
}[keyof DictFilterQuery<Filter> & string];

interface FnTrans<ArgKey extends string> {
    t: string;
    desc?: string;
    arg?: {
        [key in ArgKey]: FieldTrans;
    };
}

type FullSliceTranslatorKey<Slice> = {
    [Key in keyof Slice & string]: Slice[Key] extends infer Info extends SliceInfo ? `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}.arg.${SliceInfoArgNames<Info>[number]}.desc` | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}.arg.${SliceInfoArgNames<Info>[number]}` | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}.desc` | `${SliceInfoRefName<Info>}Insight${Capitalize<Key>}` | `${SliceInfoRefName<Info>}List${Capitalize<Key>}.arg.${"limit" | "skip" | "sort" | SliceInfoArgNames<Info>[number]}.desc` | `${SliceInfoRefName<Info>}List${Capitalize<Key>}.arg.${"limit" | "skip" | "sort" | SliceInfoArgNames<Info>[number]}` | `${SliceInfoRefName<Info>}List${Capitalize<Key>}.desc` | `${SliceInfoRefName<Info>}List${Capitalize<Key>}` : never;
}[keyof Slice & string];

declare class FunctionTranslation<Languages extends [
    string,
    ...string[]
], ArgName extends string = never> {
    trans: Languages;
    descTrans?: Languages;
    argTrans: {
        [key in ArgName]: FieldTranslation<Languages>;
    };
    constructor(trans: Languages);
    desc(descTrans: Languages): this;
    arg<TransMap extends {
        [key: string]: FieldTranslation<Languages>;
    }>(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => TransMap): FunctionTranslation<Languages, keyof TransMap & string>;
}

type GetBaseSignalKey<T extends string> = keyof BaseModelCrudGetSignalTranslation<T>;

type Language = "en" | "ja" | "ko" | "zhChs" | "zhCht" | (string & {});

type MergeModelDicts<ModelDicts extends AnyModelDictInfo[]> = ModelDicts extends [
    infer First extends AnyModelDictInfo,
    ...infer Rest extends AnyModelDictInfo[]
] ? Rest extends [
] ? First : MergeTwoModelDicts<First, MergeModelDicts<Rest>> : never;

type MergeTwoModelDicts<ModelDict1, ModelDict2> = ModelDict1 extends ModelDictInfo<infer Languages1, infer ModelKey1, infer InsightKey1, infer QueryKey1, infer SortKey1, infer EnumKey1, infer BaseSignalKey1, infer SliceKey1, infer EndpointKey1, infer ErrorKey1, infer EtcKey1> ? ModelDict2 extends ModelDictInfo<infer _Languages2, infer ModelKey2, infer InsightKey2, infer QueryKey2, infer SortKey2, infer EnumKey2, infer BaseSignalKey2, infer SliceKey2, infer EndpointKey2, infer ErrorKey2, infer EtcKey2> ? ModelDictInfo<Languages1, ModelKey1 | ModelKey2, InsightKey1 | InsightKey2, QueryKey1 | QueryKey2, SortKey1 | SortKey2, EnumKey1 | EnumKey2, BaseSignalKey1 | BaseSignalKey2, SliceKey1 | SliceKey2, EndpointKey1 | EndpointKey2, ErrorKey1 | ErrorKey2, EtcKey1 | EtcKey2> : ModelDict1 : never;

type ModelDictModule<RefName extends string, Model, Insight, Filter, Slice, Endpoint, ModelDict> = ModelDict extends ModelDictInfo<infer _Languages, infer _ModelKey, infer _InsightKey, infer _QueryKey, infer _SortKey, infer EnumKey, infer _BaseSignalKey, infer _SliceKey, infer _EndpointKey, infer ErrorKey, infer EtcKey> ? DictModule<EnumTranslatorKey<EnumKey> | ModelTranslatorKey<RefName, Model, Insight, Filter, Slice, Endpoint, EtcKey>, `${RefName}.error.${ErrorKey}`> : never;

type MsgApi<Key> = {
    [Level in "error" | "info" | "loading" | "success" | "warning"]: (key: Key, option?: TransMessageOption) => void;
};

type ScalarDictModule<T extends string, Model, ScalarDict> = ScalarDict extends ScalarDictInfo<infer _Languages, infer _ModelKey, infer EnumKey, infer ErrorKey, infer EtcKey> ? DictModule<EnumTranslatorKey<EnumKey> | ScalarTranslatorKey<T, Model, EtcKey>, `${T}.error.${ErrorKey}`> : never;

type ServiceDictModule<T extends string, Endpoint, ServiceDict> = ServiceDict extends ServiceDictInfo<infer _Languages, infer _EndpointKey, infer ErrorKey, infer EtcKey> ? DictModule<ServiceTranslatorKey<T, Endpoint, EtcKey>, `${T}.error.${ErrorKey}`> : never;

type SliceApiTrans<T extends string, Suffix extends string, ArgName extends string, _CapitalizedSuffix extends string = Capitalize<Suffix>> = {
    [K in `${T}List${_CapitalizedSuffix}`]: FnTrans<"limit" | "skip" | "sort" | ArgName>;
} & {
    [K in `${T}Insight${_CapitalizedSuffix}`]: FnTrans<ArgName>;
};

type SliceTranslatorKey<T extends string, Slice> = Slice extends Record<string, SliceInfo> ? FullSliceTranslatorKey<Slice> : CompactSliceTranslatorKey<T, Slice>;

interface Trans {
    t: string;
}

type TranslationSingle = readonly [
    string,
    string
] | readonly [
    string,
    string,
    string,
    string
];

type TranslationWithParam = readonly [
    string,
    string,
    {
        [key: string]: number | string;
    }
];
```
