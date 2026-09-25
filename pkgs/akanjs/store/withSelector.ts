import type { Prettify } from "akanjs/base";
import type { FieldState } from "akanjs/constant";
import type { RefObject } from "react";
import type { RootStoreCls } from "./rootStore";
import type { SliceStateAction } from "./types";

type SetKey<Key extends string> = `set${Capitalize<Key>}`;

export type WithSelectors<RtStoreCls extends RootStoreCls> =
  RtStoreCls extends RootStoreCls<any, infer WritableState, infer Action, infer InternalSliceObj, any, any, infer State>
    ? WithSelectorsOf<State, WritableState, Action, InternalSliceObj>
    : never;

type WithSelectorsOf<State, WritableState, Action, InternalSliceObj> = {
  sub: {
    (listener: (state: State, prev: State) => void): () => void;
    <U>(
      selector: (state: State) => U,
      listener: (state: U, prev: U) => void,
      options?: {
        equalityFn?: (a: U, b: U) => boolean;
        fireImmediately?: boolean;
      },
    ): () => void;
  };
  ref: <U>(selector: (state: State) => U) => RefObject<U>;
  sel: <U>(selector: (state: State) => U, equals?: (a: U, b: U) => boolean) => U;
  use: {
    [K in keyof State]: () => State[K];
  };
  do: Action & {
    [K in keyof WritableState as K extends string ? SetKey<K> : never]: (value: FieldState<WritableState[K]>) => void;
  };
  get: () => State;
  set: (state: Partial<WritableState> | ((state: WritableState) => any)) => void;
  slice: {
    [K in keyof InternalSliceObj]: InternalSliceObj[K] extends SliceStateAction<
      infer RefName,
      infer Suffix,
      infer SliceName,
      infer State,
      infer Action
    >
      ? SliceSelectors<RefName, State, Action>
      : never;
  };
};

export interface SliceSelectors<RefName extends string, State, Action> {
  refName: RefName;
  use: {
    [K in keyof State]: () => State[K];
  };
  do: Prettify<
    {
      [K in keyof Action]: Action[K];
    } & {
      [K in keyof State as K extends string ? SetKey<K> : never]: (value: FieldState<State[K]>) => void;
    }
  >;
  get: () => State;
}
