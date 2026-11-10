import type { ACTION_META, ACTION_OWNER_META, Cls, STATE_DERIVED_META, STATE_INIT_META, STATE_META } from "akanjs/base";
import type { SerializedSlice } from "akanjs/signal";
import type { ActionOwner } from "./actionTag";
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
    [ACTION_OWNER_META]: { [key: string]: ActionOwner };
    slice: { [key: string]: { [key: string]: SerializedSlice } };
    _slice: SliceInfoObj;
    //? Type-only, read by `WithSelectors`: inferring these back out of a merged class grows quadratically with its stores.
    _root: { writable: WritableState; action: Action; slice: InternalSliceObj; state: State };
  }
>;
