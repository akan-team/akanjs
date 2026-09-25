import type { SLICE_META } from "akanjs/base";
import type { DefaultOf } from "akanjs/constant";
import type { ExtractSort, FilterInstance } from "akanjs/document";
import type { SliceCls, SliceInfo, SliceInfoArgs } from "akanjs/signal";
import type { SliceAction } from "./action";
import type { SliceState } from "./state";

export interface Submit {
  disabled: boolean;
  loading: boolean;
  times: number;
}

type IsAny<T> = 0 extends 1 & T ? true : false;
type PickFunc<
  State,
  F extends keyof State = IsAny<State> extends true ? any : keyof State extends never ? any : keyof State,
> = (...fields: F[]) => {
  [K in (typeof fields)[number]]: Exclude<State[K], null | undefined | "loading">;
}; // & { [K in keyof T as T[K] extends (...args: any) => any ? K : never]: T[K] };
export interface SetGet<State = any> {
  set: (setState: Partial<State> | ((state: State) => void)) => void;
  get: () => State;
  pick: PickFunc<State>;
}
export interface SetGetWritable<WritableState = any, State = WritableState> {
  set: (setState: Partial<WritableState> | ((state: WritableState) => void)) => void;
  get: () => State;
  pick: PickFunc<State>;
}
export interface SetPick<State = any> {
  set: (setState: Partial<State> | ((state: State) => void)) => void;
  pick: PickFunc<State>;
}
export type Get<State, Actions> = {
  get: () => State & Actions;
};

export type StoreSliceMap<SlceCls extends SliceCls> = SlceCls[typeof SLICE_META];
export type StoreSliceSuffix<SlceCls extends SliceCls, Suffix extends keyof StoreSliceMap<SlceCls>> = Suffix & string;
export type StoreSliceSuffixCap<SlceCls extends SliceCls, Suffix extends keyof StoreSliceMap<SlceCls>> = Capitalize<
  StoreSliceSuffix<SlceCls, Suffix>
>;
export type StoreSliceArgs<SlceCls extends SliceCls, Suffix extends keyof StoreSliceMap<SlceCls>> = SliceInfoArgs<
  StoreSliceMap<SlceCls>[Suffix]
>;
export type StoreSliceName<RefName extends string, Suffix extends string> = `${RefName}${Capitalize<Suffix>}`;

export type SliceStateAction<
  RefName extends string = string,
  Suffix extends string = "",
  SliceName extends string = StoreSliceName<RefName, Suffix>,
  State = any,
  Action = any,
> = Action & {
  refName: RefName;
  suffix: Suffix;
  sliceName: SliceName;
  get: () => State;
  set: (setState: Partial<State> | ((state: State) => void)) => void;
};

export type InternalSlice<
  SlceInfo extends SliceInfo = any,
  RefName extends string = any,
  Suffix extends string = any,
  Input = any,
  Full = any,
  Light extends { id: string } = any,
  Insight = any,
  Filter extends FilterInstance = any,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _Default = DefaultOf<Full>,
  _Sort = ExtractSort<Filter>,
  _Args extends any[] = SliceInfoArgs<SlceInfo>,
  _SliceState = SliceState<RefName, "", Full, Light, _Args, Insight, Filter, _CapitalizedRefName, "", _Default, _Sort>,
  _SliceAction = SliceAction<RefName, "", Input, Light, _Args, Filter, _CapitalizedRefName, "", _Sort>,
  _SliceName extends string = StoreSliceName<RefName, Suffix>,
> = SliceStateAction<RefName, Suffix, _SliceName, _SliceState, _SliceAction>;
