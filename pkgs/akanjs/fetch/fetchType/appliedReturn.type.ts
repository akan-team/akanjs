import type { DataList, GetStateObject, PromiseOrObject } from "akanjs/base";
import type { ExtractSort, FilterInstance } from "akanjs/document";

export type SliceMeta<Sort = unknown> = {
  refName: string;
  sliceName: string;
  argLength: number;
  /** Type-only, never set: the slice filter's sort keys, which a `sort` passed beside this meta narrows to. */
  _Sort?: Sort;
  /** Set by a server render under `clientRuntime: "route"`: the client reference whose load brings this model's store. */
  _runtime?: unknown;
};

/** What the root slice takes: one of the model's declared filter queries, and the args that filter asks for. */
export interface QuerySetting {
  queryKey: string;
  /** Read when the query is applied, so a thunk keeps an arg relative to now. */
  args?: unknown[] | (() => unknown[]);
  /** `args` under the framework's usual name (`queryArgsOf<Model>`, a field's `.meta(...)`); `args` wins over it. */
  queryArgs?: unknown[] | (() => unknown[]);
}

type ServerInitShape<
  RefName extends string,
  QueryArgs,
  CapRefName extends string,
  LightObj,
  InsightObj,
  Sort,
> = SliceMeta & {
  [K in `${RefName}ObjList`]: LightObj[];
} & {
  /** `null` when the caller passed `{ insight: false }`: the aggregate query was never made. */
  [K in `${RefName}ObjInsight`]: InsightObj | null;
} & {
  [K in `pageOf${CapRefName}`]: number;
} & {
  [K in `lastPageOf${CapRefName}`]: number;
} & {
  [K in `limitOf${CapRefName}`]: number;
} & {
  [K in `hasMoreOf${CapRefName}`]: boolean;
} & {
  [K in `queryArgsOf${CapRefName}`]: QueryArgs;
} & {
  [K in `sortOf${CapRefName}`]: Sort;
} & {
  [K in `${RefName}InitAt`]: Date;
};

export type ServerInit<
  RefName extends string,
  Light,
  Insight = any,
  QueryArgs = any,
  Filter extends FilterInstance = any,
> = ServerInitShape<
  RefName,
  QueryArgs,
  Capitalize<RefName>,
  GetStateObject<Light>,
  GetStateObject<Insight>,
  ExtractSort<Filter>
>;
export type ClientInit<
  RefName extends string,
  Light,
  Insight = any,
  QueryArgs = any,
  Filter extends FilterInstance = any,
> = PromiseOrObject<ServerInit<RefName, Light, Insight, QueryArgs, Filter>>;

export type ServerView<RefName extends string, Model> = { refName: RefName; _runtime?: unknown } & {
  [K in `${RefName}Obj`]: GetStateObject<Model>;
} & {
  [K in `${RefName}ViewAt`]: Date;
};
export type ClientView<RefName extends string, Model> = PromiseOrObject<ServerView<RefName, Model>>;

export type ServerEdit<RefName extends string, Model> = { refName: RefName; _runtime?: unknown } & {
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

/** Awaitable as the shape the helper always gave, and destructurable into one promise per field. */
export type FetchHandleOf<Awaited, Fields> = PromiseLike<Awaited> & Fields;

export type ViewHandle<RefName extends string, Full> = FetchHandleOf<
  ViewReturn<RefName, Full>,
  {
    [K in RefName]: Promise<Full>;
  } & {
    [K in `${RefName}View`]: Promise<ServerView<RefName, Full>>;
  }
>;

export type EditHandle<RefName extends string, Full> = FetchHandleOf<
  EditReturn<RefName, Full>,
  {
    [K in RefName]: Promise<Full>;
  } & {
    [K in `${RefName}Edit`]: Promise<ServerEdit<RefName, Full>>;
  }
>;

type InitReturnShape<
  RefName extends string,
  CapSuffix extends string,
  Init,
  ListItem extends { id: string },
  Insight,
> = {
  [K in `${RefName}Init${CapSuffix}`]: Init;
} & {
  [K in `${RefName}List${CapSuffix}`]: DataList<ListItem>;
} & { [K in `${RefName}Insight${CapSuffix}`]: Insight };

export type InitReturn<
  RefName extends string,
  Suffix extends string,
  Light,
  Insight,
  Args,
  Filter extends FilterInstance,
> = InitReturnShape<
  RefName,
  Capitalize<Suffix>,
  ServerInit<RefName, Light, Insight, Args, Filter>,
  Light extends { id: string } ? Light : { id: string },
  Insight
>;

/**
 * `x<Slice>List` lands before `x<Slice>Init`, which needs the count. List and Insight hold hydrated instances React
 * Flight refuses as client props: consume them in a server component and hand `x<Slice>Init` to a `Zone`.
 */
type InitHandleShape<
  RefName extends string,
  CapSuffix extends string,
  Init,
  ListItem extends { id: string },
  Insight,
> = {
  [K in `${RefName}Init${CapSuffix}`]: Promise<Init>;
} & {
  [K in `${RefName}List${CapSuffix}`]: Promise<DataList<ListItem>>;
} & { [K in `${RefName}Insight${CapSuffix}`]: Promise<Insight> };

export type InitHandle<
  RefName extends string,
  Suffix extends string,
  Light,
  Insight,
  Args,
  Filter extends FilterInstance,
> = FetchHandleOf<
  InitReturn<RefName, Suffix, Light, Insight, Args, Filter>,
  InitHandleShape<
    RefName,
    Capitalize<Suffix>,
    ServerInit<RefName, Light, Insight, Args, Filter>,
    Light extends { id: string } ? Light : { id: string },
    Insight
  >
>;
