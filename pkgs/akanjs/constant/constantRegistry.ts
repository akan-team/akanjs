import {
  type Cls,
  type EnumInstance,
  type GetStateObject,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
  type PrimitiveValue,
} from "akanjs/base";
import { capitalize, lowerlize } from "akanjs/common";
import {
  type ConstantCls,
  type ConstantModelRef,
  deserialize,
  type FieldObject,
  type PurifiedModel,
  serialize,
} from ".";
import type { ConstantType, DefaultOf, DocumentModel, QueryOf } from "./types";

export class ConstantRegistry {
  static database = new Map<string, ConstantModel>();
  static scalar = new Map<string, ScalarConstantModel>();
  static enum = new Map<string, EnumInstance>();
  static value = new Map<string, unknown>();
  static modelRefNameMap = new Map<Cls, string>();
  //? The app or lib that registered each entry, first registrant first: an app extending a lib model reads `["shared", "sceny"]`.
  static origin = new Map<`${ConstantOriginKind}:${string}`, string[]>();
  static getOrigin(kind: ConstantOriginKind, key: string): string[] {
    return ConstantRegistry.origin.get(`${kind}:${key}`) ?? [];
  }
  static #addOrigin(kind: ConstantOriginKind, key: string, origin?: string) {
    if (!origin) return;
    const chain = ConstantRegistry.getOrigin(kind, key);
    if (chain.at(-1) !== origin) ConstantRegistry.origin.set(`${kind}:${key}`, [...chain, origin]);
  }
  static has(modelRef: Cls): boolean {
    return ConstantRegistry.modelRefNameMap.has(modelRef);
  }
  static getRefName<AllowEmpty extends boolean = false>(
    modelRef: Cls,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {},
  ): AllowEmpty extends true ? string | undefined : string {
    const refName = ConstantRegistry.modelRefNameMap.get(modelRef);
    if (!refName && !allowEmpty) throw new Error(`No ref name for modelRef: ${modelRef}`);
    return refName as AllowEmpty extends true ? string | undefined : string;
  }
  static getModelName(modelRef: Cls): string {
    if (PrimitiveRegistry.has(modelRef)) return PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar);
    const refName = ConstantRegistry.getRefName(modelRef);
    const capRefName = capitalize(refName);
    const modelType = (modelRef as ConstantCls).modelType;
    switch (modelType) {
      case "input":
        return `${capRefName}Input`;
      case "object":
        return `${capRefName}Object`;
      case "full":
        return capRefName;
      case "light":
        return `Light${capRefName}`;
      case "insight":
        return `${capRefName}Insight`;
      case "scalar":
        return capRefName;
      default:
        throw new Error(`Invalid model type: ${modelType}`);
    }
  }
  static isObject(modelRef: Cls<unknown, { modelType?: ConstantType }>) {
    return modelRef.modelType === "object";
  }
  static isFull(modelRef: Cls<unknown, { modelType?: ConstantType }>) {
    return modelRef.modelType === "full";
  }
  static isLight(modelRef: Cls<unknown, { modelType?: ConstantType }>) {
    return modelRef.modelType === "light";
  }
  static isInsight(modelRef: Cls<unknown, { modelType?: ConstantType }>) {
    return modelRef.modelType === "insight";
  }
  static isScalar(modelRef: Cls<unknown, { modelType?: ConstantType }>) {
    return modelRef.modelType === "scalar";
  }
  static setDatabase(refName: string, cnst: ConstantModel) {
    ConstantRegistry.database.set(refName, cnst);
  }
  static getDatabase<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {},
  ): AllowEmpty extends true ? ConstantModel | undefined : ConstantModel {
    const info = ConstantRegistry.database.get(refName);
    if (!info && !allowEmpty) throw new Error(`No database constant model info for ${refName}`);
    return info as AllowEmpty extends true ? ConstantModel | undefined : ConstantModel;
  }
  static setScalar(refName: string, cnst: ScalarConstantModel) {
    if (ConstantRegistry.scalar.has(refName)) return;
    ConstantRegistry.scalar.set(refName, cnst);
  }
  static getScalar<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {},
  ): AllowEmpty extends true ? ScalarConstantModel | undefined : ScalarConstantModel {
    const model = ConstantRegistry.scalar.get(refName);
    if (!model && !allowEmpty) throw new Error(`No scalar constant model for ${refName}`);
    return model as AllowEmpty extends true ? ScalarConstantModel | undefined : ScalarConstantModel;
  }
  static getModelRef(refName: string, modelType?: ConstantType): Cls | typeof PrimitiveScalar {
    if (!modelType) {
      if (PrimitiveRegistry.hasName(refName)) return PrimitiveRegistry.get(refName) as typeof PrimitiveScalar;
      else throw new Error(`No model ref found for ${refName}`);
    } else if (modelType === "scalar") return ConstantRegistry.getScalar(refName).model;
    else return ConstantRegistry.getDatabase(refName)[modelType];
  }
  static buildModel<
    T extends string,
    InputRef extends ConstantModelRef,
    ObjectRef extends ConstantModelRef,
    FullFieldObj extends FieldObject,
    FullRef extends ConstantModelRef<any, FullFieldObj>,
    LightRef extends ConstantModelRef,
    InsightRef extends ConstantModelRef,
    Input = InstanceType<InputRef>,
    Obj = InstanceType<ObjectRef>,
    Full = InstanceType<FullRef>,
    Light = InstanceType<LightRef>,
    Insight = InstanceType<InsightRef>,
  >(
    refName: T,
    inputRef: InputRef,
    objectRef: ObjectRef,
    fullRef: FullRef,
    lightRef: LightRef,
    insightRef: InsightRef,
    constExports: Record<string, unknown>,
    origin?: string,
  ) {
    const modelRefSet = new Set([inputRef, objectRef, fullRef, lightRef, insightRef]);
    for (const modelRef of modelRefSet) ConstantRegistry.modelRefNameMap.set(modelRef, refName);
    inputRef.modelType = "input";
    objectRef.modelType = "object";
    fullRef.modelType = "full";
    lightRef.modelType = "light";
    insightRef.modelType = "insight";
    const cnst: ConstantModel<
      T,
      Input,
      Obj,
      Full,
      Light,
      Insight,
      FullFieldObj,
      Capitalize<T>,
      DefaultOf<Full>,
      DefaultOf<Input>,
      GetStateObject<Full>,
      GetStateObject<Input>,
      DefaultOf<Insight>,
      PurifiedModel<Input>,
      DocumentModel<Full>,
      DocumentModel<Input>,
      QueryOf<any>,
      GetStateObject<Light>,
      GetStateObject<Insight>
    > = {
      refName,
      input: inputRef as unknown as ConstantCls<Input>,
      object: objectRef as unknown as ConstantCls<Obj>,
      full: fullRef as unknown as ConstantCls<Full, FullFieldObj>,
      light: lightRef as unknown as ConstantCls<Light>,
      insight: insightRef as unknown as ConstantCls<Insight>,
      _CapitalizedRefName: null as unknown as Capitalize<T>,
      _Input: null as unknown as Input,
      _Obj: null as unknown as Obj,
      _Full: null as unknown as Full,
      _Light: null as unknown as Light,
      _Insight: null as unknown as Insight,
      _Default: null as unknown as DefaultOf<Full>,
      _DefaultInput: null as unknown as DefaultOf<Input>,
      _DefaultState: null as unknown as GetStateObject<Full>,
      _DefaultStateInput: null as unknown as GetStateObject<Input>,
      _DefaultInsight: null as unknown as DefaultOf<Insight>,
      _PurifiedInput: null as unknown as PurifiedModel<Input>,
      _Doc: null as unknown as DocumentModel<Full>,
      _DocInput: null as unknown as DocumentModel<Input>,
      _QueryOfDoc: null as unknown as QueryOf<any>,
      _StateLight: null as unknown as GetStateObject<Light>,
      _StateInsight: null as unknown as GetStateObject<Insight>,
    };
    ConstantRegistry.setDatabase(refName, cnst as unknown as ConstantModel);
    ConstantRegistry.#addOrigin("database", refName, origin);
    ConstantRegistry.#registerExports(constExports, modelRefSet, origin);
    return cnst;
  }
  static buildScalar<T extends string, Model>(
    refName: T,
    Model: Cls<Model>,
    constExports: Record<string, unknown>,
    origin?: string,
  ): ScalarConstantModel<T, Model, DefaultOf<Model>, DocumentModel<Model>, PurifiedModel<Model>> {
    ConstantRegistry.modelRefNameMap.set(Model, refName);
    const cnst = {
      refName,
      model: Model as unknown as ConstantCls<Model>,
      _Default: null as unknown as DefaultOf<Model>,
      _Doc: null as unknown as DocumentModel<Model>,
      _PurifiedInput: null as unknown as PurifiedModel<Model>,
    };
    //? A second scalar under a taken refName is ignored, so only the registrant that won is recorded.
    if (!ConstantRegistry.scalar.has(refName)) ConstantRegistry.#addOrigin("scalar", refName, origin);
    ConstantRegistry.setScalar(refName, cnst as unknown as ScalarConstantModel);
    ConstantRegistry.#registerExports(constExports, new Set([Model]), origin);
    return cnst;
  }
  static #registerExports(constExports: Record<string, unknown>, modelRefs: Set<unknown>, origin?: string) {
    for (const [key, value] of Object.entries(constExports)) {
      if (modelRefs.has(value)) continue;
      if (typeof value === "function" && isEnum(value as Cls)) {
        const enumKey = lowerlize(key);
        //? A module re-exporting another's enum hands over the same class, which is not a new registrant.
        if (ConstantRegistry.enum.get(enumKey) !== value) ConstantRegistry.#addOrigin("enum", enumKey, origin);
        ConstantRegistry.enum.set(enumKey, value as EnumInstance);
      } else ConstantRegistry.value.set(key, value);
    }
  }
  static serialize<Value>(modelRef: Cls | Cls[], value: Value, nullable: boolean = false, of?: Cls | Cls[]): Value {
    if (Array.isArray(value) && Array.isArray(modelRef)) {
      const singleModelRef = modelRef.at(0);
      if (!singleModelRef) throw new Error("No model ref found");
      return value.map((v: object) => ConstantRegistry.serialize(singleModelRef as Cls, v)) as unknown as Value;
    } else if (modelRef === Map && value instanceof Map) {
      if (!of) throw new Error("A Map needs its value type (of) to serialize");
      return Object.fromEntries(
        [...value.entries()].map(([key, entry]: [string, unknown]) => [key, ConstantRegistry.serialize(of, entry)]),
      ) as unknown as Value;
    } else if (PrimitiveRegistry.has(modelRef as Cls)) {
      return (modelRef as typeof PrimitiveScalar)._serialize(value as PrimitiveValue) as unknown as Value;
    } else if (ConstantRegistry.modelRefNameMap.has(modelRef as Cls)) {
      return serialize(modelRef as ConstantCls, 0, value, "object", { nullable }) as unknown as Value;
    } else throw new Error(`No serialize function for modelRef: ${modelRef}`);
  }
  static deserialize<Value>(modelRef: Cls | Cls[], value: Value, nullable: boolean = false, of?: Cls | Cls[]): Value {
    if (Array.isArray(value) && Array.isArray(modelRef)) {
      const singleModelRef = modelRef.at(0);
      if (!singleModelRef) throw new Error("No model ref found");
      return value.map((v: object) => ConstantRegistry.deserialize(singleModelRef as Cls, v)) as unknown as Value;
    } else if (modelRef === Map && value !== null && typeof value === "object") {
      if (!of) throw new Error("A Map needs its value type (of) to deserialize");
      const entries: [string, unknown][] = value instanceof Map ? [...value.entries()] : Object.entries(value);
      return new Map(entries.map(([key, entry]) => [key, ConstantRegistry.deserialize(of, entry)])) as unknown as Value;
    } else if (PrimitiveRegistry.has(modelRef as Cls)) {
      return (modelRef as typeof PrimitiveScalar)._parse(value as PrimitiveValue) as unknown as Value;
    } else if (ConstantRegistry.modelRefNameMap.has(modelRef as Cls)) {
      return deserialize(modelRef as ConstantCls, 0, value, { nullable }) as unknown as Value;
    } else throw new Error(`No deserialize function for modelRef: ${modelRef}`);
  }
}

export type ConstantOriginKind = "database" | "scalar" | "enum";

export interface ConstantModel<
  T extends string = string,
  Input = any,
  Obj = any,
  Full = any,
  Light = any,
  Insight = any,
  FullFieldObj extends FieldObject = FieldObject,
  _CapitalizedRefName extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<Full>,
  _DefaultStateInput = GetStateObject<Input>,
  _DefaultInsight = DefaultOf<Insight>,
  _PurifiedInput = PurifiedModel<Input>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<_Doc>,
  _StateLight = GetStateObject<Light>,
  _StateInsight = GetStateObject<Insight>,
> {
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

export interface ScalarConstantModel<
  T extends string = string,
  Model = any,
  _Default = DefaultOf<Model>,
  _Doc = DocumentModel<Model>,
  _PurifiedInput = PurifiedModel<Model>,
> {
  refName: T;
  model: ConstantCls<Model>;
  _Default: _Default;
  _Doc: _Doc;
  _PurifiedInput: _PurifiedInput;
}
