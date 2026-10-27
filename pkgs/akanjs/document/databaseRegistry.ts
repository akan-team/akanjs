import type { ConstantCls } from "akanjs/constant";
import type { DatabaseCls, ExtractQuery, ExtractSort, FilterCls, FilterInstance } from ".";
import type { ModelCls } from "./loaderInfo";

export interface DatabaseModel<
  T extends string = string,
  Input = any,
  Doc = any,
  Model = any,
  Obj = any,
  Insight = any,
  Filter extends FilterInstance = any,
  _Query extends ExtractQuery<Filter> = ExtractQuery<Filter>,
  _Sort extends ExtractSort<Filter> = ExtractSort<Filter>,
> {
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
export class DatabaseRegistry {
  static #database = new Map<string, DatabaseModel>();
  static #scalar = new Map<string, DatabaseCls>();
  static #modelSets = {
    input: new Set<DatabaseCls>(),
    doc: new Set<DatabaseCls>(),
    model: new Set<DatabaseCls>(),
    filter: new Set<DatabaseCls>(),
    scalar: new Set<DatabaseCls>(),
  };
  static isInput(modelRef: DatabaseCls) {
    return DatabaseRegistry.#modelSets.input.has(modelRef);
  }
  static isDoc(modelRef: DatabaseCls) {
    return DatabaseRegistry.#modelSets.doc.has(modelRef);
  }
  static isModel(modelRef: DatabaseCls) {
    return DatabaseRegistry.#modelSets.model.has(modelRef);
  }
  static isScalar(modelRef: DatabaseCls) {
    return DatabaseRegistry.#modelSets.scalar.has(modelRef);
  }
  //? The latest wins here as in ConstantRegistry and DiLifecycle: an app re-declares a lib's model after the lib does.
  static setDatabase(refName: string, dbModel: DatabaseModel) {
    DatabaseRegistry.#database.set(refName, dbModel);
    return dbModel;
  }
  static getDatabase<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {},
  ): AllowEmpty extends true ? DatabaseModel | undefined : DatabaseModel {
    const info = DatabaseRegistry.#database.get(refName);
    if (!info && !allowEmpty) throw new Error(`No database document model info for ${refName}`);
    return info as AllowEmpty extends true ? DatabaseModel | undefined : DatabaseModel;
  }
  static setScalar(refName: string, Model: DatabaseCls) {
    DatabaseRegistry.#scalar.set(refName, Model);
  }
  static getScalar<AllowEmpty extends boolean = false>(
    refName: string,
    { allowEmpty }: { allowEmpty?: AllowEmpty } = {},
  ): AllowEmpty extends true ? DatabaseCls | undefined : DatabaseCls {
    const model = DatabaseRegistry.#scalar.get(refName);
    if (!model && !allowEmpty) throw new Error(`No scalar model for ${refName}`);
    return model as AllowEmpty extends true ? DatabaseCls | undefined : DatabaseCls;
  }

  static buildModel<
    T extends string,
    Input,
    Doc,
    Model,
    Obj,
    Insight,
    Filter extends FilterInstance,
    _Query extends ExtractQuery<Filter> = ExtractQuery<Filter>,
    _Sort extends ExtractSort<Filter> = ExtractSort<Filter>,
  >(
    refName: T,
    input: DatabaseCls<Input>,
    doc: DatabaseCls<Doc>,
    model: ModelCls<Model>,
    obj: ConstantCls<Obj>,
    insight: DatabaseCls<Insight>,
    filter: FilterCls<Filter>,
  ): DatabaseModel<T, Input, Doc, Model, Obj, Insight, Filter, _Query, _Sort> {
    const dbInfo = {
      refName,
      input,
      doc,
      model,
      obj,
      insight,
      filter,
      _Query: null as unknown as _Query,
      _Sort: null as unknown as _Sort,
    } as DatabaseModel<T, Input, Doc, Model, Obj, Insight, Filter, _Query, _Sort>;
    DatabaseRegistry.setDatabase(refName, dbInfo);
    return dbInfo;
  }

  static buildScalar<T extends string, Model>(refName: T, Model: DatabaseCls<Model>): DatabaseCls<Model> {
    DatabaseRegistry.setScalar(refName, Model);
    return Model;
  }
}
