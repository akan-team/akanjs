import type { DataList, GetStateObject, PromiseOrObject } from "akanjs/base";
import type { ExtractSort, FilterInstance } from "akanjs/document";

/** Metadata that identifies a generated slice list/insight request. */
export type SliceMeta = {
  refName: string;
  sliceName: string;
  argLength: number;
};

/** What the root slice takes: one of the model's declared filter queries, and the args that filter asks for. */
export interface QuerySetting {
  queryKey: string;
  /**
   * Read when the query is applied rather than when the setting is written, so a thunk keeps an arg relative to
   * now — `() => [dayjs().subtract(1, "hour")]` — current at the moment the user asks for it.
   */
  args?: unknown[] | (() => unknown[]);
  /**
   * The same list under the name the rest of the framework already uses for it — the `queryArgsOf<Model>` state
   * key, `refresh<Model>({ queryArgs })`, and a field's own `.meta(...)` declaration. Accepted so a query a
   * field declares is one of these as it stands, rather than something every caller has to rename by hand.
   * `args` wins when both are given.
   */
  queryArgs?: unknown[] | (() => unknown[]);
}

export type ServerInit<
  RefName extends string,
  Light,
  Insight = any,
  QueryArgs = any,
  Filter extends FilterInstance = any,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _LightObj = GetStateObject<Light>,
  _InsightObj = GetStateObject<Insight>,
  _Sort = ExtractSort<Filter>,
> = SliceMeta & {
  [K in `${RefName}ObjList`]: _LightObj[];
} & {
  [K in `${RefName}ObjInsight`]: _InsightObj;
} & {
  [K in `pageOf${_CapitalizedRefName}`]: number;
} & {
  [K in `lastPageOf${_CapitalizedRefName}`]: number;
} & {
  [K in `limitOf${_CapitalizedRefName}`]: number;
} & {
  [K in `queryArgsOf${_CapitalizedRefName}`]: QueryArgs;
} & {
  [K in `sortOf${_CapitalizedRefName}`]: _Sort;
} & {
  [K in `${RefName}InitAt`]: Date;
};
/** Client/server-friendly return type for initialized list and insight data. */
export type ClientInit<
  RefName extends string,
  Light,
  Insight = any,
  QueryArgs = any,
  Filter extends FilterInstance = any,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _LightObj = GetStateObject<Light>,
  _InsightObj = GetStateObject<Insight>,
  _Sort = ExtractSort<Filter>,
> = PromiseOrObject<
  ServerInit<RefName, Light, Insight, QueryArgs, Filter, _CapitalizedRefName, _LightObj, _InsightObj, _Sort>
>;

export type ServerView<RefName extends string, Model> = { refName: RefName } & {
  [K in `${RefName}Obj`]: GetStateObject<Model>;
} & {
  [K in `${RefName}ViewAt`]: Date;
};
/** Client/server-friendly return type for a single model view payload. */
export type ClientView<RefName extends string, Model> = PromiseOrObject<ServerView<RefName, Model>>;

export type ServerEdit<RefName extends string, Model> = { refName: RefName } & {
  [K in `${RefName}Obj`]: GetStateObject<Model>;
} & {
  [K in `${RefName}ViewAt`]: Date;
};
export type ClientEdit<RefName extends string, Model> = PromiseOrObject<ServerEdit<RefName, Model>>;

export type ViewReturn<RefName extends string, Full> = {
  [K in RefName]: Full;
} & {
  [K in `${RefName}View`]: ServerView<RefName, Full>;
};

export type EditReturn<RefName extends string, Full> = {
  [K in RefName]: Full;
} & {
  [K in `${RefName}Edit`]: ServerEdit<RefName, Full>;
};

export type InitReturn<
  RefName extends string,
  Suffix extends string,
  Light,
  Insight,
  Args,
  Filter extends FilterInstance,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CapitalizedSuffix extends string = Capitalize<Suffix>,
  _Light extends { id: string } = Light extends { id: string } ? Light : { id: string },
  _LightObj = GetStateObject<_Light>,
  _InsightObj = GetStateObject<Insight>,
  _Sort = ExtractSort<Filter>,
> = {
  [K in `${RefName}Init${_CapitalizedSuffix}`]: ServerInit<
    RefName,
    Light,
    Insight,
    Args,
    Filter,
    _CapitalizedRefName,
    _LightObj,
    _InsightObj,
    _Sort
  >;
} & {
  [K in `${RefName}List${_CapitalizedSuffix}`]: DataList<_Light>;
} & { [K in `${RefName}Insight${_CapitalizedSuffix}`]: Insight };

// ============= Method Generators =============
