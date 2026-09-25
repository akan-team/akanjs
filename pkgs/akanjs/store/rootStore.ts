import type { ACTION_META, Cls, STATE_DERIVED_META, STATE_INIT_META, STATE_META } from "akanjs/base";
import type { SerializedSlice } from "akanjs/signal";
import type { StateDerivedMeta, StateInitializerMap } from "./stateBuilder";
import type { SetGetWritable } from "./types";

export type RootStoreCls<
  RefName extends string = any,
  WritableState = any,
  Action = any,
  InternalSliceObj = any,
  SliceInfoObj = any,
  DerivedState = unknown,
  State = WritableState & DerivedState,
> = Cls<
  SetGetWritable<WritableState, State> & Action & { slice: InternalSliceObj },
  {
    readonly type: "root";
    refName: RefName;
    [STATE_META]: State;
    [STATE_INIT_META]: StateInitializerMap;
    [STATE_DERIVED_META]: StateDerivedMeta;
    [ACTION_META]: { [key: string]: (...args: any[]) => any };
    slice: { [key: string]: { [key: string]: SerializedSlice } };
    _slice: SliceInfoObj;
  }
>;
