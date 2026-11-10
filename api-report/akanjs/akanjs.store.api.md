# `akanjs/store`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface ActionOwner {
    refName: string;
    silent?: boolean;
}

export interface ActionTag {
    action: string;
    state?: string;
}

export declare class AgentAbort {
    static get current(): AbortSignal | null;
    static run<T>(signal: AbortSignal, exec: () => Promise<T> | T): Promise<T>;
}

export declare class AgentBridge {
    readonly refusals: AgentRefusal[];
    static of(): AgentBridge;
    constructor(instance: StoreInstance);
    get state(): {
        [key: string]: SerializedStoreState;
    };
    subscribe(listener: () => void): () => void;
    readableKeys(viewKey?: string): string[];
    read(key: string, viewKey?: string): unknown;
}

export declare class AgentConfirm {
    static readonly writeVerbs: string[];
    static isWrite(name: string): boolean;
    static get policy(): AgentConfirmPolicy;
    static set(policy: Partial<AgentConfirmPolicy>): void;
}

export interface AgentConfirmPolicy {
    byName: (name: string) => boolean;
    afterScreenRead: boolean;
}

export declare class AgentContext {
    static of(): AgentContext;
    constructor(instance: StoreInstance, bridge: AgentBridge);
    blocks(surface: SurfaceView, view?: string[]): ContextBlock[];
}

export declare class AgentCursor {
    static readonly className = "akan-agent-cursor";
    static readonly travelMs = 320;
    static readonly travelFrom = 200;
    static readonly driftBy = 18;
    static readonly idleMs = 1400;
    static readonly thinkingClass = "akan-agent-cursor-thinking";
    static readonly scrollingClass = "akan-agent-cursor-scrolling";
    static press(target: HTMLElement): Promise<void>;
    static scroll(way: "down" | "up"): void;
    static hold(): void;
    static release(): void;
    static think(): void;
    static hide(): void;
}

export type AgentFieldType = AgentSingleType | AgentSingleType[];

export declare class AgentProgress {
    static report(message: string, amount?: {
        done?: number;
        total?: number;
        steps?: AgentProgressStep[];
    }): void;
    static get watching(): boolean;
    static run<T>(sink: (report: AgentProgressReport) => void, exec: () => Promise<T> | T): Promise<T>;
}

export interface AgentProgressStep {
    id: string;
    label: string;
    status: "done" | "error" | "pending" | "running";
    detail?: string;
}

export declare class AgentPrompts {
    static parseCommand(draft: string): null | {
        name: string;
        args: string[];
    };
    static messagesOf(result: PromptResult): ChatMessage[];
    static textOf(content: PromptContent): string;
}

export interface AgentReferenceInput<T extends AgentFieldType> {
    refName: string;
    refId: string;
    label: string;
    path?: string;
    type: T;
    value: AgentValueOf<T>;
}

export declare class AgentValue {
    static serialize(type: AgentFieldType, value: unknown): unknown;
    static publishable(owner: string, type: AgentFieldType): boolean;
}

export type AgentValueOf<T> = T extends readonly (infer F)[] ? AgentValueOf<F>[] : T extends {
    refName: "Any";
} ? unknown : T extends EnumInstance<string, infer V> ? V : T extends DateConstructor ? Date | Dayjs | string : T extends {
    refName: string;
    [CLIENT_VALUE]: infer V;
} ? V : T extends {
    [FIELD_META]: unknown;
} ? GetStateObject<UnCls<T>> : T extends {
    [CLIENT_VALUE]: infer V;
} ? V : unknown;

export declare class AgentVisual {
    static readonly revealCap = 4;
    static readonly fieldCap = 5;
    static readonly leadMs = 600;
    static sink(option?: AgentVisualOption | boolean): undefined | {
        onActivity: (event: ToolActivity) => Promise<void> | void;
        onTurn: (running: boolean) => void;
    };
    static turn(running: boolean, { cursor }?: AgentVisualOption): void;
    static on(event: ToolActivity, { reveal, cursor }?: AgentVisualOption): Promise<void> | void;
}

export interface AgentVisualOption {
    reveal?: boolean;
    cursor?: boolean;
}

export type BaseSearchParamsState = {
    [key: string]: string | string[];
};

export declare class BaseStore extends BaseStore_base {
    setDevMode(value: boolean): void;
    setWindowSize(): void;
    showMessage(message: {
        content: string | string[];
    } & Partial<typeof defaultMessage>): void;
    hideMessage(key: string): void;
}

export interface ComputedMeta {
    kind: "computed";
    key: string;
    deps: readonly string[];
    selector: (...values: any[]) => any;
    equals: (a: any, b: any) => boolean;
}

export interface ComputedOptions<T> {
    equals?: (a: T, b: T) => boolean;
}

export interface CreateOption<Full extends {
    id: string;
}> {
    path?: string;
    modal?: string;
    sliceName?: string;
    onError?: (e: string) => void;
    onSuccess?: (model: Full) => Promise<void> | void;
}

export type DefaultAction<SlceCls extends SliceCls, _RefName extends string = _ActionRefName<SlceCls>, _Input = _ActionInput<SlceCls>, _Full extends {
    id: string;
} = _ActionFull<SlceCls>, _Light = _ActionLight<SlceCls>, _Filter extends FilterInstance = _ActionFilter<SlceCls>, _CapitalizedRefName extends string = _ActionCap<SlceCls>, _Default = _ActionDefault<SlceCls>, _DefaultInput = _ActionDefaultInput<SlceCls>, _Sort = _ActionSort<SlceCls>, _CreateOption = CreateOption<_Full>, _FetchInitFormWithFetchPolicy = SliceInitForm<SlceCls>> = BaseAction<_RefName, _Input, _Full, _Light, _CapitalizedRefName, _CreateOption> & FormSetter<_Full, _RefName, _CapitalizedRefName, _Default> & DefaultSliceActionFields<SlceCls, _CapitalizedRefName, _FetchInitFormWithFetchPolicy, _Light, _Sort>;

export type DefaultState<SlceCls extends SliceCls, _RefName extends _StateRefName<SlceCls> = _StateRefName<SlceCls>, _Full = _StateFull<SlceCls>, _Light extends {
    id: string;
} = _StateLight<SlceCls>, _Insight = _StateInsight<SlceCls>, _Filter extends FilterInstance = _StateFilter<SlceCls>, _CapitalizedRefName extends string = _StateCap<SlceCls>, _Default = _StateDefault<SlceCls>, _Sort = _StateSort<SlceCls>> = BaseState<_RefName, _Full, _Default> & DefaultSliceStateFields<SlceCls, _RefName, _CapitalizedRefName, _Full, _Light, _Insight, _Default, _Sort>;

export type DepValues<State, Keys extends readonly (keyof State)[]> = {
    [I in keyof Keys]: Keys[I] extends keyof State ? State[Keys[I]] : never;
};

export interface DerivedStateBuilder<WritableState> {
    search<T extends FieldTypeInput, Options extends SearchOptions<any>>(paramKey: string, type: T, options?: Options): {
        [STATE_BUILDER_MARK]: true;
        kind: "search";
        paramKey: string;
        type: T;
        options: Options;
    };
    computed<const Keys extends readonly (keyof WritableState & string)[], Result>(deps: Keys, selector: (...values: DepValues<WritableState, Keys>) => Result, options?: ComputedOptions<Result>): {
        [STATE_BUILDER_MARK]: true;
        kind: "computed";
        deps: Keys;
        selector: (...values: any[]) => Result;
        options: ComputedOptions<Result>;
    };
}

export type DerivedStateOf<State> = {
    [K in keyof State]: State[K] extends Marker ? MarkerValue<State[K]> : never;
};

export interface DraftMeta {
    refName: string;
    formKey: string;
    draftKey: string;
    uploadingKey: string;
}

export interface DraftRecord {
    v: number;
    savedAt: string;
    baseUpdatedAt: null | string;
    form: Record<string, unknown>;
}

export interface DraftState {
    key: string;
    baseHash: string;
    baseUpdatedAt: null | string;
    pending: null | {
        savedAt: Date;
        form: object;
    };
    appliedAt: Date | null;
}

export declare class DraftStore {
    static identity(): string;
    static editScope(modelId: string): string;
    static newScope({ seed, modal, sliceName, routePath }: NewScopeInput): string;
    static keyOf(refName: string, scope: string, identity?: string): string;
    static encodeForm(refName: string, form: object): Record<string, unknown>;
    static decodeForm(refName: string, plain: Record<string, unknown>): object;
    static formHash(refName: string, form: object): string;
    static contentHash(encoded: Record<string, unknown>): string;
    static read(key: string): Promise<DraftRecord | null>;
    static write(key: string, record: DraftRecord): Promise<void>;
    static remove(key: string): Promise<void>;
    static removeIdentity(identity?: string): Promise<void>;
    static sweep(): Promise<void>;
    static reconcileIdentity(): Promise<void>;
}

export interface EditOption {
    modal?: null | string;
    draftScope?: string;
}

export interface FieldToolOptions {
    transform?: unknown;
    disabled?: boolean;
    sortable?: boolean;
}

export interface FileFieldSource<T extends {
    id: string;
}> {
    read?: () => readonly T[];
    label: (file: T) => string;
    max?: number;
    min?: number;
    disabled?: boolean;
}

export interface FormFieldRef {
    refName: string;
    key: string;
    field: ConstantField;
}

export declare class FormFields {
    static ref(action: string): FormFieldRef | null;
    static patchable(refName: string): {
        key: string;
        action: string;
        field: ConstantField;
        schema: JsonSchema;
    }[];
    static schema(field: ConstantField, depth?: number): JsonSchema | null;
    static checked(action: string, path: string, field: ConstantField, value: unknown, depth?: number): unknown;
    static optionsToolName(refName: string, key: string): string;
    static relationOf(field: ConstantField): null | string;
    static isComposite(field: ConstantField): boolean;
    static rowModelOf(field: ConstantField): (new (...args: never[]) => unknown) | null;
}

export interface FormUpload {
    upload: (fileList: FileList | File[]) => Promise<void>;
    refresh: (files: HeldFile[]) => void;
}

export type FormUploading<_Default> = {
    [K in keyof _Default as _Default[K] extends (ProtoLightFile | null) | ProtoLightFile[] ? K : never]?: string[];
};

export type Get<State, Actions> = {
    get: () => State & Actions;
};

export type InternalSlice<SlceInfo extends SliceInfo = any, RefName extends string = any, Suffix extends string = any, Input = any, Full = any, Light extends {
    id: string;
} = any, Insight = any, Filter extends FilterInstance = any, _CapitalizedRefName extends string = Capitalize<RefName>, _Default = DefaultOf<Full>, _Sort = ExtractSort<Filter>, _Args extends any[] = SliceInfoArgs<SlceInfo>, _SliceState = SliceState<RefName, "", Full, Light, _Args, Insight, Filter, _CapitalizedRefName, "", _Default, _Sort>, _SliceAction = SliceAction<RefName, "", Input, Light, _Args, Filter, _CapitalizedRefName, "", _Sort>, _SliceName extends string = StoreSliceName<RefName, Suffix>> = SliceStateAction<RefName, Suffix, _SliceName, _SliceState, _SliceAction>;

export interface LivePlacementProps {
    list: LiveSortableRow[];
    row: LiveSortableRow;
    page: number;
    limit: number;
    count: number;
    cumulative: boolean;
    hasMore: boolean;
    sortKey: string;
    allowedSorts: string[];
    sorts: undefined | {
        [key: string]: {
            [path: string]: -1 | 1;
        };
    };
}

export type LiveSortableRow = {
    [key: string]: unknown;
};

export type ModelStore<Sig extends ClientSignal<any, any, any> | string, WritableState, Action, DerivedState = unknown> = Sig extends string ? StoreCls<Sig, WritableState, Action, any, DerivedState> : Sig extends ClientSignal<any, any, any> ? StoreCls<Sig["refName"], WritableState & DefaultState<Sig["_slice"]>, Action & DefaultAction<Sig["_slice"]>, Sig["_slice"], DerivedState> : never;

export interface NewOption {
    modal?: string;
    setDefault?: boolean;
    sliceName?: string;
    draftScope?: string;
}

export interface PersistSessionMeta {
    kind: "persist" | "session";
    key: string;
    storageKey: string;
    parse: (value: unknown) => unknown;
    serialize: (value: unknown) => unknown;
    getDefault: () => unknown;
}

export interface PersistSessionOptions<T> {
    default?: (() => T) | T;
    key?: string;
    nullable?: boolean;
}

export type ReactAPI = {
    useSyncExternalStore: <T>(subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T) => T;
    useRef: <T>(initialValue: T) => {
        current: T;
    };
    useEffect: (effect: EffectCallback, deps?: any[]) => void;
};

export interface RelationFieldSource<T extends {
    id: string;
}> {
    read: () => DataList<T>;
    load: () => Promise<unknown> | unknown;
    label: (model: T) => string;
    disabled?: boolean;
}

export declare class RootStore extends RootStore_base {
}

export type RootStoreCls<RefName extends string = any, WritableState = any, Action = any, InternalSliceObj = any, SliceInfoObj = any, DerivedState = unknown, State = WritableState & DerivedState> = Cls<SetGetWritable<WritableState, State> & Action & {
    slice: InternalSliceObj;
}, {
    readonly type: "root";
    refName: RefName;
    [STATE_META]: State;
    [STATE_INIT_META]: StateInitializerMap;
    [STATE_DERIVED_META]: StateDerivedMeta;
    [ACTION_META]: {
        [key: string]: (...args: any[]) => any;
    };
    [ACTION_OWNER_META]: {
        [key: string]: ActionOwner;
    };
    slice: {
        [key: string]: {
            [key: string]: SerializedSlice;
        };
    };
    _slice: SliceInfoObj;
}>;

export declare class ScreenFlash {
    static readonly ringClass = "akan-agent-highlight";
    static readonly ringMs = 2400;
    static readonly actingClass = "akan-agent-acting";
    static readonly actingMs = 1000;
    static show(target: HTMLElement): void;
    static reveal(target: HTMLElement): "down" | "up";
    static inView(target: HTMLElement, margin?: number): boolean;
    static onTop(target: HTMLElement): boolean;
    static ring(target: HTMLElement, { className, ms }?: {
        className?: string | undefined;
        ms?: number | undefined;
    }): void;
    static whenStill(target: HTMLElement, done: () => void): void;
}

export declare class ScreenImage {
    static readonly maxEdge = 1568;
    static readonly quality = 0.85;
    static readonly loadMs = 10000;
    static find(src: string, root?: HTMLElement): HTMLImageElement | null;
    static view(image: HTMLImageElement): Promise<ScreenImageView>;
    static publiclyFetchable(url: string): boolean;
}

export interface ScreenImageView {
    attachment: MessageAttachment;
    size: string;
}

export interface ScreenReadOptions {
    images?: boolean;
}

export declare class ScreenReader {
    static readonly limit = 8000;
    static read(root?: HTMLElement | null, options?: ScreenReadOptions): string;
    static readFrom(heading: HTMLElement, root?: HTMLElement | null, options?: ScreenReadOptions): string;
    static anchorOf(heading: HTMLElement): string;
    constructor({ images }?: ScreenReadOptions);
}

export declare class ScreenSettle {
    static wait({ quietMs, appearMs, timeoutMs }?: ScreenSettleOptions): Promise<void>;
}

export interface ScreenSettleOptions {
    quietMs?: number;
    appearMs?: number;
    timeoutMs?: number;
}

export declare class ScreenTarget {
    static container(name: string, root?: HTMLElement | null): HTMLElement | null;
    static control(name: string, root?: HTMLElement | null): HTMLElement | null;
    static controls(name: string, root?: HTMLElement | null): HTMLElement[];
    static heading(text: string, root?: HTMLElement | null): HTMLElement | null;
    static find(name: string, root?: HTMLElement | null): HTMLElement | null;
    static containerNames(root?: HTMLElement | null): string[];
    static anchorNames(root?: HTMLElement | null): string[];
    static targetNames(root?: HTMLElement | null): string[];
    static linkedRoutes(root?: HTMLElement | null): string[];
    static routeOf(href: string): string;
    static visible(el: HTMLElement): boolean;
}

export interface SearchMeta {
    kind: "search";
    key: string;
    paramKey: string;
    parseSearch: (searchParams: SearchParamsState) => unknown;
    getDefault: () => unknown;
}

export interface SearchOptions<T> {
    default?: (() => T) | T;
    nullable?: boolean;
}

export type SearchParamsState = Record<string, string | string[]>;

export interface SerializedStoreState {
    type: "boolean" | "date" | "list" | "map" | "number" | "object" | "string" | "unknown";
    refName?: string;
    modelType?: "full" | "input" | "insight" | "light";
    derived: boolean;
    role?: SliceStateKey;
}

export interface SetGet<State = any> {
    set: (setState: ((state: State) => void) | Partial<State>) => void;
    get: () => State;
    pick: PickFunc<State>;
}

export interface SetGetWritable<WritableState = any, State = WritableState> {
    set: (setState: ((state: WritableState) => void) | Partial<WritableState>) => void;
    get: () => State;
    pick: PickFunc<State>;
}

export interface SetPick<State = any> {
    set: (setState: ((state: State) => void) | Partial<State>) => void;
    pick: PickFunc<State>;
}

export type SliceAction<RefName extends string, Suffix extends string, Input, Light, QueryArgs extends any[], Filter extends FilterInstance, _CapitalizedRefName extends string = Capitalize<RefName>, _CapitalizedSuffix extends string = Capitalize<Suffix>, _Sort = ExtractSort<Filter>, _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Filter> & FetchPolicy> = {
    [KDefaultOf in `init${_CapitalizedRefName}${_CapitalizedSuffix}`]: (...args: [
        ...args: QueryArgs,
        initForm?: _FetchInitFormWithFetchPolicy
    ]) => Promise<void>;
} & {
    [K in `refresh${_CapitalizedRefName}${_CapitalizedSuffix}`]: (initForm?: _FetchInitFormWithFetchPolicy & {
        queryArgs?: QueryArgs;
    }) => Promise<void>;
} & {
    [K in `select${_CapitalizedRefName}${_CapitalizedSuffix}`]: (model: Light | Light[], options?: {
        refresh?: boolean;
        remove?: boolean;
    }) => void;
} & {
    [K in `setPageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (page: number, options?: FetchPolicy) => Promise<void>;
} & {
    [K in `loadMoreOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (options?: FetchPolicy) => Promise<void>;
} & {
    [K in `setLimitOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (limit: number, options?: FetchPolicy) => Promise<void>;
} & {
    [K in `setQueryArgsOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (...args: [
        ...args: QueryArgs,
        options?: FetchPolicy
    ] | [
        setQueryArgs: (...prevQueryArgs: QueryArgs) => QueryArgs,
        options?: FetchPolicy
    ]) => Promise<void>;
} & {
    [K in `setSortOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (sort: _Sort, options?: FetchPolicy) => Promise<void>;
};

export type SliceActionKey = "applyLiveModel" | "initModel" | "loadMoreOfModel" | "refreshModel" | "selectModel" | "setLimitOfModel" | "setPageOfModel" | "setQueryArgsOfModel" | "setSortOfModel" | "watchLiveModel";

export interface SliceActionRole {
    role: SliceActionKey;
    refName: string;
    sliceName: string;
    args: SerializedArg[];
}

export type SliceState<RefName extends string, Suffix extends string, Full, Light extends {
    id: string;
}, Args, Insight, Filter extends FilterInstance, _CapitalizedRefName extends string = Capitalize<RefName>, _CapitalizedSuffix extends string = Capitalize<Suffix>, _Default = DefaultOf<Full>, _Sort = ExtractSort<Filter>> = {
    [K in `default${_CapitalizedRefName}${_CapitalizedSuffix}`]: _Default;
} & {
    [K in `${RefName}List${_CapitalizedSuffix}`]: DataList<Light>;
} & {
    [K in `${RefName}ListLoading${_CapitalizedSuffix}`]: boolean;
} & {
    [K in `${RefName}InitList${_CapitalizedSuffix}`]: DataList<Light>;
} & {
    [K in `${RefName}InitAt${_CapitalizedSuffix}`]: Date;
} & {
    [K in `${RefName}StaleAt${_CapitalizedSuffix}`]: Date;
} & {
    [K in `${RefName}Selection${_CapitalizedSuffix}`]: DataList<Light>;
} & {
    [K in `${RefName}Insight${_CapitalizedSuffix}`]: Insight;
} & {
    [K in `lastPageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: number;
} & {
    [K in `pageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: number;
} & {
    [K in `limitOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: number;
} & {
    [K in `hasInsightOf${_CapitalizedRefName}${_CapitalizedSuffix}` | `hasMoreOf${_CapitalizedRefName}${_CapitalizedSuffix}` | `isCumulativeOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: boolean;
} & {
    [K in `queryArgsOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: Args;
} & {
    [K in `sortOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: _Sort;
};

export type SliceStateAction<RefName extends string = string, Suffix extends string = "", SliceName extends string = StoreSliceName<RefName, Suffix>, State = any, Action = any> = Action & {
    refName: RefName;
    suffix: Suffix;
    sliceName: SliceName;
    get: () => State;
    set: (setState: ((state: State) => void) | Partial<State>) => void;
};

export type SliceStateKey = "defaultModel" | "hasInsightOfModel" | "hasMoreOfModel" | "isCumulativeOfModel" | "lastPageOfModel" | "limitOfModel" | "modelInitAt" | "modelInitList" | "modelInsight" | "modelList" | "modelListLoading" | "modelSelection" | "modelStaleAt" | "pageOfModel" | "queryArgsOfModel" | "sortOfModel";

export interface SliceStateRole {
    role: SliceStateKey;
    refName: string;
    sliceName: string;
}

export interface StAgentic {
    useState: <T extends AgentFieldType>(name: null | string, type: T, meta?: StStateMeta) => StStateDraft<T>;
    expose: <T extends AgentFieldType>(name: null | string, type: T, meta?: StExposeMeta) => StExposeDraft<T>;
    tool: (name: null | string, meta?: StToolMeta) => StToolDraft;
}

export declare class StExposeBuilder<T extends AgentFieldType> {
    constructor(name: null | string, type: T, desc: string, meta?: StExposeMeta);
    value(value: (() => AgentValueOf<T>) | AgentValueOf<T> | null | undefined): void;
}

export declare class StExposeDraft<T extends AgentFieldType> {
    constructor(name: null | string, type: T, meta?: StExposeMeta);
    desc(text: string): StExposeBuilder<T>;
}

export interface StExposeMeta {
    report?: boolean;
}

export declare class StStateBuilder<T extends AgentFieldType> {
    constructor(name: null | string, type: T, desc: string, meta?: StStateMeta);
    init(initial: (() => AgentValueOf<T>) | AgentValueOf<T>): [
        AgentValueOf<T>,
        Dispatch<SetStateAction<AgentValueOf<T>>>
    ];
    init(initial: (() => AgentValueOf<T> | null) | AgentValueOf<T> | null): [
        AgentValueOf<T> | null,
        Dispatch<SetStateAction<AgentValueOf<T> | null>>
    ];
}

export declare class StStateDraft<T extends AgentFieldType> {
    constructor(name: null | string, type: T, meta?: StStateMeta);
    desc(text: string): StStateBuilder<T>;
}

export interface StStateMeta {
    report?: boolean;
    set?: boolean;
}

export interface StToolArgOption<V> {
    oneOf?: readonly V[];
}

export type StToolArgType = ParamFieldType | readonly [
    ParamFieldType
];

export declare class StToolBuilder<Args extends unknown[] = [
]> {
    constructor(name: null | string, desc: string, meta?: StToolMeta, args?: StToolArg[]);
    arg<T extends StToolArgType>(name: string, type: T): StToolBuilder<[
        ...Args,
        ArgValue<T>
    ]>;
    arg<T extends StToolArgType, const V extends ElementValue<T>>(name: string, type: T, option: StToolArgOption<V>): StToolBuilder<[
        ...Args,
        NarrowedValue<T, V>
    ]>;
    opt<T extends StToolArgType>(name: string, type: T): StToolBuilder<[
        ...Args,
        ArgValue<T> | null
    ]>;
    opt<T extends StToolArgType, const V extends ElementValue<T>>(name: string, type: T, option: StToolArgOption<V>): StToolBuilder<[
        ...Args,
        NarrowedValue<T, V> | null
    ]>;
    exec(run: (...args: Args) => unknown): (...args: Args) => Promise<void>;
    card(render: (control: StToolCardControl, ...args: Args) => ReactNode): void;
    static parametersOf(args: StToolArg[]): JsonSchema | undefined;
    static schemaOf(type: ParamFieldType): JsonSchema;
    static positionalOf(toolName: string, args: StToolArg[], named: Record<string, unknown>): unknown[];
    static checkedValue(toolName: string, argName: string, type: StToolArgType, value: unknown, oneOf?: readonly (number | string)[]): unknown;
}

export interface StToolCardControl {
    submit: (value: unknown) => void;
    cancel: (reason?: string) => void;
}

export declare class StToolDraft {
    constructor(name: null | string, meta?: StToolMeta);
    desc(text: string): StToolBuilder;
}

export interface StToolMeta {
    settle?: boolean;
    confirm?: ToolConfirm;
    taint?: ToolEntry["taint"];
    guard?: ToolGuard;
    label?: string;
}

export interface StateDerivedMeta {
    drafts: Record<string, DraftMeta>;
    persistSession: Record<string, PersistSessionMeta>;
    search: Record<string, SearchMeta>;
    computed: Record<string, ComputedMeta>;
    derivedKeys: Set<string>;
}

export type StateInitializer = () => unknown;

export type StateInitializerMap = Record<string, StateInitializer>;

export declare class StoreCatalogue {
    readonly state: {
        [key: string]: SerializedStoreState;
    };
    readonly refusals: AgentRefusal[];
    constructor(instance: StoreInstance);
}

export type StoreCls<RefName extends string = string, WritableState = any, Action = unknown, SlceCls extends SliceCls = any, DerivedState = unknown, State = WritableState & DerivedState, _Input = _StoreInput<SlceCls>, _Full = _StoreFull<SlceCls>, _Light extends {
    id: string;
} = _StoreLight<SlceCls>, _Insight = _StoreInsight<SlceCls>, _Filter extends FilterInstance = _StoreFilter<SlceCls>, _CapitalizedRefName extends string = _StoreCap<SlceCls>, _Default = _StoreDefault<SlceCls>, _Sort = _StoreSort<SlceCls>> = Cls<SetGetWritable<WritableState, State> & Action & {
    slice: {
        [Suffix in keyof _SliceMap<SlceCls> as Suffix extends string ? StoreSliceName<RefName, Suffix> : never]: StoreSliceOf<SlceCls, RefName, Suffix, _Input, _Full, _Light, _Insight, _Filter, _CapitalizedRefName, _Default, _Sort>;
    };
}, {
    readonly type: "module";
    readonly refName: RefName;
    [STATE_META]: State;
    [STATE_INIT_META]: StateInitializerMap;
    [STATE_DERIVED_META]: StateDerivedMeta;
    [ACTION_META]: {
        [key: string]: (...args: any[]) => any;
    };
    [ACTION_OWNER_META]: {
        [key: string]: ActionOwner;
    };
    slice: {
        [key: string]: SerializedSlice;
    };
    _slice: SlceCls[typeof SLICE_META];
}>;

export declare class StoreInstance {
    get: () => StoreStateRecord;
    set: (stateOrUpdater: ((state: StoreStateRecord) => void) | StoreStateRecord) => void;
    subscribe: (listener: () => void) => () => void;
    sub: {
        (listener: (state: StoreStateRecord, prev: StoreStateRecord) => void): () => void;
        <U>(selector: (state: StoreStateRecord) => U, listener: (state: U, prev: U) => void, options?: {
            equalityFn?: (a: U, b: U) => boolean;
            fireImmediately?: boolean;
        }): () => void;
    };
    sel: <U>(selector: (state: StoreStateRecord) => U, equals?: (a: U, b: U) => boolean) => U;
    retainLive: (key: string, scopeKey?: string, gate?: AgentGate | null) => void;
    releaseLive: (key: string, scopeKey?: string, gate?: AgentGate | null) => void;
    ref: <U>(selector: (state: StoreStateRecord) => U) => RefObject<U>;
    use: {
        [key: string]: (options?: StoreUseOptions) => unknown;
    };
    do: {
        [key: string]: StoreAction;
    };
    slice: {
        [key: string]: unknown;
    };
    get liveKeys(): ReadonlyMap<string, number>;
    liveKeysIn(viewKey: string): ReadonlyMap<string, number>;
    get actionOwners(): ReadonlyMap<string, ActionOwner>;
    get actionArity(): ReadonlyMap<string, number>;
    get sliceActionRoles(): ReadonlyMap<string, SliceActionRole>;
    get sliceStateRoles(): ReadonlyMap<string, SliceStateRole>;
    get derivedKeys(): ReadonlySet<string>;
    get generatedSetters(): ReadonlySet<string>;
    constructor(store?: RootStoreCls);
    addStore(store: RootStoreCls): this;
    flushDrafts: () => void;
}

export declare class StoreRegistry {
    static get instance(): StoreInstance;
    static register<StrCls extends StoreCls>(store: StrCls): StrCls;
    static get(refName: string): StoreCls | undefined;
    static get stores(): ReadonlyMap<string, StoreCls>;
    static merge<RefName extends string, StoreClses extends (RootStoreCls | StoreCls)[]>(refName: RefName, ...stores: StoreClses): RootStoreCls<RefName, MergeAllKeyOfObjects<StoreClses, typeof STATE_META>, MergeAllTypes<StoreClses, "slice" | keyof SetGet>, MergeAllKeyOfTypes<StoreClses, "slice">, MergeAllKeyOfObjects<StoreClses, "_slice">>;
    static build<RtStoreCls extends RootStoreCls>(store: RtStoreCls): WithSelectors<RtStoreCls>;
}

export type StoreReturn<Sig extends ClientSignal<any, any, any> | string, WritableState, LibStores extends StoreCls[], DerivedState = unknown, _LibState = MergeAllKeyOfObjects<LibStores, typeof STATE_META>, _LibAction = MergeAllActionTypes<LibStores, "slice" | keyof SetGet>> = ModelStore<Sig, WritableState & _LibState, _LibAction, DerivedState>;

export type StoreSliceArgs<SlceCls extends SliceCls, Suffix extends keyof StoreSliceMap<SlceCls>> = SliceInfoArgs<StoreSliceMap<SlceCls>[Suffix]>;

export type StoreSliceMap<SlceCls extends SliceCls> = SlceCls[typeof SLICE_META];

export type StoreSliceName<RefName extends string, Suffix extends string> = `${RefName}${Capitalize<Suffix>}`;

export type StoreSliceSuffix<SlceCls extends SliceCls, Suffix extends keyof StoreSliceMap<SlceCls>> = Suffix & string;

export type StoreSliceSuffixCap<SlceCls extends SliceCls, Suffix extends keyof StoreSliceMap<SlceCls>> = Capitalize<StoreSliceSuffix<SlceCls, Suffix>>;

export interface StoreSurface {
    bridge: AgentBridge;
    source: StoreSurfaceSource;
    surface: AgenticSurface;
}

export declare class StoreSurfaceSource implements SurfaceSource {
    static readonly builtins: readonly [
        "navigate",
        "goBack",
        "readScreen",
        "readState",
        "highlight",
        "viewImage"
    ];
    constructor(bridge?: AgentBridge);
    tools: (view?: string[]) => ToolEntry[];
}

export interface StoreUseOptions {
    agent?: boolean;
}

export interface Submit {
    disabled: boolean;
    loading: boolean;
    times: number;
}

export declare class ToolReturn {
    static readonly brand: unique symbol;
    readonly result: unknown;
    readonly attachments: MessageAttachment[];
    constructor(result: unknown, attachments: MessageAttachment[]);
    static attach(result: unknown, attachments: MessageAttachment[]): ToolReturn;
    static split(value: unknown): {
        result: unknown;
        attachments: MessageAttachment[];
    };
}

export type VoidActions<Action> = {
    [K in keyof Action]: VoidAction<Action[K]>;
};

export interface WritableStateBuilder {
    persist<T extends FieldTypeInput, Options extends PersistSessionOptions<any>>(type: T, options?: Options): {
        [STATE_BUILDER_MARK]: true;
        kind: "persist";
        type: T;
        options: Options;
    };
    session<T extends FieldTypeInput, Options extends PersistSessionOptions<any>>(type: T, options?: Options): {
        [STATE_BUILDER_MARK]: true;
        kind: "session";
        type: T;
        options: Options;
    };
}

export type WritableStateOf<State> = {
    [K in keyof State]: State[K] extends Marker ? MarkerValue<State[K]> : State[K];
};

export declare const actionTagOf: (value: unknown) => ActionTag | undefined;

export declare const attachAgentic: <T extends object>(instance: T) => T & StAgentic;

export declare const base: typeof BaseStore;

export declare const createDatabaseState: (refName: string) => {
    [x: string]: boolean | null | object | string;
};

export declare const createDerivedStateBuilder: <WritableState>() => DerivedStateBuilder<WritableState>;

export declare const createEmptyDerivedMeta: () => StateDerivedMeta;

export declare const createSliceState: (refName: string, slice: {
    [key: string]: SerializedSlice;
}) => Record<string, unknown>;

export declare const createStateInitializerMap: (state: Record<string, unknown>) => StateInitializerMap;

export declare const createWritableStateBuilder: () => WritableStateBuilder;

export declare const databaseStateModelTypes: {
    readonly model: "full";
    readonly modelForm: "input";
    readonly defaultModel: "full";
};

export declare const databaseStateNames: (refName: string) => {
    model: string;
    modelLoading: string;
    modelForm: string;
    modelFormLoading: string;
    modelFormUploading: string;
    modelSubmit: string;
    modelViewAt: string;
    modelModal: string;
    modelDraft: string;
    modelOperation: string;
    defaultModel: string;
};

export declare const draftMetaOf: (refName: string) => DraftMeta;

export declare const ensureStoreSurface: () => StoreSurface;

export declare const evaluateInitializers: (initializers: StateInitializerMap) => Record<string, unknown>;

export declare const formSetterNames: (className: string, key: string) => {
    field: string;
    Field: string;
    setFieldOnModel: string;
    addFieldOnModel: string;
    subFieldOnModel: string;
    addOrSubFieldOnModel: string;
    moveFieldOnModel: string;
    uploadFieldOnModel: string;
    postSetField: string;
};

export declare const formUploadOf: (setter: unknown) => FormUpload | null;

export declare const getBaseSearchParam: (searchParams: BaseSearchParamsState, key: string) => string;

export declare const getSearchParam: (searchParams: SearchParamsState, key: string) => string | undefined;

export declare const isStateBuilderMarker: (value: unknown) => value is Marker;

export declare const livePlacementIndex: ({ list, row, page, limit, count, cumulative, hasMore, sortKey, allowedSorts, sorts, }: LivePlacementProps) => null | number;

export declare const makeActions: (refName: string, slice: {
    [key: string]: SerializedSlice;
}, fetch: FetchProxy<any>) => {};

export declare const makeDefaultFactory: (value: unknown) => StateInitializer;

export declare const makeFormSetter: (refName: string, fetch: FetchProxy<any>) => {
    [x: string]: (this: SetGet, path: (number | string)[] | string, value: any) => void;
};

export declare const mergeDerivedMeta: (...metas: (StateDerivedMeta | undefined)[]) => StateDerivedMeta;

export declare const resolveDerivedState: <_WritableState>(state: Record<string, unknown>, writableKeys: Set<string>) => {
    shape: Record<string, unknown>;
    meta: StateDerivedMeta;
};

export declare const resolveWritableState: (refName: string, state: Record<string, unknown>) => {
    shape: Record<string, unknown>;
    initializers: StateInitializerMap;
    meta: StateDerivedMeta;
};

export declare const st: import("./agentic").StAgentic & {
    sub: {
        (listener: (state: import("./stateBuilder").WritableStateOf<{
            csrLoaded: boolean;
            path: string;
            pathname: string;
            params: {
                [key: string]: string;
            };
            searchParams: BaseSearchParamsState;
            theme: string;
            innerWidth: number;
            innerHeight: number;
            responsive: Responsive["value"];
            uiOperation: "idle" | "loading" | "sleep";
            messages: (typeof defaultMessage)[];
            tryJwt: null | string;
            trySignalType: SignalType;
            tryGuards: string[];
            tryAccount: Account<{
                [key: string]: string | undefined;
            }>;
            keyboardHeight: number;
            pageState: PageState;
            devMode: boolean;
            currentPath: string;
        }>, prev: import("./stateBuilder").WritableStateOf<{
            csrLoaded: boolean;
            path: string;
            pathname: string;
            params: {
                [key: string]: string;
            };
            searchParams: BaseSearchParamsState;
            theme: string;
            innerWidth: number;
            innerHeight: number;
            responsive: Responsive["value"];
            uiOperation: "idle" | "loading" | "sleep";
            messages: (typeof defaultMessage)[];
            tryJwt: null | string;
            trySignalType: SignalType;
            tryGuards: string[];
            tryAccount: Account<{
                [key: string]: string | undefined;
            }>;
            keyboardHeight: number;
            pageState: PageState;
            devMode: boolean;
            currentPath: string;
        }>) => void): () => void;
        <U>(selector: (state: import("./stateBuilder").WritableStateOf<{
            csrLoaded: boolean;
            path: string;
            pathname: string;
            params: {
                [key: string]: string;
            };
            searchParams: BaseSearchParamsState;
            theme: string;
            innerWidth: number;
            innerHeight: number;
            responsive: Responsive["value"];
            uiOperation: "idle" | "loading" | "sleep";
            messages: (typeof defaultMessage)[];
            tryJwt: null | string;
            trySignalType: SignalType;
            tryGuards: string[];
            tryAccount: Account<{
                [key: string]: string | undefined;
            }>;
            keyboardHeight: number;
            pageState: PageState;
            devMode: boolean;
            currentPath: string;
        }>) => U, listener: (state: U, prev: U) => void, options?: undefined | {
            equalityFn?: ((a: U, b: U) => boolean) | undefined;
            fireImmediately?: boolean;
        }): () => void;
    };
    ref: <U>(selector: (state: import("./stateBuilder").WritableStateOf<{
        csrLoaded: boolean;
        path: string;
        pathname: string;
        params: {
            [key: string]: string;
        };
        searchParams: BaseSearchParamsState;
        theme: string;
        innerWidth: number;
        innerHeight: number;
        responsive: Responsive["value"];
        uiOperation: "idle" | "loading" | "sleep";
        messages: (typeof defaultMessage)[];
        tryJwt: null | string;
        trySignalType: SignalType;
        tryGuards: string[];
        tryAccount: Account<{
            [key: string]: string | undefined;
        }>;
        keyboardHeight: number;
        pageState: PageState;
        devMode: boolean;
        currentPath: string;
    }>) => U) => import("react").RefObject<U>;
    sel: <U>(selector: (state: import("./stateBuilder").WritableStateOf<{
        csrLoaded: boolean;
        path: string;
        pathname: string;
        params: {
            [key: string]: string;
        };
        searchParams: BaseSearchParamsState;
        theme: string;
        innerWidth: number;
        innerHeight: number;
        responsive: Responsive["value"];
        uiOperation: "idle" | "loading" | "sleep";
        messages: (typeof defaultMessage)[];
        tryJwt: null | string;
        trySignalType: SignalType;
        tryGuards: string[];
        tryAccount: Account<{
            [key: string]: string | undefined;
        }>;
        keyboardHeight: number;
        pageState: PageState;
        devMode: boolean;
        currentPath: string;
    }>) => U, equals?: ((a: U, b: U) => boolean) | undefined) => U;
    use: {
        csrLoaded: (options?: import("./types").StoreUseOptions) => boolean;
        path: (options?: import("./types").StoreUseOptions) => string;
        pathname: (options?: import("./types").StoreUseOptions) => string;
        params: (options?: import("./types").StoreUseOptions) => {
            [key: string]: string;
        };
        searchParams: (options?: import("./types").StoreUseOptions) => BaseSearchParamsState;
        theme: (options?: import("./types").StoreUseOptions) => string;
        innerWidth: (options?: import("./types").StoreUseOptions) => number;
        innerHeight: (options?: import("./types").StoreUseOptions) => number;
        responsive: (options?: import("./types").StoreUseOptions) => "lg" | "md" | "sm" | "xl" | "xs";
        uiOperation: (options?: import("./types").StoreUseOptions) => "idle" | "loading" | "sleep";
        messages: (options?: import("./types").StoreUseOptions) => {
            type: "error" | "info" | "loading" | "success" | "warning";
            content: string;
            duration: number;
            key: string;
        }[];
        tryJwt: (options?: import("./types").StoreUseOptions) => null | string;
        trySignalType: (options?: import("./types").StoreUseOptions) => SignalType;
        tryGuards: (options?: import("./types").StoreUseOptions) => string[];
        tryAccount: (options?: import("./types").StoreUseOptions) => Account<{
            [key: string]: string | undefined;
        }>;
        keyboardHeight: (options?: import("./types").StoreUseOptions) => number;
        pageState: (options?: import("./types").StoreUseOptions) => PageState;
        devMode: (options?: import("./types").StoreUseOptions) => boolean;
        currentPath: (options?: import("./types").StoreUseOptions) => string;
    };
    do: import("./types").VoidActions<RootStore> & {
        setCsrLoaded: (value: boolean) => void;
        setPath: (value: string) => void;
        setPathname: (value: string) => void;
        setParams: (value: {
            [key: string]: string;
        }) => void;
        setSearchParams: (value: BaseSearchParamsState) => void;
        setTheme: (value: string) => void;
        setInnerWidth: (value: number) => void;
        setInnerHeight: (value: number) => void;
        setResponsive: (value: "lg" | "md" | "sm" | "xl" | "xs") => void;
        setUiOperation: (value: "idle" | "loading" | "sleep") => void;
        setMessages: (value: {
            type: "error" | "info" | "loading" | "success" | "warning";
            content: string;
            duration: number;
            key: string;
        }[]) => void;
        setTryJwt: (value: null | string) => void;
        setTrySignalType: (value: SignalType) => void;
        setTryGuards: (value: string[]) => void;
        setTryAccount: (value: Account<{
            [key: string]: string | undefined;
        }>) => void;
        setKeyboardHeight: (value: number) => void;
        setPageState: (value: PageState) => void;
        setDevMode: (value: boolean) => void;
        setCurrentPath: (value: string) => void;
    };
    get: () => import("./stateBuilder").WritableStateOf<{
        csrLoaded: boolean;
        path: string;
        pathname: string;
        params: {
            [key: string]: string;
        };
        searchParams: BaseSearchParamsState;
        theme: string;
        innerWidth: number;
        innerHeight: number;
        responsive: Responsive["value"];
        uiOperation: "idle" | "loading" | "sleep";
        messages: (typeof defaultMessage)[];
        tryJwt: null | string;
        trySignalType: SignalType;
        tryGuards: string[];
        tryAccount: Account<{
            [key: string]: string | undefined;
        }>;
        keyboardHeight: number;
        pageState: PageState;
        devMode: boolean;
        currentPath: string;
    }>;
    set: (state: ((state: import("./stateBuilder").WritableStateOf<{
        csrLoaded: boolean;
        path: string;
        pathname: string;
        params: {
            [key: string]: string;
        };
        searchParams: BaseSearchParamsState;
        theme: string;
        innerWidth: number;
        innerHeight: number;
        responsive: Responsive["value"];
        uiOperation: "idle" | "loading" | "sleep";
        messages: (typeof defaultMessage)[];
        tryJwt: null | string;
        trySignalType: SignalType;
        tryGuards: string[];
        tryAccount: Account<{
            [key: string]: string | undefined;
        }>;
        keyboardHeight: number;
        pageState: PageState;
        devMode: boolean;
        currentPath: string;
    }>) => any) | Partial<import("./stateBuilder").WritableStateOf<{
        csrLoaded: boolean;
        path: string;
        pathname: string;
        params: {
            [key: string]: string;
        };
        searchParams: BaseSearchParamsState;
        theme: string;
        innerWidth: number;
        innerHeight: number;
        responsive: Responsive["value"];
        uiOperation: "idle" | "loading" | "sleep";
        messages: (typeof defaultMessage)[];
        tryJwt: null | string;
        trySignalType: SignalType;
        tryGuards: string[];
        tryAccount: Account<{
            [key: string]: string | undefined;
        }>;
        keyboardHeight: number;
        pageState: PageState;
        devMode: boolean;
        currentPath: string;
    }>>) => void;
    slice: {
        [x: `base${Capitalize<string>}`]: import("./withSelector").SliceSelectors<"base", import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>, {
            [x: `init${any}`]: (...args: any[]) => Promise<void>;
        } & {
            [x: `refresh${any}`]: (initForm?: (import("akanjs/fetch").FetchInitForm<any, any> & import("akanjs/common").FetchPolicy<unknown> & {
                queryArgs?: any[] | undefined;
            }) | undefined) => Promise<void>;
        } & {
            [x: `select${any}`]: (model: any, options?: {
                refresh?: boolean;
                remove?: boolean;
            }) => void;
        } & {
            [x: `setPageOf${any}`]: (page: number, options?: import("akanjs/common").FetchPolicy) => Promise<void>;
        } & {
            [x: `loadMoreOf${any}`]: (options?: import("akanjs/common").FetchPolicy) => Promise<void>;
        } & {
            [x: `setLimitOf${any}`]: (limit: number, options?: import("akanjs/common").FetchPolicy) => Promise<void>;
        } & {
            [x: `setQueryArgsOf${any}`]: (...args: [
                setQueryArgs: (...prevQueryArgs: any[]) => any[],
                options?: import("akanjs/common").FetchPolicy<unknown> | undefined
            ] | any[]) => Promise<void>;
        } & {
            [x: `setSortOf${any}`]: (sort: any, options?: import("akanjs/common").FetchPolicy) => Promise<void>;
        } & {
            refName: "base";
            suffix: string;
            sliceName: `base${Capitalize<string>}`;
            get: () => import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>;
            set: (setState: ((state: import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>) => void) | Partial<import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>>) => void;
        }>;
    };
};

export declare function store<Sig extends ClientSignal<any, any, any> | string, State, LibStores extends StoreCls[]>(sigRefOrRefName: Sig, state: StateFactory<State>, ...libStores: LibStores): StoreReturn<Sig, WritableStateOf<State>, LibStores>;
export declare function store<Sig extends ClientSignal<any, any, any> | string, State, DerivedState, LibStores extends StoreCls[]>(sigRefOrRefName: Sig, state: StateFactory<State>, derivedState: DerivedStateFactory<WritableStateOf<State>, DerivedState>, ...libStores: LibStores): StoreReturn<Sig, WritableStateOf<State>, LibStores, DerivedStateOf<DerivedState>>;

export declare const tagAction: <T extends (...args: never[]) => unknown>(fn: T, tag: ActionTag) => T;

export declare const useAgentReference: () => <T extends AgentFieldType>({ type, value, ...pointer }: AgentReferenceInput<T>) => void;

export declare const useFieldTool: (onChange: unknown, { transform, disabled, sortable }?: FieldToolOptions) => void;

export declare const useFileFieldTool: <T extends {
    id: string;
}>(onChange: unknown, { read, label, max, min, disabled }: FileFieldSource<T>) => void;

export declare const useFormTools: (refName: null | string, write: (action: string, value: unknown) => void) => void;

export declare const useRelationFieldTool: <T extends {
    id: string;
}>(onChange: unknown, { read, load, label, disabled }: RelationFieldSource<T>) => void;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface AgentCall {
    name: string;
    args: Record<string, unknown>;
    at: Date;
    error?: string;
}

declare class AgentGate {
    constructor(active: boolean, onChange: () => void, parent?: AgentGate | null);
    get active(): boolean;
    set(active: boolean): void;
}

interface AgentProgressReport {
    message: string;
    done?: number;
    total?: number;
    steps?: AgentProgressStep[];
}

type AgentSingleType = ConstantModelRef | EnumInstance<string, any> | typeof PrimitiveScalar;

declare class AgenticSurface {
    static get shared(): AgenticSurface;
    static sanitize(part: string): string;
    static childPath(parent: string[], id: string): string[];
    static fullName(scope: string[], name: string): string;
    get version(): number;
    subscribe(listener: () => void): () => void;
    registerTool(scope: string[], entry: ToolEntry, gate?: AgentGate | null): () => void;
    registerResource(scope: string[], entry: ResourceEntry, gate?: AgentGate | null): () => void;
    openScope(parent: string[], scope: ScopeEntry, gate?: AgentGate | null): () => void;
    registerGuide(scope: string[], text: string, gate?: AgentGate | null): () => void;
    addSource(source: SurfaceSource): () => void;
    gate(active: boolean, parent?: AgentGate | null): AgentGate;
    gated(gate: AgentGate, guideGate?: AgentGate | null): AgenticSurface;
    snapshot(view?: string[]): SurfaceSnapshot;
    view(path: string[]): SurfaceView;
    tool(name: string, view?: string[]): ToolEntry | null;
    declares(name: string, view?: string[]): boolean;
    get transcript(): readonly AgentCall[];
    call(name: string, args?: Record<string, unknown>, view?: string[]): Promise<unknown>;
    read(name: string, view?: string[]): unknown;
    diffSince(before: SurfaceSnapshot, view?: string[]): ResourceDiff[];
}

type ArgValue<T> = T extends readonly [
    unknown
] ? ElementValue<T>[] : ElementValue<T>;

type ArrayFieldAddOrSubSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
    [K in keyof _DefaultState as _DefaultState[K] extends any[] ? K extends string ? SetterKey<"addOrSub", K, RefName, _CapRef> : never : never]: (value: DefaultOf<SingleOf<_DefaultState[K]>>, options?: {
        idx?: number;
        limit?: number;
    }) => void;
};

type ArrayFieldAddSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
    [K in keyof _DefaultState as _DefaultState[K] extends any[] ? K extends string ? SetterKey<"add", K, RefName, _CapRef> : never : never]: (value: DefaultOf<SingleOf<_DefaultState[K]>> | DefaultOf<SingleOf<_DefaultState[K]>>[], options?: {
        idx?: number;
        limit?: number;
    }) => void;
};

type ArrayFieldSubSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
    [K in keyof _DefaultState as _DefaultState[K] extends any[] ? K extends string ? SetterKey<"sub", K, RefName, _CapRef> : never : never]: (idx: number | number[]) => void;
};

type BaseAction<RefName extends string, Input, Full extends {
    id: string;
}, Light, _CapitalizedRefName extends string = Capitalize<RefName>, _CreateOption = CreateOption<Full>, _InputData = GetStateObject<Input>> = {
    [K in `create${_CapitalizedRefName}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
    [K in `update${_CapitalizedRefName}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
    [K in `create${_CapitalizedRefName}`]: (data: _InputData, options?: _CreateOption) => Promise<void>;
} & {
    [K in `update${_CapitalizedRefName}`]: (id: string, data: _InputData, options?: _CreateOption) => Promise<void>;
} & {
    [K in `remove${_CapitalizedRefName}`]: (id: string, options?: FetchPolicy & {
        modal?: null | string;
    }) => Promise<void>;
} & {
    [K in `check${_CapitalizedRefName}Submitable`]: (disabled?: boolean) => Promise<void>;
} & {
    [K in `submit${_CapitalizedRefName}`]: (options?: _CreateOption) => Promise<void>;
} & {
    [K in `new${_CapitalizedRefName}`]: (partial?: PartialOrNull<Full>, options?: NewOption) => void;
} & {
    [K in `edit${_CapitalizedRefName}`]: (model: Full | string, options?: EditOption & FetchPolicy) => Promise<void>;
} & {
    [K in `load${_CapitalizedRefName}FormDraft`]: (draftScope?: string) => Promise<void>;
} & {
    [K in `restore${_CapitalizedRefName}FormDraft`]: () => void;
} & {
    [K in `discard${_CapitalizedRefName}FormDraft`]: () => void;
} & {
    [K in `merge${_CapitalizedRefName}`]: (model: Full | string, data: Partial<Full>, options?: FetchPolicy) => Promise<void>;
} & {
    [K in `view${_CapitalizedRefName}`]: (model: Full | string, options?: {
        modal?: null | string;
    } & FetchPolicy) => Promise<void>;
} & {
    [K in `set${_CapitalizedRefName}`]: (...models: (Full | Light)[]) => void;
} & {
    [K in `reset${_CapitalizedRefName}`]: (model?: Full) => void;
} & {
    [K in `invalidate${_CapitalizedRefName}`]: () => void;
};

type BaseState<RefName extends string, Full, _Default = DefaultOf<Full>> = {
    [K in RefName]: Full | null;
} & {
    [K in `${RefName}Loading`]: boolean | string;
} & {
    [K in `${RefName}Form`]: _Default;
} & {
    [K in `${RefName}FormLoading`]: boolean | string;
} & {
    [K in `${RefName}FormUploading`]: FormUploading<_Default>;
} & {
    [K in `${RefName}Submit`]: Submit;
} & {
    [K in `${RefName}ViewAt`]: Date;
} & {
    [K in `${RefName}Modal`]: null | string;
} & {
    [K in `${RefName}FormDraft`]: DraftState | null;
} & {
    [K in `${RefName}Operation`]: "error" | "idle" | "loading" | "reset" | "sleep";
};

declare const BaseStore_base: import("./store").StoreCls<"base", import("./stateBuilder").WritableStateOf<{
    csrLoaded: boolean;
    path: string;
    pathname: string;
    params: {
        [key: string]: string;
    };
    searchParams: BaseSearchParamsState;
    theme: string;
    innerWidth: number;
    innerHeight: number;
    responsive: Responsive["value"];
    uiOperation: "idle" | "loading" | "sleep";
    messages: (typeof defaultMessage)[];
    tryJwt: null | string;
    trySignalType: SignalType;
    tryGuards: string[];
    tryAccount: Account<{
        [key: string]: string | undefined;
    }>;
    keyboardHeight: number;
    pageState: PageState;
    devMode: boolean;
    currentPath: string;
}>, unknown, any, unknown, import("./stateBuilder").WritableStateOf<{
    csrLoaded: boolean;
    path: string;
    pathname: string;
    params: {
        [key: string]: string;
    };
    searchParams: BaseSearchParamsState;
    theme: string;
    innerWidth: number;
    innerHeight: number;
    responsive: Responsive["value"];
    uiOperation: "idle" | "loading" | "sleep";
    messages: (typeof defaultMessage)[];
    tryJwt: null | string;
    trySignalType: SignalType;
    tryGuards: string[];
    tryAccount: Account<{
        [key: string]: string | undefined;
    }>;
    keyboardHeight: number;
    pageState: PageState;
    devMode: boolean;
    currentPath: string;
}>, any, any, any, any, any, any, any, any>;

type DefaultSliceActionFields<SlceCls extends SliceCls, _CapRef extends string, _FetchInitFormWithFetchPolicy, _Light, _Sort, _Suffixes extends keyof _SliceMap<SlceCls> = keyof _SliceMap<SlceCls>> = {
    [Suffix in _Suffixes as `init${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (...args: [
        ...args: StoreSliceArgs<SlceCls, Suffix>,
        initForm?: _FetchInitFormWithFetchPolicy
    ]) => Promise<void>;
} & {
    [Suffix in _Suffixes as `refresh${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (initForm?: SliceRefreshForm<SlceCls, Suffix>) => Promise<void>;
} & {
    [Suffix in _Suffixes as `select${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (model: _Light | _Light[], options?: {
        refresh?: boolean;
        remove?: boolean;
    }) => void;
} & {
    [Suffix in _Suffixes as `setLimitOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}` | `setPageOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (value: number, options?: FetchPolicy) => Promise<void>;
} & {
    [Suffix in _Suffixes as `loadMoreOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (options?: FetchPolicy) => Promise<void>;
} & {
    [Suffix in _Suffixes as `setQueryArgsOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (...args: [
        ...args: StoreSliceArgs<SlceCls, Suffix>,
        options?: FetchPolicy
    ] | [
        setQueryArgs: (...prevQueryArgs: StoreSliceArgs<SlceCls, Suffix>) => StoreSliceArgs<SlceCls, Suffix>,
        options?: FetchPolicy
    ]) => Promise<void>;
} & {
    [Suffix in _Suffixes as `setSortOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (sort: _Sort, options?: FetchPolicy) => Promise<void>;
};

type DefaultSliceStateFields<SlceCls extends SliceCls, _RefName extends string, _CapRefName extends string, _Full, _Light extends {
    id: string;
}, _Insight, _Default, _Sort, _Suffixes extends keyof _SliceMap<SlceCls> = keyof _SliceMap<SlceCls>> = {
    [Suffix in _Suffixes as `default${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: _Default;
} & {
    [Suffix in _Suffixes as `${_RefName}InitList${StoreSliceSuffixCap<SlceCls, Suffix>}` | `${_RefName}List${StoreSliceSuffixCap<SlceCls, Suffix>}` | `${_RefName}Selection${StoreSliceSuffixCap<SlceCls, Suffix>}`]: DataList<_Light>;
} & {
    [Suffix in _Suffixes as `${_RefName}InitAt${StoreSliceSuffixCap<SlceCls, Suffix>}` | `${_RefName}StaleAt${StoreSliceSuffixCap<SlceCls, Suffix>}`]: Date;
} & {
    [Suffix in _Suffixes as `${_RefName}ListLoading${StoreSliceSuffixCap<SlceCls, Suffix>}`]: boolean;
} & {
    [Suffix in _Suffixes as `${_RefName}Insight${StoreSliceSuffixCap<SlceCls, Suffix>}`]: _Insight;
} & {
    [Suffix in _Suffixes as `lastPageOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}` | `limitOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}` | `pageOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: number;
} & {
    [Suffix in _Suffixes as `hasInsightOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}` | `hasMoreOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}` | `isCumulativeOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: boolean;
} & {
    [Suffix in _Suffixes as `queryArgsOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: StoreSliceArgs<SlceCls, Suffix>;
} & {
    [Suffix in _Suffixes as `sortOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: _Sort;
};

type DerivedStateFactory<WritableState, DerivedState> = (builder: DerivedStateBuilder<WritableState>) => DerivedState;

type ElementValue<T> = T extends readonly [
    infer E
] ? ScalarValue<E> : ScalarValue<T>;

type FieldFormSetter<DefaultState, RefName extends string, _CapitalizedRefName extends string = Capitalize<RefName>> = {
    [Key in keyof DefaultState as Key extends string ? SetterKey<"set", Key, RefName, _CapitalizedRefName> : never]: (value: (DefaultState[Key] extends any[] ? never : null) | FieldState<DefaultState[Key]>) => void;
};

type FieldTypeInput = Cls | EnumInstance | FieldTypeInput[] | PrimitiveInput;

type FormSetter<Full, RefName extends string, _CapitalizedRefName extends string = Capitalize<RefName>, _DefaultState = DefaultOf<Full>> = FieldFormSetter<_DefaultState, RefName, _CapitalizedRefName> & ArrayFieldAddSetters<RefName, _CapitalizedRefName, _DefaultState> & ArrayFieldSubSetters<RefName, _CapitalizedRefName, _DefaultState> & ArrayFieldAddOrSubSetters<RefName, _CapitalizedRefName, _DefaultState> & {
    [K in keyof _DefaultState as _DefaultState[K] extends (ProtoLightFile | null) | ProtoLightFile[] ? K extends string ? SetterKey<"upload", K, RefName, _CapitalizedRefName> : never : never]: (fileList: FileList | File[], idx?: number) => Promise<void>;
} & {
    [K in `writeOn${_CapitalizedRefName}`]: (path: (number | string)[] | string, value: any) => void;
};

interface HeldFile {
    id: string;
}

type IsAny<T> = 0 extends 1 & T ? true : false;

type JsonSchema = Record<string, unknown>;

type Marker = {
    [STATE_BUILDER_MARK]: true;
    kind: "computed";
    deps: readonly string[];
    selector: (...values: any[]) => any;
    options: ComputedOptions<any>;
} | {
    [STATE_BUILDER_MARK]: true;
    kind: "persist" | "session";
    type: any;
    options: PersistSessionOptions<any>;
} | {
    [STATE_BUILDER_MARK]: true;
    kind: "search";
    paramKey: string;
    type: any;
    options: SearchOptions<any>;
};

type MarkerValue<M> = M extends {
    kind: "persist" | "session";
    type: infer T;
    options: infer O;
} ? NullableValue<ValueOfType<T>, O> : M extends {
    kind: "search";
    type: infer T;
    options: infer O;
} ? NullableValue<ValueOfType<T>, O> : M extends {
    kind: "computed";
    selector: (...args: any[]) => infer R;
} ? R : never;

type NarrowedValue<T, V> = T extends readonly [
    unknown
] ? V[] : V;

interface NewScopeInput {
    seed: object | undefined;
    modal: string;
    sliceName: string;
    routePath: string;
}

type NullableValue<Value, Options> = Options extends {
    nullable: true;
} ? Value | null : Value;

type PartialOrNull<O> = {
    [K in keyof O]?: O[K] | null;
};

type PickFunc<State, F extends keyof State = IsAny<State> extends true ? any : keyof State extends never ? any : keyof State> = (...fields: F[]) => {
    [K in (typeof fields)[number]]: Exclude<State[K], "loading" | null | undefined>;
};

type PrimitiveInput = BooleanConstructor | DateConstructor | StringConstructor | typeof PrimitiveScalar;

interface PublishedResource {
    name: string;
    description?: string;
    value?: unknown;
    error?: string;
}

interface PublishedScope {
    path: string;
    label?: string;
    kind?: string;
}

interface ResourceDiff {
    name: string;
    value?: unknown;
    error?: string;
    removed?: boolean;
}

interface ResourceEntry {
    name: string;
    description?: string;
    report?: boolean;
    read: () => unknown;
}

declare const RootStore_base: import("./rootStore").RootStoreCls<"root", import("./stateBuilder").WritableStateOf<{
    csrLoaded: boolean;
    path: string;
    pathname: string;
    params: {
        [key: string]: string;
    };
    searchParams: BaseSearchParamsState;
    theme: string;
    innerWidth: number;
    innerHeight: number;
    responsive: Responsive["value"];
    uiOperation: "idle" | "loading" | "sleep";
    messages: (typeof defaultMessage)[];
    tryJwt: null | string;
    trySignalType: SignalType;
    tryGuards: string[];
    tryAccount: Account<{
        [key: string]: string | undefined;
    }>;
    keyboardHeight: number;
    pageState: PageState;
    devMode: boolean;
    currentPath: string;
}>, Omit<BaseStore, "slice" | keyof import("./types").SetGet<any>>, {
    [x: `base${Capitalize<string>}`]: {
        [x: `init${any}`]: (...args: any[]) => Promise<void>;
    } & {
        [x: `refresh${any}`]: (initForm?: (import("akanjs/fetch").FetchInitForm<any, any> & import("akanjs/common").FetchPolicy<unknown> & {
            queryArgs?: any[] | undefined;
        }) | undefined) => Promise<void>;
    } & {
        [x: `select${any}`]: (model: any, options?: {
            refresh?: boolean;
            remove?: boolean;
        }) => void;
    } & {
        [x: `setPageOf${any}`]: (page: number, options?: import("akanjs/common").FetchPolicy) => Promise<void>;
    } & {
        [x: `loadMoreOf${any}`]: (options?: import("akanjs/common").FetchPolicy) => Promise<void>;
    } & {
        [x: `setLimitOf${any}`]: (limit: number, options?: import("akanjs/common").FetchPolicy) => Promise<void>;
    } & {
        [x: `setQueryArgsOf${any}`]: (...args: [
            setQueryArgs: (...prevQueryArgs: any[]) => any[],
            options?: import("akanjs/common").FetchPolicy<unknown> | undefined
        ] | any[]) => Promise<void>;
    } & {
        [x: `setSortOf${any}`]: (sort: any, options?: import("akanjs/common").FetchPolicy) => Promise<void>;
    } & {
        refName: "base";
        suffix: string;
        sliceName: `base${Capitalize<string>}`;
        get: () => import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>;
        set: (setState: ((state: import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>) => void) | Partial<import("./state").SliceState<"base", "", any, any, any[], any, any, any, "", any, any>>) => void;
    };
}, any>;

declare const STATE_BUILDER_MARK: unique symbol;

type ScalarValue<T> = T extends EnumInstance<string, infer V> ? V : T extends {
    [CLIENT_VALUE]: infer V;
} ? V : never;

interface ScopeEntry {
    id: string;
    label?: string;
    kind?: string;
}

type SetKey<Key extends string> = `set${Capitalize<Key>}`;

type SetterKey<Prefix extends string, Key extends string, RefName extends string, _CapitalizedRefName extends string = Capitalize<RefName>, _CapitalizedK extends string = Capitalize<Key>> = `${Prefix}${_CapitalizedK}On${_CapitalizedRefName}`;

type SingleOf<M> = M extends (infer V)[] ? V : never;

type SliceInitForm<S extends SliceCls> = FetchInitForm<_ActionInput<S>, _ActionFilter<S>> & FetchPolicy;

type SliceRefreshForm<S extends SliceCls, Suffix extends keyof _SliceMap<S>> = SliceInitForm<S> & {
    queryArgs?: StoreSliceArgs<S, Suffix>;
};

interface SliceSelectors<RefName extends string, State, Action> {
    refName: RefName;
    use: {
        [K in keyof State]: (options?: StoreUseOptions) => State[K];
    };
    do: Prettify<VoidActions<Action> & {
        [K in keyof State as K extends string ? SetKey<K> : never]: (value: FieldState<State[K]>) => void;
    }>;
    get: () => State;
}

interface StToolArg {
    name: string;
    type: StToolArgType;
    optional: boolean;
    oneOf?: readonly (number | string)[];
}

type StateFactory<State> = (builder: WritableStateBuilder) => State;

type StoreAction = (...args: unknown[]) => unknown;

type StoreSliceOf<SlceCls extends SliceCls, RefName extends string, Suffix extends keyof _SliceMap<SlceCls>, Input, Full, Light extends {
    id: string;
}, Insight, Filter extends FilterInstance, CapitalizedRefName extends string, Default, Sort> = InternalSlice<_SliceMap<SlceCls>[Suffix], RefName, StoreSliceSuffix<SlceCls, Suffix>, Input, Full, Light, Insight, Filter, CapitalizedRefName, Default, Sort>;

type StoreStateRecord = Record<string, unknown>;

interface SurfaceSnapshot {
    tools: PublishedTool[];
    resources: PublishedResource[];
    scopes: PublishedScope[];
    guides: string[];
}

interface SurfaceSource {
    tools?: (view?: string[]) => ToolEntry[];
    resources?: (view?: string[]) => ResourceEntry[];
    subscribe?: (listener: () => void) => () => void;
}

interface ToolActionEntry extends ToolEntryBase {
    run: (args: Record<string, unknown>) => unknown;
    card?: never;
}

interface ToolActivity {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    phase: "end" | "start";
    error?: string;
}

type ToolCard = (control: ToolCardControl) => ReactNode;

interface ToolCardControl {
    args: Record<string, unknown>;
    submit: (value: unknown) => void;
    cancel: (reason?: string) => void;
}

interface ToolCardEntry extends ToolEntryBase {
    card: ToolCard;
    run?: never;
}

type ToolConfirm = ((args: Record<string, unknown>) => boolean | string) | boolean | string;

type ToolEntry = ToolActionEntry | ToolCardEntry;

interface ToolEntryBase {
    name: string;
    description?: string;
    parameters?: JsonSchema;
    settle?: boolean;
    confirm?: ToolConfirm;
    taint?: "exempt" | "source";
    guard?: ToolGuard;
    label?: () => string | undefined;
}

type ToolGuard = (args: Record<string, unknown>) => string | true;

type ValueOfType<T> = T extends readonly (infer V)[] ? ValueOfType<V>[] : T extends {
    [DEFAULT_VALUE]: infer V;
} ? V : T extends EnumInstance<any, infer V> ? V : T extends new (...args: any[]) => infer V ? V : any;

type VoidAction<T> = T extends (...args: infer Args) => infer Ret ? [
    Ret
] extends [
    PromiseLike<unknown>
] ? (...args: Args) => Promise<void> : (...args: Args) => void : T;

type WithSelectors<RtStoreCls extends RootStoreCls> = RtStoreCls extends RootStoreCls<any, infer WritableState, infer Action, infer InternalSliceObj, any, any, infer State> ? WithSelectorsOf<State, WritableState, Action, InternalSliceObj> : never;

type WithSelectorsOf<State, WritableState, Action, InternalSliceObj> = StAgentic & {
    sub: {
        (listener: (state: State, prev: State) => void): () => void;
        <U>(selector: (state: State) => U, listener: (state: U, prev: U) => void, options?: {
            equalityFn?: (a: U, b: U) => boolean;
            fireImmediately?: boolean;
        }): () => void;
    };
    ref: <U>(selector: (state: State) => U) => RefObject<U>;
    sel: <U>(selector: (state: State) => U, equals?: (a: U, b: U) => boolean) => U;
    use: {
        [K in keyof State]: (options?: StoreUseOptions) => State[K];
    };
    do: VoidActions<Action> & {
        [K in keyof WritableState as K extends string ? SetKey<K> : never]: (value: FieldState<WritableState[K]>) => void;
    };
    get: () => State;
    set: (state: ((state: WritableState) => any) | Partial<WritableState>) => void;
    slice: {
        [K in keyof InternalSliceObj]: InternalSliceObj[K] extends SliceStateAction<infer RefName, infer _Suffix, infer _SliceName, infer State, infer Action> ? SliceSelectors<RefName, State, Action> : never;
    };
};

type _ActionCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;

type _ActionDefault<S extends SliceCls> = SlceCnstDefault<S>;

type _ActionDefaultInput<S extends SliceCls> = SlceCnstDefaultInput<S>;

type _ActionFilter<S extends SliceCls> = SlceDbFilter<S>;

type _ActionFull<S extends SliceCls> = SlceCnstFull<S>;

type _ActionInput<S extends SliceCls> = SlceCnstInput<S>;

type _ActionLight<S extends SliceCls> = SlceCnstLight<S>;

type _ActionRefName<S extends SliceCls> = SlceCnstRefName<S>;

type _ActionSort<S extends SliceCls> = SlceDbSort<S>;

// store/action
type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;

// store/state
type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;

// store/store
type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;

type _StateCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;

type _StateDefault<S extends SliceCls> = SlceCnstDefault<S>;

type _StateFilter<S extends SliceCls> = SlceDbFilter<S>;

type _StateFull<S extends SliceCls> = SlceCnstFull<S>;

type _StateInsight<S extends SliceCls> = SlceCnstInsight<S>;

type _StateLight<S extends SliceCls> = SlceCnstLight<S>;

type _StateRefName<S extends SliceCls> = SlceCnstRefName<S>;

type _StateSort<S extends SliceCls> = SlceDbSort<S>;

type _StoreCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;

type _StoreDefault<S extends SliceCls> = SlceCnstDefault<S>;

type _StoreFilter<S extends SliceCls> = SlceDbFilter<S>;

type _StoreFull<S extends SliceCls> = SlceCnstFull<S>;

type _StoreInput<S extends SliceCls> = SlceCnstInput<S>;

type _StoreInsight<S extends SliceCls> = SlceCnstInsight<S>;

type _StoreLight<S extends SliceCls> = SlceCnstLight<S>;

type _StoreSort<S extends SliceCls> = SlceDbSort<S>;

declare const defaultMessage: {
    type: "error" | "info" | "loading" | "success" | "warning";
    content: string;
    duration: number;
    key: string;
};
```
