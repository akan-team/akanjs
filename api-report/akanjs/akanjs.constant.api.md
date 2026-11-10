# `akanjs/constant`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class BaseInsight {
    count: number;
}

export declare class BaseObject {
    id: string;
    createdAt: Dayjs;
    updatedAt: Dayjs;
    removedAt: Dayjs | null;
}

export type CascadeAction = (typeof cascadeActions)[number];

export declare class CascadePaths {
    readonly removeRef: Map<string, ConstantModelRef>;
    readonly removeWith: Map<string, CascadeWithPath>;
    collect(fieldMap: FieldObject): this;
}

export interface CascadeWithPath {
    readonly key: string;
    readonly modelRef: ConstantModelRef | null;
    readonly refName: null | string;
    readonly typeKey: null | string;
    readonly typeValues: readonly string[];
    readonly anyOwner: boolean;
}

export type ConstantCls<Schema = any, FieldObj extends FieldObject = FieldObject, OwnSchema = Schema, OwnFieldObj extends FieldObject = FieldObj, ModelType extends ConstantType = ConstantType, _Channels extends ConstantKeyChannelMap = ConstantKeyChannels<FieldObj>> = (new (obj?: Partial<Schema>) => Schema & ConstantMethods<Schema>) & ConstantStatics<Schema, OwnSchema, OwnFieldObj, _Channels["optional"], _Channels["relation"], _Channels["primitive"], _Channels["scalar"], _Channels["enum"], _Channels["map"], _Channels["hidden"], _Channels["secret"], ModelType>;

export declare class ConstantField<FieldType extends ConstantFieldKind = ConstantFieldKind, _Value extends ConstantFieldTypeInput | null = any, FieldValue = any, MapValue = any, Nullable extends boolean = boolean, IsRelation extends boolean = boolean, IsEnum extends boolean = boolean, IsPrimitive extends boolean = boolean, IsScalar extends boolean = boolean, IsHidden extends boolean = boolean, IsSecret extends boolean = boolean, IsMap extends boolean = boolean, Metadata = {
    [key: string]: any;
}> implements ConstantFieldBuildProps<FieldType, FieldValue, MapValue, Metadata> {
    static getBaseModelField(): FieldObject;
    static getBaseInsightField(): FieldObject;
    readonly nullable: Nullable;
    readonly ref?: string;
    readonly refPath?: string;
    readonly refType?: "child" | "parent" | "relation";
    readonly default: ((doc: {
        id: string;
    }) => FieldValue) | FieldValue;
    readonly type?: FieldPreset;
    readonly fieldType: FieldType;
    readonly immutable: boolean;
    readonly min?: number;
    readonly max?: number;
    readonly enum?: EnumInstance;
    readonly select: boolean;
    readonly minlength?: number;
    readonly maxlength?: number;
    readonly accumulate?: any;
    readonly example?: FieldValue;
    readonly of?: MapValue;
    readonly validate?: (value: FieldValue, model: any) => boolean;
    readonly text?: TextFieldRole;
    readonly cascade?: CascadeAction;
    readonly visual: boolean;
    readonly modelRef: ConstantModelRef;
    readonly arrDepth: number;
    readonly optArrDepth: number;
    readonly meta: Metadata;
    _isScalar: IsScalar;
    _isRelation: IsRelation;
    _isEnum: IsEnum;
    _isPrimitive: IsPrimitive;
    _isHidden: IsHidden;
    _isSecret: IsSecret;
    _isMap: IsMap;
    constructor(props: ConstantFieldBuildProps<FieldType, FieldValue, MapValue, Metadata>);
    static fromFieldInfo<FieldType extends ConstantFieldKind = any, Value extends ConstantFieldTypeInput | null = null, FieldValue = any, MapValue = any, Nullable extends boolean = IsNullableValue<FieldInfoValue<Value, FieldValue, MapValue>>, KindSource = FieldKindSource<Value>, IsRelation extends boolean = false, IsEnum extends boolean = false, IsPrimitive extends boolean = false, IsMap extends boolean = false, IsScalar extends boolean = false, IsHidden extends boolean = false, IsSecret extends boolean = false, Metadata = {
        [key: string]: any;
    }>(fieldInfo: FieldInfo<FieldType, Value, FieldValue, MapValue, KindSource, IsRelation, IsEnum, IsPrimitive, IsMap, IsScalar, IsHidden, IsSecret>): ConstantField<FieldType, Value, FieldValue, MapValue, Nullable, IsRelation, IsEnum, IsPrimitive, IsScalar, IsHidden, IsSecret, IsMap, Metadata>;
    get isClass(): boolean;
    get isScalar(): boolean;
    get isArray(): boolean;
    get isMap(): boolean;
    getProps(): FieldProps;
}

export type ConstantFieldKind = "hidden" | "property" | "resolve" | "secret";

export interface ConstantFieldProps<FieldType extends ConstantFieldKind = ConstantFieldKind, FieldValue = any, MapValue = any, Metadata = {
    [key: string]: any;
}> {
    nullable?: boolean;
    ref?: string;
    refPath?: string;
    refType?: "child" | "parent" | "relation";
    default?: ((doc: {
        id: string;
    }) => FieldValue) | FieldValue;
    type?: FieldPreset;
    fieldType?: FieldType;
    immutable?: boolean;
    min?: number;
    max?: number;
    enum?: EnumInstance;
    select?: boolean;
    minlength?: number;
    maxlength?: number;
    accumulate?: any;
    example?: FieldValue;
    of?: MapValue;
    validate?: (value: FieldValue, model: any) => boolean;
    text?: TextFieldRole;
    cascade?: CascadeAction;
    visual?: boolean;
    meta?: Metadata;
}

export type ConstantFieldType = ConstantFieldEnumType | ConstantModelRef | MapConstructor | typeof PrimitiveScalar;

export type ConstantFieldTypeInput = ConstantFieldType | ConstantFieldType[] | ConstantFieldType[][] | ConstantFieldType[][][];

export interface ConstantMethods<Schema = any> {
    set(obj: Partial<Schema>): this;
}

export interface ConstantModel<T extends string = string, Input = any, Obj = any, Full = any, Light = any, Insight = any, FullFieldObj extends FieldObject = FieldObject, _CapitalizedRefName extends string = Capitalize<T>, _Default = DefaultOf<Full>, _DefaultInput = DefaultOf<Input>, _DefaultState = GetStateObject<Full>, _DefaultStateInput = GetStateObject<Input>, _DefaultInsight = DefaultOf<Insight>, _PurifiedInput = PurifiedModel<Input>, _Doc = DocumentModel<Full>, _DocInput = DocumentModel<Input>, _QueryOfDoc = QueryOf<_Doc>, _StateLight = GetStateObject<Light>, _StateInsight = GetStateObject<Insight>> {
    refName: T;
    input: ConstantCls<Input>;
    object: ConstantCls<Obj>;
    full: ConstantCls<Full, FullFieldObj>;
    light: ConstantCls<Light>;
    insight: ConstantCls<Insight>;
    _CapitalizedRefName: _CapitalizedRefName;
    _Input: Input;
    _Obj: Obj;
    _Full: Full;
    _Light: Light;
    _Insight: Insight;
    _Default: _Default;
    _DefaultInput: _DefaultInput;
    _DefaultState: _DefaultState;
    _DefaultStateInput: _DefaultStateInput;
    _DefaultInsight: _DefaultInsight;
    _PurifiedInput: _PurifiedInput;
    _Doc: _Doc;
    _DocInput: _DocInput;
    _QueryOfDoc: _QueryOfDoc;
    _StateLight: _StateLight;
    _StateInsight: _StateInsight;
}

export type ConstantModelRef<Schema = any, FieldObj extends FieldObject = FieldObject, ModelType extends ConstantType = ConstantType> = Cls<Schema, {
    [FIELD_META]: FieldObj;
    modelType: ModelType;
    children: Set<ConstantModelRef>;
    relations: Set<ConstantModelRef>;
    enums: Set<EnumInstance>;
    text: TextFieldPaths;
    cascade: CascadePaths;
}>;

export type ConstantOriginKind = "database" | "enum" | "scalar";

export declare class ConstantRegistry {
    static database: Map<string, ConstantModel<string, any, any, any, any, any, FieldObject, Capitalize<string>, DefaultOf<any>, DefaultOf<any>, GetStateObject<any>, GetStateObject<any>, DefaultOf<any>, any, any, any, any, GetStateObject<any>, GetStateObject<any>>>;
    static scalar: Map<string, ScalarConstantModel<string, any, DefaultOf<any>, any, any>>;
    static enum: Map<string, EnumInstance>;
    static value: Map<string, unknown>;
    static modelRefNameMap: Map<new (...args: never[]) => unknown, string>;
    static origin: Map<`database:${string}` | `enum:${string}` | `scalar:${string}`, string[]>;
    static getOrigin(kind: ConstantOriginKind, key: string): string[];
    static assertConsistentRefNames(skippedOrigins?: readonly string[]): void;
    static has(modelRef: Cls): boolean;
    static getRefName<AllowEmpty extends boolean = false>(modelRef: Cls, { allowEmpty }?: {
        allowEmpty?: AllowEmpty;
    }): AllowEmpty extends true ? string | undefined : string;
    static getModelName(modelRef: Cls): string;
    static isObject(modelRef: Cls<unknown, {
        modelType?: ConstantType;
    }>): boolean;
    static isFull(modelRef: Cls<unknown, {
        modelType?: ConstantType;
    }>): boolean;
    static isLight(modelRef: Cls<unknown, {
        modelType?: ConstantType;
    }>): boolean;
    static isInsight(modelRef: Cls<unknown, {
        modelType?: ConstantType;
    }>): boolean;
    static isScalar(modelRef: Cls<unknown, {
        modelType?: ConstantType;
    }>): boolean;
    static setDatabase(refName: string, cnst: ConstantModel): void;
    static getDatabase<AllowEmpty extends boolean = false>(refName: string, { allowEmpty }?: {
        allowEmpty?: AllowEmpty;
    }): AllowEmpty extends true ? ConstantModel | undefined : ConstantModel;
    static setScalar(refName: string, cnst: ScalarConstantModel): void;
    static getScalar<AllowEmpty extends boolean = false>(refName: string, { allowEmpty }?: {
        allowEmpty?: AllowEmpty;
    }): AllowEmpty extends true ? ScalarConstantModel | undefined : ScalarConstantModel;
    static getModelRef(refName: string, modelType?: ConstantType): Cls | typeof PrimitiveScalar;
    static buildModel<T extends string, InputRef extends ConstantModelRef, ObjectRef extends ConstantModelRef, FullFieldObj extends FieldObject, FullRef extends ConstantModelRef<any, FullFieldObj>, LightRef extends ConstantModelRef, InsightRef extends ConstantModelRef, Input = InstanceType<InputRef>, Obj = InstanceType<ObjectRef>, Full = InstanceType<FullRef>, Light = InstanceType<LightRef>, Insight = InstanceType<InsightRef>>(refName: T, inputRef: InputRef, objectRef: ObjectRef, fullRef: FullRef, lightRef: LightRef, insightRef: InsightRef, constExports: Record<string, unknown>, origin?: string): ConstantModel<T, Input, Obj, Full, Light, Insight, FullFieldObj, Capitalize<T>, DefaultOf<Full>, DefaultOf<Input>, GetStateObject<Full>, GetStateObject<Input>, DefaultOf<Insight>, PurifiedModel<Input>, DocumentModel<Full>, DocumentModel<Input>, any, GetStateObject<Light>, GetStateObject<Insight>>;
    static buildScalar<T extends string, Model>(refName: T, Model: Cls<Model>, constExports: Record<string, unknown>, origin?: string): ScalarConstantModel<T, Model, DefaultOf<Model>, DocumentModel<Model>, PurifiedModel<Model>>;
    static serialize<Value>(modelRef: Cls | Cls[], value: Value, nullable?: boolean, of?: Cls | Cls[]): Value;
    static deserialize<Value>(modelRef: Cls | Cls[], value: Value, nullable?: boolean, of?: Cls | Cls[]): Value;
}

export interface ConstantStatics<Schema = any, OwnSchema = Schema, OwnFieldObj extends FieldObject = FieldObject, OptionalKey = never, RelationKey = never, PrimitiveKey = never, ScalarKey = never, EnumKey = never, MapKey = never, HiddenKey = never, SecretKey = never, ModelType extends ConstantType = ConstantType> {
    [FIELD_META]: FieldObject;
    getDefault: () => DefaultOfSchema<Schema, RelationKey>;
    purify: PurifyFunc<Schema>;
    modelType: ConstantType;
    children: Set<ConstantModelRef>;
    relations: Set<ConstantModelRef>;
    enums: Set<EnumInstance>;
    text: TextFieldPaths;
    cascade: CascadePaths;
    _OptionalKey: OptionalKey;
    _RelationKey: RelationKey;
    _PrimitiveKey: PrimitiveKey;
    _ScalarKey: ScalarKey;
    _EnumKey: EnumKey;
    _MapKey: MapKey;
    _HiddenKey: HiddenKey;
    _SecretKey: SecretKey;
    _OwnSchema: OwnSchema;
    _OwnFieldObj: OwnFieldObj;
    _DatabaseSchema: Schema;
    _ModelType: ModelType;
    [SERVER_VALUE]: Schema;
    [CLIENT_VALUE]: Schema;
    [DEFAULT_VALUE]: DefaultOfSchema<Schema, RelationKey>;
    [PURIFIED_VALUE]: PurifiedModel<Schema>;
}

export type ConstantType = "full" | "input" | "insight" | "light" | "object" | "scalar";

export type Converter = (value: unknown) => unknown;

export type CrystalizeFunc<Model> = (self: GetStateObject<Model>, isChild?: boolean) => Model;

export declare const DEFAULT_PAGE_SIZE = 20;

export interface DatabaseConstantStatics<Schema = any, FieldObj extends FieldObject = FieldObject> {
    [FIELD_META]: FieldObj;
    getDefault: () => DefaultOf<Schema>;
    purify: PurifyFunc<Schema>;
    modelType: ConstantType;
    children: Set<ConstantModelRef>;
    relations: Set<ConstantModelRef>;
    enums: Set<EnumInstance>;
    text: TextFieldPaths;
    cascade: CascadePaths;
    _DatabaseSchema: Schema;
}

export type DefaultOf<S> = {
    [K in keyof S as S[K] extends (...args: never[]) => unknown ? never : K extends "prototype" ? never : K]: FieldState<S[K]>;
};

export type DefaultOfSchema<Schema, RelationKey = never> = [
    RelationKey
] extends [
    never
] ? Schema : {
    [K in keyof Schema]: (K extends RelationKey ? null : never) | Schema[K];
};

export interface DefaultPlan {
    shared: Record<string, unknown>;
    perCall: Map<string, () => unknown>;
}

export type DocumentConstantModelRef<Schema = any, FieldObj extends FieldObject = FieldObject, ModelType extends ConstantType = ConstantType, DatabaseSchema = Schema> = Cls<Schema, {
    [FIELD_META]: FieldObj;
    modelType: ModelType;
    _DatabaseSchema: DatabaseSchema;
    _ModelType: ModelType;
}>;

export type DocumentModel<T> = unknown extends T ? T : T extends (infer S)[] ? DocumentModel<S>[] : T extends Dayjs | File | Uint8Array | boolean | number | string ? T : T extends Map<infer K, infer V> ? Map<K, DocumentModel<V>> : Docify<T>;

export type ExtractFieldInfoObject<Obj extends FieldInfoObject> = {
    [K in keyof Obj]: unknown extends Obj[K]["explicitType"] ? FieldToValue<Obj[K]["value"], Obj[K]["mapValue"]> : Obj[K]["explicitType"];
};

export type FieldBuilder = typeof field;

export interface FieldInfoObject {
    [key: string]: FieldInfo<any, ConstantFieldTypeInput | null, any, any, any, boolean, boolean, boolean, boolean, boolean, boolean, boolean>;
}

export type FieldInfoObjectToFieldObject<Obj extends FieldInfoObject> = {
    [K in keyof Obj]: ConstantFieldFromInfo<Obj[K]>;
};

export interface FieldObject {
    [key: string]: ConstantField;
}

export declare class FieldPlan {
    static of(cls: PlanOwner): FieldPlan;
    static reset(cls: object): void;
    readonly entries: readonly FieldPlanEntry[];
    constructor(fieldObj: FieldObject);
    get resolvesAsync(): boolean;
}

export interface FieldPlanEntry {
    key: string;
    field: ConstantField;
    kind: FieldPlanKind;
    isRelationRef: boolean;
    primitive: null | typeof PrimitiveScalar;
    serializeOption: {
        nullable: boolean;
        key: string;
    };
}

export type FieldPlanKind = "computed" | "masked" | "relation" | "scalar" | "value";

export type FieldPreset = (typeof fieldPresets)[number];

export interface FieldProps extends ConstantFieldBuildProps {
    isClass: boolean;
    isScalar: boolean;
    isArray: boolean;
    isMap: boolean;
}

export interface FieldQueryMeta {
    refName: string;
    queryKey: null | string;
    queryArgs?: (() => unknown[]) | unknown[];
}

export type FieldResolver = typeof resolve;

export type FieldState<T> = T extends {
    id: string;
} ? T | null : T;

export type FieldToValue<Field, MapValue = any> = Field extends null ? FieldToValue<Exclude<Field, null>> | null : Field extends MapConstructor ? Map<string, FieldToValue<MapValue>> : Field extends (infer F)[] ? FieldToValue<F>[] : Field extends BooleanConstructor | DateConstructor | StringConstructor | typeof PrimitiveScalar ? Field[typeof SERVER_VALUE] : Field extends ConstantModelRef ? UnCls<Field> : Field extends {
    [SERVER_VALUE]: infer V;
} ? V : Field extends Cls ? UnCls<Field> : never;

export type GetPlainObject<T, O extends string> = Omit<{
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K extends "refresh" | "save" | "set" ? never : K]: T[K];
}, O>;

export declare class HydrationPlan {
    static of(cls: PlanOwner): HydrationPlan;
    static reset(cls: object): void;
    constructor(fieldObj: FieldObject);
    construct(instance: object, source?: Record<string, unknown> | null): void;
    assign(instance: object, source: Record<string, unknown>): void;
}

export declare class InputParser {
    static parse(argRef: Cls, arrDepth: number, value: unknown, option: ParseOption): unknown;
}

export declare class InvalidInputError extends AkanError<"invalidInput" | "missingInput"> {
    readonly path: string;
    readonly reason: "invalid" | "missing";
    readonly expected: null | string;
    constructor(path: string, expected: null | string);
}

export declare const MAX_INT = 2147483647;

export declare const MAX_PAGE_SIZE = 500;

export interface MaskModel {
    name: string;
}

export type NonFunctionalKeys<T> = {
    [K in keyof T]: T[K] extends (...args: never[]) => unknown ? never : K;
}[keyof T];

export type ParamFieldType = (typeof PrimitiveScalar & {
    [CLIENT_VALUE]: Dayjs | boolean | number | string;
}) | EnumInstance<string, any>;

export type PlainTypeToFieldType<PlainType> = PlainType extends [
    infer First,
    ...unknown[]
] ? PlainTypeToFieldType<First>[] : PlainType extends number ? typeof Float | typeof Int : PlainType extends string ? StringConstructor : typeof Any;

export interface ProtoAppInfo {
    appId: null | string;
    appName: string;
    deviceId: null | string;
    platform: "android" | "ios" | null;
    major: number;
    minor: number;
    patch: number;
    branch: string;
    buildNum: null | string;
    versionOs: null | string;
    isEmulator: boolean | null;
}

export interface ProtoFile extends ProtoLightFile {
    progress: null | number;
    mimetype: string;
    encoding: string;
    origin: null | string;
    lastModifiedAt: Dayjs;
}

export interface ProtoLightFile {
    id: string;
    filename: string;
    abstractData: null | string;
    imageSize: [
        number,
        number
    ];
    progress?: null | number;
    url: string;
    size: number;
    status: string;
    createdAt: Dayjs;
    updatedAt: Dayjs;
    removedAt: Dayjs | null;
}

export interface ProtoPatch {
    source: ProtoFile;
    build: ProtoFile;
    appBuild: ProtoFile | null;
    status: "active" | "expired";
    at: Dayjs;
}

export type PurifiedModel<T> = unknown extends T ? T : T extends (infer S)[] ? PurifiedModel<S>[] : T extends Dayjs | File | boolean | number | string ? T : T extends Map<infer K, infer V> ? Map<K, PurifiedModel<V>> : PurifiedWithObjectToId<T>;

export type PurifyFunc<Input, _DefaultInput = DefaultOf<Input>, _PurifiedInput = PurifiedModel<Input>> = (self: _DefaultInput, isChild?: boolean) => _PurifiedInput | null;

export type PurifyFuncV2<Input, RelationKey extends string = never, _DefaultInput = DefaultOfSchema<Input, RelationKey>, _PurifiedInput = PurifiedModel<Input>> = (self: _DefaultInput, isChild?: boolean) => _PurifiedInput | null;

export type QueryOf<_T = any> = any;

export declare class RequestValue {
    static admit(value: unknown, path: string): void;
    static isFrom(value: unknown): boolean;
}

export declare class Responsive extends Responsive_base {
}

export interface ScalarConstantModel<T extends string = string, Model = any, _Default = DefaultOf<Model>, _Doc = DocumentModel<Model>, _PurifiedInput = PurifiedModel<Model>> {
    refName: T;
    model: ConstantCls<Model>;
    _Default: _Default;
    _Doc: _Doc;
    _PurifiedInput: _PurifiedInput;
}

export type Serialized<O> = O extends (infer V)[] ? Serialized<V>[] : O extends Dayjs ? Date : O extends Map<infer K, infer V> ? {
    [key in K & string]: Serialized<V>;
} : O extends object ? {
    [K in keyof O]: Serialized<O[K]>;
} : O;

export type ServerArgModel<T> = unknown extends T ? T : T extends Uint8Array ? Uint8Array<ArrayBuffer> : T extends (infer S)[] ? ServerArgModel<S>[] : DocumentModel<T>;

export declare class TextFieldPathSet {
    readonly title: Set<string>;
    readonly desc: Set<string>;
    readonly tag: Set<string>;
    readonly thumb: Set<string>;
    readonly filter: Set<string>;
}

export declare class TextFieldPaths extends TextFieldPathSet {
    readonly children: TextFieldPathSet;
    collect(fieldMap: FieldObject): this;
}

export type TextFieldRole = (typeof textFieldRoles)[number];

export type UploadableClientArg<T> = [
    T
] extends [
    File[]
] ? FileList | File[] : T;

export declare const agentRead: (modelRef: unknown, value: unknown, arrDepth?: number) => unknown;

export declare const cascadeActions: readonly [
    "removeRef",
    "removeWith",
    "removeWithAny"
];

export declare const converterOf: (props: FieldProps) => Converter;

export declare const crystalize: (field: FieldProps, value: unknown) => unknown;

export declare const dateAccessorOf: (key: string) => PropertyDescriptor;

export declare const dateSlotOf: (key: string) => symbol;

export declare const defaultPlanOf: (fieldObj: FieldObject) => DefaultPlan;

export declare const deserialize: (argRef: ConstantModelRef | PrimitiveScalar, arrDepth: number, value: unknown, { key, nullable, convertFn, enum: enumRef }: DeserializeOption) => null | object[];

export declare const field: {
    <ExplicitType, Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never>(value: Value, option?: FieldOption<Value, MapValue>): FieldInfo<"property", Value, ExplicitType, MapValue, FieldKindSource<Value>, UnCls<FieldKindSource<Value>> extends BaseObject ? true : false, FieldKindSource<Value> extends infer T ? T extends FieldKindSource<Value> ? T extends EnumInstance<string, any> ? true : false : never : never, FieldKindSource<Value> extends infer T_1 ? T_1 extends FieldKindSource<Value> ? T_1 extends typeof PrimitiveScalar ? true : false : never : never, FieldKindSource<Value> extends infer T_2 ? T_2 extends FieldKindSource<Value> ? T_2 extends MapConstructor ? true : false : never : never, (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) extends infer T_3 ? T_3 extends (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) ? T_3 extends true ? false : (FieldKindSource<Value> extends infer T_4 ? T_4 extends FieldKindSource<Value> ? T_4 extends EnumInstance<string, any> ? true : false : never : never) extends infer T_5 ? T_5 extends (FieldKindSource<Value> extends infer T_12 ? T_12 extends FieldKindSource<Value> ? T_12 extends EnumInstance<string, any> ? true : false : never : never) ? T_5 extends true ? false : (FieldKindSource<Value> extends infer T_6 ? T_6 extends FieldKindSource<Value> ? T_6 extends typeof PrimitiveScalar ? true : false : never : never) extends infer T_7 ? T_7 extends (FieldKindSource<Value> extends infer T_11 ? T_11 extends FieldKindSource<Value> ? T_11 extends typeof PrimitiveScalar ? true : false : never : never) ? T_7 extends true ? false : (FieldKindSource<Value> extends infer T_8 ? T_8 extends FieldKindSource<Value> ? T_8 extends MapConstructor ? true : false : never : never) extends infer T_9 ? T_9 extends (FieldKindSource<Value> extends infer T_10 ? T_10 extends FieldKindSource<Value> ? T_10 extends MapConstructor ? true : false : never : never) ? T_9 extends true ? false : true : never : never : never : never : never : never : never : never, false, false>;
    visual<ExplicitType, Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never>(value: Value, option?: FieldOption<Value, MapValue>): FieldInfo<"property", Value, ExplicitType, MapValue, FieldKindSource<Value>, UnCls<FieldKindSource<Value>> extends BaseObject ? true : false, FieldKindSource<Value> extends infer T ? T extends FieldKindSource<Value> ? T extends EnumInstance<string, any> ? true : false : never : never, FieldKindSource<Value> extends infer T_1 ? T_1 extends FieldKindSource<Value> ? T_1 extends typeof PrimitiveScalar ? true : false : never : never, FieldKindSource<Value> extends infer T_2 ? T_2 extends FieldKindSource<Value> ? T_2 extends MapConstructor ? true : false : never : never, (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) extends infer T_3 ? T_3 extends (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) ? T_3 extends true ? false : (FieldKindSource<Value> extends infer T_4 ? T_4 extends FieldKindSource<Value> ? T_4 extends EnumInstance<string, any> ? true : false : never : never) extends infer T_5 ? T_5 extends (FieldKindSource<Value> extends infer T_12 ? T_12 extends FieldKindSource<Value> ? T_12 extends EnumInstance<string, any> ? true : false : never : never) ? T_5 extends true ? false : (FieldKindSource<Value> extends infer T_6 ? T_6 extends FieldKindSource<Value> ? T_6 extends typeof PrimitiveScalar ? true : false : never : never) extends infer T_7 ? T_7 extends (FieldKindSource<Value> extends infer T_11 ? T_11 extends FieldKindSource<Value> ? T_11 extends typeof PrimitiveScalar ? true : false : never : never) ? T_7 extends true ? false : (FieldKindSource<Value> extends infer T_8 ? T_8 extends FieldKindSource<Value> ? T_8 extends MapConstructor ? true : false : never : never) extends infer T_9 ? T_9 extends (FieldKindSource<Value> extends infer T_10 ? T_10 extends FieldKindSource<Value> ? T_10 extends MapConstructor ? true : false : never : never) ? T_9 extends true ? false : true : never : never : never : never : never : never : never : never, false, false>;
    hidden<ExplicitType, Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never>(value: Value, option?: WithoutTextRole<FieldOption<Value, MapValue>>): FieldInfo<"hidden", Value, ExplicitType, MapValue, FieldKindSource<Value>, UnCls<FieldKindSource<Value>> extends BaseObject ? true : false, FieldKindSource<Value> extends infer T ? T extends FieldKindSource<Value> ? T extends EnumInstance<string, any> ? true : false : never : never, FieldKindSource<Value> extends infer T_1 ? T_1 extends FieldKindSource<Value> ? T_1 extends typeof PrimitiveScalar ? true : false : never : never, FieldKindSource<Value> extends infer T_2 ? T_2 extends FieldKindSource<Value> ? T_2 extends MapConstructor ? true : false : never : never, (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) extends infer T_3 ? T_3 extends (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) ? T_3 extends true ? false : (FieldKindSource<Value> extends infer T_4 ? T_4 extends FieldKindSource<Value> ? T_4 extends EnumInstance<string, any> ? true : false : never : never) extends infer T_5 ? T_5 extends (FieldKindSource<Value> extends infer T_12 ? T_12 extends FieldKindSource<Value> ? T_12 extends EnumInstance<string, any> ? true : false : never : never) ? T_5 extends true ? false : (FieldKindSource<Value> extends infer T_6 ? T_6 extends FieldKindSource<Value> ? T_6 extends typeof PrimitiveScalar ? true : false : never : never) extends infer T_7 ? T_7 extends (FieldKindSource<Value> extends infer T_11 ? T_11 extends FieldKindSource<Value> ? T_11 extends typeof PrimitiveScalar ? true : false : never : never) ? T_7 extends true ? false : (FieldKindSource<Value> extends infer T_8 ? T_8 extends FieldKindSource<Value> ? T_8 extends MapConstructor ? true : false : never : never) extends infer T_9 ? T_9 extends (FieldKindSource<Value> extends infer T_10 ? T_10 extends FieldKindSource<Value> ? T_10 extends MapConstructor ? true : false : never : never) ? T_9 extends true ? false : true : never : never : never : never : never : never : never : never, true, false>;
    secret<ExplicitType, Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never>(value: Value, option?: WithoutTextRole<FieldOption<Value, MapValue>>): FieldInfo<"secret", Value | null, ExplicitType | null, MapValue, SingleValue<Value> & {}, UnCls<SingleValue<Value> & {}> extends BaseObject ? true : false, SingleValue<Value> & {} extends infer T ? T extends SingleValue<Value> & {} ? T extends EnumInstance<string, any> ? true : false : never : never, SingleValue<Value> & {} extends infer T_1 ? T_1 extends SingleValue<Value> & {} ? T_1 extends typeof PrimitiveScalar ? true : false : never : never, SingleValue<Value> & {} extends infer T_2 ? T_2 extends SingleValue<Value> & {} ? T_2 extends MapConstructor ? true : false : never : never, (UnCls<SingleValue<Value> & {}> extends BaseObject ? true : false) extends infer T_3 ? T_3 extends (UnCls<SingleValue<Value> & {}> extends BaseObject ? true : false) ? T_3 extends true ? false : (SingleValue<Value> & {} extends infer T_4 ? T_4 extends SingleValue<Value> & {} ? T_4 extends EnumInstance<string, any> ? true : false : never : never) extends infer T_5 ? T_5 extends (SingleValue<Value> & {} extends infer T_12 ? T_12 extends SingleValue<Value> & {} ? T_12 extends EnumInstance<string, any> ? true : false : never : never) ? T_5 extends true ? false : (SingleValue<Value> & {} extends infer T_6 ? T_6 extends SingleValue<Value> & {} ? T_6 extends typeof PrimitiveScalar ? true : false : never : never) extends infer T_7 ? T_7 extends (SingleValue<Value> & {} extends infer T_11 ? T_11 extends SingleValue<Value> & {} ? T_11 extends typeof PrimitiveScalar ? true : false : never : never) ? T_7 extends true ? false : (SingleValue<Value> & {} extends infer T_8 ? T_8 extends SingleValue<Value> & {} ? T_8 extends MapConstructor ? true : false : never : never) extends infer T_9 ? T_9 extends (SingleValue<Value> & {} extends infer T_10 ? T_10 extends SingleValue<Value> & {} ? T_10 extends MapConstructor ? true : false : never : never) ? T_9 extends true ? false : true : never : never : never : never : never : never : never : never, false, true>;
};

export declare const fieldPresets: readonly [
    "email",
    "password",
    "url"
];

export declare const fieldQueryMetaOf: (refName: string, field: string) => FieldQueryMeta | undefined;

export declare const freshPrimitiveValue: <T>(value: T) => T;

export declare const getDefault: <T>(fieldObj: FieldObject) => DefaultOf<T>;

export declare const immerify: <T extends object>(modelRef: ConstantModelRef, objOrArr: T) => T;

export declare const isDateSlotField: (props: {
    modelRef: unknown;
    isArray: boolean;
    isMap: boolean;
}) => boolean;

export declare const labelOf: (model: unknown, value: unknown) => string | undefined;

export declare const leakingFieldsOf: (model: MaskModel, value: Record<string, unknown>) => string[];

export declare const makePurify: <I>(modelRef: ConstantModelRef<I>) => PurifyFunc<I>;

export declare const mask: (model: MaskModel, value: unknown) => unknown;

export declare const maskFieldsOf: (model: MaskModel) => Record<string, MaskField> | null;

export declare const resolve: <ExplicitType, Value extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never>(value: Value, option?: WithoutTextRole<FieldOption<Value, MapValue>>) => FieldInfo<"resolve", Value, ExplicitType, MapValue, FieldKindSource<Value>, UnCls<FieldKindSource<Value>> extends BaseObject ? true : false, FieldKindSource<Value> extends infer T ? T extends FieldKindSource<Value> ? T extends EnumInstance<string, any> ? true : false : never : never, FieldKindSource<Value> extends infer T_1 ? T_1 extends FieldKindSource<Value> ? T_1 extends typeof PrimitiveScalar ? true : false : never : never, FieldKindSource<Value> extends infer T_2 ? T_2 extends FieldKindSource<Value> ? T_2 extends MapConstructor ? true : false : never : never, (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) extends infer T_3 ? T_3 extends (UnCls<FieldKindSource<Value>> extends BaseObject ? true : false) ? T_3 extends true ? false : (FieldKindSource<Value> extends infer T_4 ? T_4 extends FieldKindSource<Value> ? T_4 extends EnumInstance<string, any> ? true : false : never : never) extends infer T_5 ? T_5 extends (FieldKindSource<Value> extends infer T_12 ? T_12 extends FieldKindSource<Value> ? T_12 extends EnumInstance<string, any> ? true : false : never : never) ? T_5 extends true ? false : (FieldKindSource<Value> extends infer T_6 ? T_6 extends FieldKindSource<Value> ? T_6 extends typeof PrimitiveScalar ? true : false : never : never) extends infer T_7 ? T_7 extends (FieldKindSource<Value> extends infer T_11 ? T_11 extends FieldKindSource<Value> ? T_11 extends typeof PrimitiveScalar ? true : false : never : never) ? T_7 extends true ? false : (FieldKindSource<Value> extends infer T_8 ? T_8 extends FieldKindSource<Value> ? T_8 extends MapConstructor ? true : false : never : never) extends infer T_9 ? T_9 extends (FieldKindSource<Value> extends infer T_10 ? T_10 extends FieldKindSource<Value> ? T_10 extends MapConstructor ? true : false : never : never) ? T_9 extends true ? false : true : never : never : never : never : never : never : never : never, false, false>;

export declare const resolvePageLimit: (limit: unknown, fallback?: number) => number;

export declare const resolvePageSkip: (skip: unknown) => number;

export declare const responsiveWidths: readonly [
    1200,
    992,
    768,
    576,
    0
];

export declare const serialize: (argRef: ConstantModelRef | PrimitiveScalar, arrDepth: number, value: unknown, serializeType: "input" | "object" | undefined, { nullable, key }: {
    nullable?: boolean;
    key?: string;
}) => null | object[];

export declare const stripSecrets: (model: MaskModel, value: unknown) => unknown;

export declare const textFieldRoles: readonly [
    "title",
    "desc",
    "tag",
    "thumb",
    "filter"
];

export declare const toDateValue: (value: unknown) => Date | null | undefined;

export declare const unsetDate: Dayjs;

export declare function via<Obj extends BaseObject, ObjFieldObj extends FieldObject, K extends NonFunctionalKeys<OmitBase<Obj>>, ResolveField extends (resolve: FieldResolver) => FieldInfoObject, LightModels extends Cls[], _DirectSchema extends object = ObjectAssign<[
    Pick<Obj, K> & BaseObject,
    ResolvedSchema<ResolveField>
]>, _Schema extends object = MergeWithOwnSchemas<LightModels, _DirectSchema>, _DirectFieldObj extends FieldObject = ObjectAssign<[
    Pick<ObjFieldObj, K & keyof ObjFieldObj>,
    ResolvedFieldObject<ResolveField>
]>, _FieldObj extends FieldObject = MergeWithOwnFieldObjects<LightModels, _DirectFieldObj> & FieldObject>(modelRef: Cls<Obj, {
    [FIELD_META]: ObjFieldObj;
}>, fields: readonly K[], resolveField: ResolveField, ...lightModelRefs: LightModels): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "light">;
export declare function via<BuildField extends (builder: FieldBuilder) => FieldInfoObject, _DirectSchema extends object = BuiltSchema<BuildField>, _DirectFieldObj extends FieldObject = BuiltFieldObject<BuildField>>(buildField: BuildField): ConstantCls<_DirectSchema, _DirectFieldObj, _DirectSchema, _DirectFieldObj, "input" | "scalar">;
export declare function via<BuildField extends (builder: FieldBuilder) => FieldInfoObject, FirstInput extends Cls, Inputs extends Cls[], _DirectSchema extends object = BuiltSchema<BuildField>, _InputRefs extends Cls[] = [
    FirstInput,
    ...Inputs
], _Schema extends object = MergeWithOwnSchemas<_InputRefs, _DirectSchema>, _DirectFieldObj extends FieldObject = BuiltFieldObject<BuildField>, _FieldObj extends FieldObject = MergeWithOwnFieldObjects<_InputRefs, _DirectFieldObj> & FieldObject>(buildField: BuildField, firstExtendInputRef: FirstInput, ...extendInputRefs: Inputs): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "input">;
export declare function via<Full extends BaseObject, BuildField extends (builder: FieldBuilder) => FieldInfoObject, Insights extends Cls[], _DirectSchema extends object = ObjectAssign<[
    BaseInsight,
    BuiltSchema<BuildField>
]>, _Schema extends object = MergeWithOwnSchemas<Insights, _DirectSchema>, _DirectFieldObj extends FieldObject = BuiltFieldObject<BuildField>, _FieldObj extends FieldObject = MergeWithOwnFieldObjects<Insights, _DirectFieldObj> & FieldObject>(modelRef: Cls<Full>, buildField: BuildField, ...extendInsightRefs: Insights): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "insight">;
export declare function via<Input, InputFieldObj extends FieldObject, BuildField extends (builder: FieldBuilder) => FieldInfoObject, ObjectModels extends Cls[], _DirectSchema extends object = ObjectAssign<[
    Input & object,
    BaseObject,
    BuiltSchema<BuildField>
]>, _Schema extends object = MergeWithOwnSchemas<ObjectModels, _DirectSchema>, _DirectFieldObj extends FieldObject = ObjectAssign<[
    InputFieldObj,
    BuiltFieldObject<BuildField>
]>, _FieldObj extends FieldObject = MergeWithOwnFieldObjects<ObjectModels, _DirectFieldObj> & FieldObject>(inputRef: Cls<Input, {
    [FIELD_META]: InputFieldObj;
}>, buildField: BuildField, ...extendObjectRefs: ObjectModels): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "object">;
export declare function via<Obj, ObjFieldObj extends FieldObject, Light, LightFieldObj extends FieldObject, ResolveField extends (resolve: FieldResolver) => FieldInfoObject, FullModels extends Cls[], _DirectSchema extends object = ObjectAssign<[
    Obj & object,
    Light & object,
    ResolvedSchema<ResolveField>
]>, _Schema extends object = MergeWithOwnSchemas<FullModels, _DirectSchema>, _DirectFieldObj extends FieldObject = ObjectAssign<[
    ObjFieldObj,
    LightFieldObj,
    ResolvedFieldObject<ResolveField>
]>, _FieldObj extends FieldObject = MergeWithOwnFieldObjects<FullModels, _DirectFieldObj> & FieldObject>(objectRef: Cls<Obj, {
    [FIELD_META]: ObjFieldObj;
}>, lightModelRef: Cls<Light, {
    [FIELD_META]: LightFieldObj;
}>, resolveField: ResolveField, ...fullModelRefs: FullModels): ConstantCls<_Schema, _FieldObj, _Schema, _FieldObj, "full">;

export declare const withSharedInstances: <T>(hydrate: () => T) => T;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
type BaseFields = "createdAt" | "id" | "removedAt" | "updatedAt";

type BuiltFieldObject<BuildField extends (builder: FieldBuilder) => FieldInfoObject> = FieldInfoObjectToFieldObject<ReturnType<BuildField>>;

type BuiltSchema<BuildField extends (builder: FieldBuilder) => FieldInfoObject> = ExtractFieldInfoObject<ReturnType<BuildField>>;

type CascadeOption = {
    cascade: "removeWithAny";
    refPath: string;
} | {
    cascade?: "removeRef" | "removeWith";
    refPath?: string;
};

interface ConstantFieldBuildProps<FieldType extends ConstantFieldKind = any, FieldValue = any, MapValue = any, Metadata = any, Nullable extends boolean = boolean> {
    nullable: Nullable;
    ref?: string;
    refPath?: string;
    refType?: "child" | "parent" | "relation";
    default: ((doc: {
        id: string;
    }) => FieldValue) | FieldValue;
    type?: FieldPreset;
    fieldType: FieldType;
    immutable: boolean;
    min?: number;
    max?: number;
    enum?: EnumInstance;
    select: boolean;
    minlength?: number;
    maxlength?: number;
    accumulate?: any;
    example?: FieldValue;
    of?: MapValue;
    validate?: (value: FieldValue, model: any) => boolean;
    text?: TextFieldRole;
    cascade?: CascadeAction;
    visual: boolean;
    modelRef: ConstantModelRef;
    arrDepth: number;
    optArrDepth: number;
    meta: Metadata;
}

type ConstantFieldEnumType = EnumInstance<string, any>;

type ConstantFieldFromInfo<Info> = Info extends FieldInfo<infer FieldType, infer Value, infer ExplicitType, infer MapValue, infer _KindSource, infer IsRelation, infer IsEnum, infer IsPrimitive, infer IsMap, infer IsScalar, infer IsHidden, infer IsSecret> ? ConstantFieldFromInfoParts<FieldType, Value, ExplicitType, MapValue, IsRelation, IsEnum, IsPrimitive, IsMap, IsScalar, IsHidden, IsSecret> : never;

type ConstantFieldFromInfoParts<FieldType extends ConstantFieldKind, Value extends ConstantFieldTypeInput | null, ExplicitType, MapValue, IsRelation extends boolean, IsEnum extends boolean, IsPrimitive extends boolean, IsMap extends boolean, IsScalar extends boolean, IsHidden extends boolean, IsSecret extends boolean, _FieldValue = FieldInfoValue<Value, ExplicitType, MapValue>> = ConstantField<FieldType, Value, _FieldValue, MapValue, IsNullableValue<_FieldValue>, IsRelation, IsEnum, IsPrimitive, IsScalar, IsHidden, IsSecret, IsMap>;

type ConstantKeyChannelMap = {
    optional: unknown;
    relation: unknown;
    primitive: unknown;
    scalar: unknown;
    enum: unknown;
    map: unknown;
    hidden: unknown;
    secret: unknown;
};

type ConstantKeyChannels<FieldObj extends FieldObject> = IsBroadFieldObject<FieldObj> extends true ? {
    optional: never;
    relation: never;
    primitive: never;
    scalar: never;
    enum: never;
    map: never;
    hidden: never;
    secret: never;
} : {
    optional: OptionalKeys<FieldObj>;
    relation: RelationKeys<FieldObj>;
    primitive: PrimitiveKeys<FieldObj>;
    scalar: ScalarKeys<FieldObj>;
    enum: EnumKeys<FieldObj>;
    map: MapKeys<FieldObj>;
    hidden: HiddenKeys<FieldObj>;
    secret: SecretKeys<FieldObj>;
};

interface DeserializeOption {
    key?: string;
    nullable?: boolean;
    convertFn?: (value: unknown) => unknown;
    enum?: EnumInstance;
}

type Docify<T, _StateKeys extends keyof GetStateObject<T> = keyof GetStateObject<T>> = unknown extends T ? T : {
    [K in _StateKeys as null extends T[K] ? never : K]-?: ObjectToId<NonNullable<T[K]>>;
} & {
    [K in _StateKeys as null extends T[K] ? K : never]?: ObjectToId<NonNullable<T[K]>> | undefined;
};

type EnumKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isEnum">;

type FieldFlag = "_isEnum" | "_isHidden" | "_isMap" | "_isPrimitive" | "_isRelation" | "_isScalar" | "_isSecret" | "nullable";

declare class FieldInfo<FieldType extends ConstantFieldKind = any, Value extends ConstantFieldTypeInput | null = null, ExplicitType = unknown, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never, KindSource = FieldKindSource<Value>, IsRelation extends boolean = UnCls<KindSource> extends BaseObject ? true : false, IsEnum extends boolean = KindSource extends EnumInstance<string, any> ? true : false, IsPrimitive extends boolean = KindSource extends typeof PrimitiveScalar ? true : false, IsMap extends boolean = KindSource extends MapConstructor ? true : false, IsScalar extends boolean = IsRelation extends true ? false : IsEnum extends true ? false : IsPrimitive extends true ? false : IsMap extends true ? false : true, IsHidden extends boolean = FieldType extends "hidden" ? true : false, IsSecret extends boolean = FieldType extends "secret" ? true : false> {
    readonly value: Value;
    readonly type: ConstantFieldTypeInput;
    readonly option: ConstantFieldProps;
    explicitType: ExplicitType;
    mapValue: MapValue;
    _isEnum: IsEnum;
    _isPrimitive: IsPrimitive;
    _isScalar: IsScalar;
    _isRelation: IsRelation;
    _isHidden: IsHidden;
    _isSecret: IsSecret;
    _isMap: IsMap;
    constructor(value: Value, option: ConstantFieldProps<FieldType, any, MapValue>);
    optional(): FieldInfo<FieldType, Value | null, ExplicitType | null, MapValue>;
    meta(meta: ConstantFieldProps["meta"]): this;
    toField(): ConstantField<FieldType, Value, ExplicitType, MapValue, IsNullableValue<FieldInfoValue<Value, ExplicitType, MapValue>>, IsRelation, IsEnum, IsPrimitive, IsScalar, IsHidden, IsSecret, IsMap, {
        [key: string]: any;
    }>;
}

type FieldInfoValue<Value, ExplicitType, MapValue> = unknown extends ExplicitType ? FieldToValue<Value, MapValue> : ExplicitType;

type FieldKindSource<Value> = NonNullable<SingleValue<Value>>;

type FieldOption<Value extends ConstantFieldTypeInput, MapValue = Value extends MapConstructor ? typeof PrimitiveScalar : never, Metadata extends {
    [key: string]: any;
} = {
    [key: string]: any;
}, _FieldToValue = FieldToValue<Value, MapValue> | null | undefined> = WithCascadePair<Omit<ConstantFieldProps<ConstantFieldKind, SingleValue<_FieldToValue>, MapValue, Metadata>, "enum" | "fieldType" | "meta" | "nullable" | "select">>[] | WithCascadePair<Omit<ConstantFieldProps<ConstantFieldKind, _FieldToValue, MapValue, Metadata>, "enum" | "fieldType" | "meta" | "nullable" | "select">>;

type HiddenKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isHidden">;

type IsBroadFieldObject<FieldObj extends FieldObject> = string extends keyof FieldObj ? true : false;

type IsNullableValue<Value> = null extends Value ? true : false;

type KeysByFlag<FieldObj extends FieldObject, Flag extends FieldFlag> = {
    [K in keyof FieldObj]: FieldObj[K] extends TrueFieldFlag<Flag> ? K : never;
}[keyof FieldObj];

type MapKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isMap">;

interface MaskField {
    fieldType?: string;
    isClass?: boolean;
    isMap?: boolean;
    modelRef?: MaskModel;
    of?: unknown;
    arrDepth?: number;
    visual?: boolean;
}

type MergeOwnFieldObjects<Models extends object[]> = ObjectAssignKeyOfObjects<Models, "_OwnFieldObj">;

type MergeOwnSchemas<Models extends object[]> = ObjectAssignKeyOfObjects<Models, "_OwnSchema">;

type MergeWithOwnFieldObjects<Models extends object[], OwnFieldObj extends object> = ObjectAssign<[
    MergeOwnFieldObjects<Models>,
    OwnFieldObj
]>;

type MergeWithOwnSchemas<Models extends object[], OwnSchema extends object> = ObjectAssign<[
    MergeOwnSchemas<Models>,
    OwnSchema
]>;

type ObjectToId<O> = O extends BaseObject ? string : O extends BaseObject[] ? string[] : O extends Dayjs ? Dayjs : O extends object ? DocumentModel<O> : O;

type OmitBase<T> = Omit<T, BaseFields>;

type OptionalKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "nullable">;

interface ParseOption {
    key: string;
    nullable?: boolean;
    enum?: EnumInstance;
}

// constant/fieldPlan
interface PlanOwner {
    [FIELD_META]: FieldObject;
}

// constant/hydrationPlan
interface PlanOwner {
    [FIELD_META]: FieldObject;
}

type PrimitiveKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isPrimitive">;

type Purified<O> = O extends BaseObject ? string : O extends BaseObject[] ? string[] : O extends Dayjs ? Dayjs : O extends object ? PurifiedModel<O> : O;

type PurifiedWithObjectToId<T, StateKeys extends keyof GetStateObject<T> = keyof GetStateObject<T>> = unknown extends T ? T : {
    [K in StateKeys as null extends T[K] ? never : K]: Purified<T[K]>;
} & {
    [K in StateKeys as null extends T[K] ? K : never]?: Purified<T[K]> | undefined;
};

type RelationKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isRelation">;

type ResolvedFieldObject<ResolveField extends (resolve: FieldResolver) => FieldInfoObject> = FieldInfoObjectToFieldObject<ReturnType<ResolveField>>;

type ResolvedSchema<ResolveField extends (resolve: FieldResolver) => FieldInfoObject> = ExtractFieldInfoObject<ReturnType<ResolveField>>;

declare const Responsive_base: import("akanjs/base").EnumInstance<"responsive", "lg" | "md" | "sm" | "xl" | "xs">;

type ScalarKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isScalar">;

type SecretKeys<FieldObj extends FieldObject> = KeysByFlag<FieldObj, "_isSecret">;

type TrueFieldFlag<Flag extends FieldFlag> = {
    readonly [K in Flag]: true;
};

type WithCascadePair<Option> = Omit<Option, "cascade" | "refPath"> & CascadeOption;

type WithoutTextRole<Option> = Option extends unknown ? Omit<Option, "text"> : never;
```
