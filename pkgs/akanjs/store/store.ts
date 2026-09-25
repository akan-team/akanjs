import {
  ACTION_META,
  type Cls,
  type MergeAllActionTypes,
  type MergeAllKeyOfObjects,
  type SLICE_META,
  STATE_DERIVED_META,
  STATE_INIT_META,
  STATE_META,
} from "akanjs/base";
import { applyMixins } from "akanjs/common";
import type { FilterInstance } from "akanjs/document";
import type { ClientSignal } from "akanjs/fetch";
import type {
  SerializedSlice,
  SlceCnstCapitalizedRefName,
  SlceCnstDefault,
  SlceCnstFull,
  SlceCnstInput,
  SlceCnstInsight,
  SlceCnstLight,
  SlceDbFilter,
  SlceDbSort,
  SliceCls,
} from "akanjs/signal";
import { type DefaultAction, makeActions, makeFormSetter } from "./action";
import { createDatabaseState, createSliceState, type DefaultState } from "./state";
import {
  createDerivedStateBuilder,
  createEmptyDerivedMeta,
  createStateInitializerMap,
  createWritableStateBuilder,
  type DerivedStateBuilder,
  type DerivedStateOf,
  mergeDerivedMeta,
  resolveDerivedState,
  resolveWritableState,
  type StateDerivedMeta,
  type StateInitializerMap,
  type WritableStateBuilder,
  type WritableStateOf,
} from "./stateBuilder";
import type { InternalSlice, SetGet, SetGetWritable, StoreSliceMap, StoreSliceName, StoreSliceSuffix } from "./types";

type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;
type _StoreInput<S extends SliceCls> = SlceCnstInput<S>;
type _StoreFull<S extends SliceCls> = SlceCnstFull<S>;
type _StoreLight<S extends SliceCls> = SlceCnstLight<S>;
type _StoreInsight<S extends SliceCls> = SlceCnstInsight<S>;
type _StoreFilter<S extends SliceCls> = SlceDbFilter<S>;
type _StoreCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;
type _StoreDefault<S extends SliceCls> = SlceCnstDefault<S>;
type _StoreSort<S extends SliceCls> = SlceDbSort<S>;
type StoreSliceOf<
  SlceCls extends SliceCls,
  RefName extends string,
  Suffix extends keyof _SliceMap<SlceCls>,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  CapitalizedRefName extends string,
  Default,
  Sort,
> = InternalSlice<
  _SliceMap<SlceCls>[Suffix],
  RefName,
  StoreSliceSuffix<SlceCls, Suffix>,
  Input,
  Full,
  Light,
  Insight,
  Filter,
  CapitalizedRefName,
  Default,
  Sort
>;

export type StoreCls<
  RefName extends string = string,
  WritableState = any,
  Action = unknown,
  SlceCls extends SliceCls = any,
  DerivedState = unknown,
  State = WritableState & DerivedState,
  _Input = _StoreInput<SlceCls>,
  _Full = _StoreFull<SlceCls>,
  _Light extends { id: string } = _StoreLight<SlceCls>,
  _Insight = _StoreInsight<SlceCls>,
  _Filter extends FilterInstance = _StoreFilter<SlceCls>,
  _CapitalizedRefName extends string = _StoreCap<SlceCls>,
  _Default = _StoreDefault<SlceCls>,
  _Sort = _StoreSort<SlceCls>,
> = Cls<
  SetGetWritable<WritableState, State> &
    Action & {
      slice: {
        [Suffix in keyof _SliceMap<SlceCls> as Suffix extends string
          ? StoreSliceName<RefName, Suffix>
          : never]: StoreSliceOf<
          SlceCls,
          RefName,
          Suffix,
          _Input,
          _Full,
          _Light,
          _Insight,
          _Filter,
          _CapitalizedRefName,
          _Default,
          _Sort
        >;
      };
    },
  {
    readonly type: "module";
    readonly refName: RefName;
    [STATE_META]: State;
    [STATE_INIT_META]: StateInitializerMap;
    [STATE_DERIVED_META]: StateDerivedMeta;
    [ACTION_META]: { [key: string]: (...args: any[]) => any };
    slice: { [key: string]: SerializedSlice };
    _slice: SlceCls[typeof SLICE_META];
  }
>;

export type ModelStore<
  Sig extends ClientSignal<any, any, any> | string,
  WritableState,
  Action,
  DerivedState = unknown,
> = Sig extends string
  ? StoreCls<Sig, WritableState, Action, any, DerivedState>
  : Sig extends ClientSignal<any, any, any>
    ? StoreCls<
        Sig["refName"],
        WritableState & DefaultState<Sig["_slice"]>,
        Action & DefaultAction<Sig["_slice"]>,
        Sig["_slice"],
        DerivedState
      >
    : never;

export type StoreReturn<
  Sig extends ClientSignal<any, any, any> | string,
  WritableState,
  LibStores extends StoreCls[], // TODO: Change Type for LibStores' state and action
  DerivedState = unknown,
  _LibState = MergeAllKeyOfObjects<LibStores, typeof STATE_META>,
  _LibAction = MergeAllActionTypes<LibStores, keyof SetGet | "slice">,
> = ModelStore<Sig, WritableState & _LibState, _LibAction, DerivedState>;

type StateFactory<State> = (builder: WritableStateBuilder) => State;
type DerivedStateFactory<WritableState, DerivedState> = (builder: DerivedStateBuilder<WritableState>) => DerivedState;

export function store<Sig extends ClientSignal<any, any, any> | string, State, LibStores extends StoreCls[]>(
  sigRefOrRefName: Sig,
  state: StateFactory<State>,
  ...libStores: LibStores
): StoreReturn<Sig, WritableStateOf<State>, LibStores>;
export function store<
  Sig extends ClientSignal<any, any, any> | string,
  State,
  DerivedState,
  LibStores extends StoreCls[],
>(
  sigRefOrRefName: Sig,
  state: StateFactory<State>,
  derivedState: DerivedStateFactory<WritableStateOf<State>, DerivedState>,
  ...libStores: LibStores
): StoreReturn<Sig, WritableStateOf<State>, LibStores, DerivedStateOf<DerivedState>>;
export function store<Sig extends ClientSignal<any, any, any> | string, State>(
  sigRefOrRefName: Sig,
  stateFactory: StateFactory<State>,
  ...args: any[]
): any {
  const refName = typeof sigRefOrRefName === "string" ? sigRefOrRefName : sigRefOrRefName.refName;
  const signal: ClientSignal<any, any, any> | null = typeof sigRefOrRefName === "string" ? null : sigRefOrRefName;
  if (typeof stateFactory !== "function")
    throw new Error("store() now requires a state factory: store(sig, ({ persist, session }) => ({ ... }))");
  const [derivedStateFactory, libStores] =
    args.length && typeof args[0] === "function" && !isStoreCls(args[0]) ? [args[0], args.slice(1)] : [null, args];
  const storeCls = class Store {
    static refName = refName;
    static [STATE_META] = {};
    static [STATE_INIT_META] = {};
    static [STATE_DERIVED_META] = createEmptyDerivedMeta();
    static [ACTION_META] = {};
    static slice = {};
  } as StoreCls;
  const writableStateRaw = stateFactory(createWritableStateBuilder());
  const writable = resolveWritableState(refName, writableStateRaw as Record<string, any>);
  Object.assign(storeCls[STATE_META], ...libStores.map((libStore: StoreCls) => libStore[STATE_META]), writable.shape);
  Object.assign(
    storeCls[STATE_INIT_META],
    ...libStores.map(
      (libStore: StoreCls) => libStore[STATE_INIT_META] ?? createStateInitializerMap(libStore[STATE_META]),
    ),
    writable.initializers,
  );
  storeCls[STATE_DERIVED_META] = mergeDerivedMeta(
    ...libStores.map((libStore: StoreCls) => libStore[STATE_DERIVED_META]),
    writable.meta,
  );
  Object.assign(storeCls[ACTION_META], ...libStores.map((libStore) => libStore[ACTION_META]));
  applyMixins(storeCls, libStores);
  if (signal) {
    const signalState = {
      ...createDatabaseState(refName),
      ...createSliceState(refName, signal.serializedSignal.slice ?? {}),
    };
    Object.assign(storeCls[STATE_META], signalState);
    Object.assign(storeCls[STATE_INIT_META], createStateInitializerMap(signalState));
    const actions = {
      ...makeFormSetter(refName, signal.fetch),
      ...makeActions(refName, signal.serializedSignal.slice ?? {}, signal.fetch),
    };
    Object.assign(storeCls.prototype, actions);
    Object.assign(storeCls[ACTION_META], actions);
    Object.assign(storeCls.slice, signal.serializedSignal.slice ?? {});
  }
  if (derivedStateFactory) {
    const writableKeys = new Set(Object.keys(storeCls[STATE_META]));
    const derivedState = derivedStateFactory(createDerivedStateBuilder());
    const derived = resolveDerivedState(derivedState, writableKeys);
    Object.assign(storeCls[STATE_META], derived.shape);
    storeCls[STATE_DERIVED_META] = mergeDerivedMeta(storeCls[STATE_DERIVED_META], derived.meta);
  }
  return storeCls as any;
}

const isStoreCls = (value: unknown): value is StoreCls =>
  Boolean(
    value &&
      typeof value === "function" &&
      (value as StoreCls)[STATE_META] &&
      (value as StoreCls)[ACTION_META] &&
      "refName" in (value as StoreCls),
  );
