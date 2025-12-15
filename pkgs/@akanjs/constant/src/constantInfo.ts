import "reflect-metadata";

import { type GetStateObject, GqlScalar, gqlScalarMap, GqlScalarName, type Type } from "@akanjs/base";

import { CrystalizeFunc, makeCrystalize, makeDefault, makePurify, PurifiedModel, PurifyFunc } from ".";
import { immerify } from "./immerify";
import type { DefaultOf, DocumentModel, QueryOf } from "./types";

export type ModelType = "input" | "object" | "full" | "light" | "insight" | "filter" | "scalar";

export const constantInfo = {
  database: new Map<string, ConstantModel<string, any, any, any, any, any>>(),
  scalar: new Map<string, ScalarConstantModel<any, any, any, any, any>>(),
  modelRefNameMap: new Map<Type, string>(),
  getRefName<AllowEmpty extends boolean = false>(
    modelRef: Type,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true ? string | undefined : string {
    const refName = constantInfo.modelRefNameMap.get(modelRef);
    if (!refName && !allowEmpty) throw new Error(`No ref name for modelRef: ${modelRef}`);
    return refName as AllowEmpty extends true ? string | undefined : string;
  },
  getModelType<AllowEmpty extends boolean = false>(
    modelRef: Type,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true ? ModelType | undefined : ModelType {
    const modelType = Reflect.getMetadata("akan:modeltype", modelRef.prototype as object) as ModelType | undefined;
    if (!modelType && !allowEmpty) throw new Error(`No model type for modelRef: ${modelRef}`);
    return modelType as AllowEmpty extends true ? ModelType | undefined : ModelType;
  },
  setModelType(modelRef: Type, modelType: ModelType) {
    Reflect.defineMetadata("akan:modeltype", modelType, modelRef.prototype as object);
  },
  isObject(modelRef: Type) {
    return constantInfo.getModelType(modelRef, { allowEmpty: true }) === "object";
  },
  isFull(modelRef: Type) {
    return constantInfo.getModelType(modelRef, { allowEmpty: true }) === "full";
  },
  isLight(modelRef: Type) {
    return constantInfo.getModelType(modelRef, { allowEmpty: true }) === "light";
  },
  isInsight(modelRef: Type) {
    return constantInfo.getModelType(modelRef, { allowEmpty: true }) === "insight";
  },
  isFilter(modelRef: Type) {
    return constantInfo.getModelType(modelRef, { allowEmpty: true }) === "filter";
  },
  isScalar(modelRef: Type) {
    return constantInfo.getModelType(modelRef, { allowEmpty: true }) === "scalar";
  },
  setDatabase(refName: string, cnst: ConstantModel<string, any, any, any, any, any>) {
    constantInfo.database.set(refName, cnst);
  },
  getDatabase<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true
    ? ConstantModel<string, any, any, any, any, any> | undefined
    : ConstantModel<string, any, any, any, any, any> {
    const info = constantInfo.database.get(refName);
    if (!info && !allowEmpty) throw new Error(`No database constant model info for ${refName}`);
    return info as AllowEmpty extends true
      ? ConstantModel<string, any, any, any, any, any> | undefined
      : ConstantModel<string, any, any, any, any, any>;
  },
  setScalar(refName: string, cnst: ScalarConstantModel<string, any, any, any, any>) {
    if (constantInfo.scalar.has(refName)) return;
    constantInfo.scalar.set(refName, cnst);
  },
  getScalar<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {}
  ): AllowEmpty extends true
    ? ScalarConstantModel<string, any, any, any, any> | undefined
    : ScalarConstantModel<string, any, any, any, any> {
    const model = constantInfo.scalar.get(refName);
    if (!model && !allowEmpty) throw new Error(`No scalar constant model for ${refName}`);
    return model as AllowEmpty extends true
      ? ScalarConstantModel<string, any, any, any, any> | undefined
      : ScalarConstantModel<string, any, any, any, any>;
  },
  getModelRef(
    refName: string,
    modelType: "input" | "object" | "full" | "light" | "insight" | "scalar"
  ): Type | GqlScalar {
    if (modelType === "scalar") {
      if (gqlScalarMap.has(refName as GqlScalarName)) return gqlScalarMap.get(refName as GqlScalarName) as Type;
      else return constantInfo.getScalar(refName).model;
    } else return constantInfo.getDatabase(refName)[modelType];
  },
};

export interface ConstantModel<
  T extends string,
  Input,
  Obj,
  Full,
  Light,
  Insight,
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<Full>,
  _DefaultStateInput = GetStateObject<Input>,
  _DefaultInsight = DefaultOf<Insight>,
  _PurifiedInput = PurifiedModel<Input>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<_Doc>,
> {
  refName: T;
  input: Type<Input>;
  object: Type<Obj>;
  full: Type<Full>;
  light: Type<Light>;
  insight: Type<Insight>;
  crystalize: CrystalizeFunc<Full>;
  lightCrystalize: CrystalizeFunc<Light>;
  crystalizeInsight: CrystalizeFunc<Insight>;
  purify: PurifyFunc<Input, _DefaultInput, _PurifiedInput>;
  getDefault: () => _Default;
  getDefaultInsight: () => _DefaultInsight;
  _CapitalizedT: _CapitalizedT;
  _Default: _Default;
  _DefaultInput: _DefaultInput;
  _DefaultState: _DefaultState;
  _DefaultStateInput: _DefaultStateInput;
  _DefaultInsight: _DefaultInsight;
  _PurifiedInput: _PurifiedInput;
  _Doc: _Doc;
  _DocInput: _DocInput;
  _QueryOfDoc: _QueryOfDoc;
}
export const cnstOf = <T extends string, Input, Obj, Full, Light, Insight>(
  refName: T,
  inputRef: Type<Input>,
  objectRef: Type<Obj>,
  fullRef: Type<Full>,
  lightRef: Type<Light>,
  insightRef: Type<Insight>,
  option: { overwrite?: any } = {}
): ConstantModel<
  T,
  Input,
  Obj,
  Full,
  Light,
  Insight,
  Capitalize<T>,
  DefaultOf<Full>,
  DefaultOf<Input>,
  GetStateObject<Full>,
  GetStateObject<Input>,
  DefaultOf<Insight>,
  PurifiedModel<Input>,
  DocumentModel<Full>,
  DocumentModel<Input>,
  QueryOf<DocumentModel<Full>>
> => {
  [inputRef, objectRef, fullRef, lightRef, insightRef].forEach((modelRef) => {
    constantInfo.modelRefNameMap.set(modelRef, refName);
  });
  constantInfo.setModelType(inputRef, "input");
  constantInfo.setModelType(objectRef, "object");
  constantInfo.setModelType(fullRef, "full");
  constantInfo.setModelType(lightRef, "light");
  constantInfo.setModelType(insightRef, "insight");

  const cnst = {
    refName,
    input: inputRef,
    object: objectRef,
    full: fullRef,
    light: lightRef,
    insight: insightRef,
    crystalize: makeCrystalize(fullRef, option),
    lightCrystalize: makeCrystalize(lightRef, option),
    crystalizeInsight: makeCrystalize(insightRef, option),
    purify: makePurify(inputRef, option),
    getDefault: () => immerify(fullRef, Object.assign(new fullRef() as object, makeDefault(fullRef, option))),
    getDefaultInsight: () =>
      immerify(insightRef, Object.assign(new insightRef() as object, makeDefault(insightRef, option))),
    _CapitalizedT: null as unknown as Capitalize<T>,
    _Default: null as unknown as DefaultOf<Full>,
    _DefaultInput: null as unknown as DefaultOf<Input>,
    _DefaultState: null as unknown as GetStateObject<Full>,
    _DefaultStateInput: null as unknown as GetStateObject<Input>,
    _DefaultInsight: null as unknown as DefaultOf<Insight>,
    _PurifiedInput: null as unknown as PurifiedModel<Input>,
    _Doc: null as unknown as DocumentModel<Full>,
    _DocInput: null as unknown as DocumentModel<Input>,
    _QueryOfDoc: null as unknown as QueryOf<DocumentModel<Full>>,
  };
  constantInfo.setDatabase(refName, cnst);
  return cnst;
};

export interface ScalarConstantModel<
  T extends string,
  Model,
  _Default = DefaultOf<Model>,
  _Doc = DocumentModel<Model>,
  _PurifiedInput = PurifiedModel<Model>,
> {
  refName: T;
  model: Type<Model>;
  crystalize: CrystalizeFunc<Model>;
  purify: PurifyFunc<Model, _Default, _PurifiedInput>;
  getDefault: () => _Default;
  _Default: _Default;
  _Doc: _Doc;
  _PurifiedInput: _PurifiedInput;
}
export const scalarCnstOf = <T extends string, Model>(
  refName: T,
  Model: Type<Model>
): ScalarConstantModel<T, Model> => {
  constantInfo.setModelType(Model, "scalar");
  constantInfo.modelRefNameMap.set(Model, refName);
  const cnst = {
    refName,
    model: Model,
    crystalize: makeCrystalize(Model),
    purify: makePurify(Model),
    getDefault: () => immerify(Model, Object.assign(new Model() as object, makeDefault(Model))),
    _Default: null as unknown as DefaultOf<Model>,
    _Doc: null as unknown as DocumentModel<Model>,
    _PurifiedInput: null as unknown as PurifiedModel<Model>,
  };
  constantInfo.setScalar(refName, cnst);
  return cnst;
};
