import { DataList, type Dayjs, FIELD_META, type GetStateObject } from "akanjs/base";
import {
  capitalize,
  type DynamicRecord,
  deepObjectify,
  type FetchPolicy,
  isQueryEqual,
  Logger,
  pathSet,
  plainFieldsOf,
  resolveFileUploadCapability,
} from "akanjs/common";
import {
  type BaseInsight,
  type BaseObject,
  ConstantRegistry,
  type DefaultOf,
  type FieldState,
  immerify,
  type ProtoFile,
  type ProtoLightFile,
  withSharedInstances,
} from "akanjs/constant";
import type { BaseFilterSortKey, ExtractSort, FilterInstance } from "akanjs/document";
import type { FetchInitForm, FetchProxy } from "akanjs/fetch";
import type {
  LiveEventPayload,
  SerializedSlice,
  SlceCnstCapitalizedRefName,
  SlceCnstDefault,
  SlceCnstDefaultInput,
  SlceCnstFull,
  SlceCnstInput,
  SlceCnstLight,
  SlceCnstRefName,
  SlceDbFilter,
  SlceDbSort,
  SliceCls,
} from "akanjs/signal";
import { expandQueryArgs, normalizeQueryArgs } from "../fetch/client/sliceQueryArgs";
import { tagAction } from "./actionTag";
import { databaseStateNames } from "./databaseStateNames";
import { DraftStore } from "./draftStore";
import { formSetterNames } from "./formSetterNames";
import { type LiveSortableRow, livePlacementIndex } from "./liveInsert";
import { SliceRequest } from "./SliceRequest";
import { sliceKeysOf } from "./sliceKeys";
import type { DraftState } from "./state";
import type { SetGet, StoreSliceArgs, StoreSliceMap, StoreSliceSuffixCap } from "./types";

type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;
type _ActionRefName<S extends SliceCls> = SlceCnstRefName<S>;
type _ActionCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;
type _ActionInput<S extends SliceCls> = SlceCnstInput<S>;
type _ActionFull<S extends SliceCls> = SlceCnstFull<S>;
type _ActionLight<S extends SliceCls> = SlceCnstLight<S>;
type _ActionDefault<S extends SliceCls> = SlceCnstDefault<S>;
type _ActionDefaultInput<S extends SliceCls> = SlceCnstDefaultInput<S>;
type _ActionFilter<S extends SliceCls> = SlceDbFilter<S>;
type _ActionSort<S extends SliceCls> = SlceDbSort<S>;
type SliceInitForm<S extends SliceCls> = FetchInitForm<_ActionInput<S>, _ActionFilter<S>> & FetchPolicy;
type SliceRefreshForm<S extends SliceCls, Suffix extends keyof _SliceMap<S>> = SliceInitForm<S> & {
  queryArgs?: StoreSliceArgs<S, Suffix>;
};

const UPLOAD_POLL_INTERVAL_MS = 3000;
const UPLOAD_POLL_ATTEMPTS = 40;

export interface CreateOption<Full extends { id: string }> {
  path?: string;
  modal?: string;
  sliceName?: string;
  onError?: (e: string) => void;
  onSuccess?: (model: Full) => void | Promise<void>;
}
export interface NewOption {
  modal?: string;
  setDefault?: boolean;
  sliceName?: string;
  /** Built by the shell from the raw seed (merged date defaults would rotate the key). Absent means no draft. */
  draftScope?: string;
}
export interface EditOption {
  modal?: string | null;
  /** Built by the shell from the record id. Absent means no draft. */
  draftScope?: string;
}
type PartialOrNull<O> = { [K in keyof O]?: O[K] | null };

type BaseAction<
  RefName extends string,
  Input,
  Full extends { id: string },
  Light,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CreateOption = CreateOption<Full>,
  _InputData = GetStateObject<Input>,
> = {
  [K in `create${_CapitalizedRefName}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `update${_CapitalizedRefName}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `create${_CapitalizedRefName}`]: (data: _InputData, options?: _CreateOption) => Promise<void>;
} & {
  [K in `update${_CapitalizedRefName}`]: (id: string, data: _InputData, options?: _CreateOption) => Promise<void>;
} & {
  [K in `remove${_CapitalizedRefName}`]: (
    id: string,
    options?: FetchPolicy & { modal?: string | null },
  ) => Promise<void>;
} & {
  [K in `check${_CapitalizedRefName}Submitable`]: (disabled?: boolean) => Promise<void>;
} & {
  [K in `submit${_CapitalizedRefName}`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `new${_CapitalizedRefName}`]: (partial?: PartialOrNull<Full>, options?: NewOption) => void;
} & {
  [K in `edit${_CapitalizedRefName}`]: (model: Full | string, options?: EditOption & FetchPolicy) => Promise<void>;
} & {
  [K in `load${_CapitalizedRefName}FormDraft`]: (draftScope?: string) => Promise<void>;
} & {
  [K in `restore${_CapitalizedRefName}FormDraft`]: () => void;
} & {
  [K in `discard${_CapitalizedRefName}FormDraft`]: () => void;
} & {
  [K in `merge${_CapitalizedRefName}`]: (
    model: Full | string,
    data: Partial<Full>,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [K in `view${_CapitalizedRefName}`]: (
    model: Full | string,
    options?: { modal?: string | null } & FetchPolicy,
  ) => Promise<void>;
} & { [K in `set${_CapitalizedRefName}`]: (...models: (Full | Light)[]) => void } & {
  [K in `reset${_CapitalizedRefName}`]: (model?: Full) => void;
};

export type SliceAction<
  RefName extends string,
  Suffix extends string,
  Input,
  Light,
  QueryArgs extends any[],
  Filter extends FilterInstance,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CapitalizedSuffix extends string = Capitalize<Suffix>,
  _Sort = ExtractSort<Filter>,
  _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Filter> & FetchPolicy,
> = {
  [KDefaultOf in `init${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    ...args: [...args: QueryArgs, initForm?: _FetchInitFormWithFetchPolicy]
  ) => Promise<void>;
} & {
  [K in `refresh${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    initForm?: _FetchInitFormWithFetchPolicy & { queryArgs?: QueryArgs },
  ) => Promise<void>;
} & {
  [K in `select${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    model: Light | Light[],
    options?: { refresh?: boolean; remove?: boolean },
  ) => void;
} & {
  [K in `setPageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (page: number, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `loadMoreOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (options?: FetchPolicy) => Promise<void>;
} & {
  [K in `setLimitOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    limit: number,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [K in `setQueryArgsOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    ...args:
      | [...args: QueryArgs, options?: FetchPolicy]
      | [setQueryArgs: (...prevQueryArgs: QueryArgs) => QueryArgs, options?: FetchPolicy]
  ) => Promise<void>;
} & {
  [K in `setSortOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (sort: _Sort, options?: FetchPolicy) => Promise<void>;
};

type SingleOf<M> = M extends (infer V)[] ? V : never;
type SetterKey<
  Prefix extends string,
  Key extends string,
  RefName extends string,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CapitalizedK extends string = Capitalize<Key>,
> = `${Prefix}${_CapitalizedK}On${_CapitalizedRefName}`;

type FieldFormSetter<DefaultState, RefName extends string, _CapitalizedRefName extends string = Capitalize<RefName>> = {
  [Key in keyof DefaultState as Key extends string ? SetterKey<"set", Key, RefName, _CapitalizedRefName> : never]: (
    value: FieldState<DefaultState[Key]> | (DefaultState[Key] extends any[] ? never : null),
  ) => void;
};
type ArrayFieldAddSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
  [K in keyof _DefaultState as _DefaultState[K] extends any[]
    ? K extends string
      ? SetterKey<"add", K, RefName, _CapRef>
      : never
    : never]: (
    value: DefaultOf<SingleOf<_DefaultState[K]>> | DefaultOf<SingleOf<_DefaultState[K]>>[],
    options?: { idx?: number; limit?: number },
  ) => void;
};
type ArrayFieldSubSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
  [K in keyof _DefaultState as _DefaultState[K] extends any[]
    ? K extends string
      ? SetterKey<"sub", K, RefName, _CapRef>
      : never
    : never]: (idx: number | number[]) => void;
};
type ArrayFieldAddOrSubSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
  [K in keyof _DefaultState as _DefaultState[K] extends any[]
    ? K extends string
      ? SetterKey<"addOrSub", K, RefName, _CapRef>
      : never
    : never]: (value: DefaultOf<SingleOf<_DefaultState[K]>>, options?: { idx?: number; limit?: number }) => void;
};

type FormSetter<
  Full,
  RefName extends string,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _DefaultState = DefaultOf<Full>,
> = FieldFormSetter<_DefaultState, RefName, _CapitalizedRefName> &
  ArrayFieldAddSetters<RefName, _CapitalizedRefName, _DefaultState> &
  ArrayFieldSubSetters<RefName, _CapitalizedRefName, _DefaultState> &
  ArrayFieldAddOrSubSetters<RefName, _CapitalizedRefName, _DefaultState> & {
    [K in keyof _DefaultState as _DefaultState[K] extends (ProtoLightFile | null) | ProtoLightFile[]
      ? K extends string
        ? SetterKey<"upload", K, RefName, _CapitalizedRefName>
        : never
      : never]: (fileList: FileList | File[], idx?: number) => Promise<void>;
  } & {
    [K in `writeOn${_CapitalizedRefName}`]: (path: string | (string | number)[], value: any) => void;
  };

type DefaultSliceActionFields<
  SlceCls extends SliceCls,
  _CapRef extends string,
  _FetchInitFormWithFetchPolicy,
  _Light,
  _Sort,
  _Suffixes extends keyof _SliceMap<SlceCls> = keyof _SliceMap<SlceCls>,
> = {
  [Suffix in _Suffixes as `init${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    ...args: [...args: StoreSliceArgs<SlceCls, Suffix>, initForm?: _FetchInitFormWithFetchPolicy]
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `refresh${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    initForm?: SliceRefreshForm<SlceCls, Suffix>,
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `select${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    model: _Light | _Light[],
    options?: { refresh?: boolean; remove?: boolean },
  ) => void;
} & {
  [Suffix in _Suffixes as
    | `setPageOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `setLimitOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    value: number,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `loadMoreOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `setQueryArgsOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    ...args:
      | [...args: StoreSliceArgs<SlceCls, Suffix>, options?: FetchPolicy]
      | [
          setQueryArgs: (...prevQueryArgs: StoreSliceArgs<SlceCls, Suffix>) => StoreSliceArgs<SlceCls, Suffix>,
          options?: FetchPolicy,
        ]
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `setSortOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    sort: _Sort,
    options?: FetchPolicy,
  ) => Promise<void>;
};

export type DefaultAction<
  SlceCls extends SliceCls,
  _RefName extends string = _ActionRefName<SlceCls>,
  _Input = _ActionInput<SlceCls>,
  _Full extends { id: string } = _ActionFull<SlceCls>,
  _Light = _ActionLight<SlceCls>,
  _Filter extends FilterInstance = _ActionFilter<SlceCls>,
  _CapitalizedRefName extends string = _ActionCap<SlceCls>,
  _Default = _ActionDefault<SlceCls>,
  _DefaultInput = _ActionDefaultInput<SlceCls>,
  _Sort = _ActionSort<SlceCls>,
  _CreateOption = CreateOption<_Full>,
  _FetchInitFormWithFetchPolicy = SliceInitForm<SlceCls>,
> = BaseAction<_RefName, _Input, _Full, _Light, _CapitalizedRefName, _CreateOption> &
  FormSetter<_Full, _RefName, _CapitalizedRefName, _Default> &
  DefaultSliceActionFields<SlceCls, _CapitalizedRefName, _FetchInitFormWithFetchPolicy, _Light, _Sort>;

export const makeFormSetter = (refName: string, fetch: FetchProxy<any>) => {
  type Light = BaseObject;
  const [fieldName, className] = [refName, capitalize(refName)];
  const modelRef = ConstantRegistry.getDatabase(refName).full;
  const fileUploadRefName = resolveFileUploadCapability(fetch.serializedSignal)?.refName;

  const names = {
    modelForm: `${fieldName}Form`,
    writeOnModel: `writeOn${className}`,
    addModelFiles: `add${className}Files`,
  };
  const baseSetAction = {
    [names.writeOnModel]: function (this: SetGet, path: string | (string | number)[], value: any) {
      this.set((state: { [key: string]: any }) => {
        pathSet(state[names.modelForm], path, value);
      });
    },
  };
  const fieldSetAction = Object.entries(modelRef[FIELD_META]).reduce((acc, [key, field]) => {
    const namesOfField = formSetterNames(className, key);
    const singleFieldSetAction = {
      [namesOfField.setFieldOnModel]: function (this: SetGet, value: any | null) {
        this.set((state: { [key: string]: any }) => {
          const setValue =
            value === null
              ? null
              : field.isClass
                ? immerify<object>(field.modelRef, value as object)
                : (value as object);
          (state[names.modelForm] as { [key: string]: any })[namesOfField.field] = setValue;
        });
        // After the write, so a hook that reads the field sees the new value.
        const postSet = (this as unknown as { [key: string]: ((value: unknown) => unknown) | undefined })[
          namesOfField.postSetField
        ];
        if (postSet) void postSet.call(this, value);
      },
      ...(field.isArray
        ? {
            [namesOfField.addFieldOnModel]: function (
              this: SetGet,
              value: Light | Light[],
              options: { idx?: number; limit?: number } = {},
            ) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
              const length = (form[namesOfField.field] as unknown[]).length;
              if (options.limit && options.limit <= length) return;
              const idx = options.idx ?? length;
              const setValue = field.isClass ? immerify<Light | Light[]>(field.modelRef, value) : value;
              this.set((state: { [key: string]: any }) => {
                (state[names.modelForm] as { [key: string]: any })[namesOfField.field] = [
                  ...(form[namesOfField.field] as object[]).slice(0, idx),
                  ...(Array.isArray(setValue) ? setValue : [setValue]),
                  ...(form[namesOfField.field] as object[]).slice(idx),
                ];
              });
            },
            [namesOfField.subFieldOnModel]: function (this: SetGet, idx: number | number[]) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: object[] };
              this.set((state: { [key: string]: any }) => {
                (state[names.modelForm] as { [key: string]: any })[namesOfField.field] =
                  typeof idx === "number"
                    ? form[namesOfField.field].filter((_, i) => i !== idx)
                    : form[namesOfField.field].filter((_, i) => !idx.includes(i));
              });
            },
            [namesOfField.addOrSubFieldOnModel]: function (
              this: SetGet,
              value: any,
              options: { idx?: number; limit?: number } = {},
            ) {
              const { [names.modelForm]: form } = this.get() as { [key: string]: { [key: string]: any[] } };
              const index = form[namesOfField.field].indexOf(value);
              if (index === -1)
                ((this as unknown as DynamicRecord)[namesOfField.addFieldOnModel] as (...args: any) => void)(
                  value,
                  options,
                );
              else ((this as unknown as DynamicRecord)[namesOfField.subFieldOnModel] as (...args: any) => void)(index);
            },
          }
        : {}),
      ...(field.isClass && fileUploadRefName && ConstantRegistry.getRefName(field.modelRef) === fileUploadRefName
        ? {
            [namesOfField.uploadFieldOnModel]: async function (
              this: SetGet,
              fileList: FileList | File[],
              index?: number,
            ) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
              if (!fileList.length) return;
              const files = await (fetch[names.addModelFiles] as (...args: any) => Promise<ProtoFile[]>)(
                fileList,
                form.id,
              );
              if (field.isArray) {
                const idx = index ?? (form[namesOfField.field] as ProtoLightFile[]).length;
                this.set((state: { [key: string]: { [key: string]: ProtoLightFile[] } }) => {
                  state[names.modelForm][namesOfField.field] = [
                    ...(form[namesOfField.field] as ProtoLightFile[]).slice(0, idx),
                    ...files,
                    ...(form[namesOfField.field] as ProtoLightFile[]).slice(idx),
                  ];
                });
              } else {
                this.set((state: { [key: string]: { [key: string]: ProtoLightFile | null } }) => {
                  state[names.modelForm][namesOfField.field] = files[0];
                });
              }
              // A light-declared field stores the light projection, so the poll re-reads through the light endpoint.
              const fileReadName = ConstantRegistry.isLight(field.modelRef)
                ? `light${capitalize(fileUploadRefName)}`
                : fileUploadRefName;
              files.forEach((file) => {
                let attemptsLeft = UPLOAD_POLL_ATTEMPTS;
                const intervalKey = setInterval(() => {
                  void (async () => {
                    attemptsLeft -= 1;
                    try {
                      const currentFile = await (
                        (fetch as { [key: string]: any })[fileReadName] as (id: string) => Promise<ProtoLightFile>
                      )(file.id);
                      if (field.isArray)
                        this.set((state: { [key: string]: { [key: string]: ProtoLightFile[] } }) => {
                          state[names.modelForm][namesOfField.field] = state[names.modelForm][namesOfField.field].map(
                            (file) => (file.id === currentFile.id ? currentFile : file),
                          );
                        });
                      else
                        this.set((state: { [key: string]: { [key: string]: ProtoLightFile | null } }) => {
                          state[names.modelForm][namesOfField.field] = currentFile;
                        });
                      if (currentFile.status !== "uploading" || attemptsLeft <= 0) clearInterval(intervalKey);
                    } catch (error) {
                      clearInterval(intervalKey);
                      Logger.warn(
                        `Upload poll for ${fileReadName} ${file.id} stopped: ${
                          error instanceof Error ? error.message : String(error)
                        }`,
                      );
                    }
                  })();
                }, UPLOAD_POLL_INTERVAL_MS);
              });
            },
          }
        : {}),
    };
    // The only place the state path is known; `st.do` carries the tag so `Field.*` can emit `data-akan-state`.
    tagAction(singleFieldSetAction[namesOfField.setFieldOnModel] as (...args: never[]) => unknown, {
      action: namesOfField.setFieldOnModel,
      state: `${names.modelForm}.${namesOfField.field}`,
    });
    return Object.assign(acc, singleFieldSetAction);
  }, {});
  return Object.assign(fieldSetAction, baseSetAction);
};
export const makeActions = (refName: string, slice: { [key: string]: SerializedSlice }, fetch: FetchProxy<any>) => {
  type Input = BaseObject;
  interface Insight {
    count: number;
  }
  type Full = BaseObject;
  type Light = BaseObject;
  type Filter = FilterInstance;
  type Sort = BaseFilterSortKey;
  const [fieldName, className] = [refName, capitalize(refName)];
  const cnst = ConstantRegistry.getDatabase(refName);
  const modelRef = cnst.full;
  // Deliberately not store state: a secret field in the opened form must not reach a subscribed component.
  let openFormBase: object | null = null;
  const slices = Object.entries(slice).map(([suffix, serializedSlice]) => ({
    sliceName: `${refName}${capitalize(suffix)}`,
    keys: sliceKeysOf(refName, suffix),
    slice: serializedSlice,
  }));
  const names = {
    ...databaseStateNames(refName),
    Model: className,
    modelInsight: `${fieldName}Insight`,
    modelList: `${fieldName}List`,
    modelListLoading: `${fieldName}ListLoading`,
    createModelInForm: `create${className}InForm`,
    updateModelInForm: `update${className}InForm`,
    createModel: `create${className}`,
    updateModel: `update${className}`,
    removeModel: `remove${className}`,
    checkModelSubmitable: `check${className}Submitable`,
    submitModel: `submit${className}`,
    newModel: `new${className}`,
    editModel: `edit${className}`,
    mergeModel: `merge${className}`,
    viewModel: `view${className}`,
    setModel: `set${className}`,
    resetModel: `reset${className}`,
    loadModelDraft: `load${className}FormDraft`,
    restoreModelDraft: `restore${className}FormDraft`,
    discardModelDraft: `discard${className}FormDraft`,
  };
  const defaultKeyOf = (sliceName: string) => capitalize(sliceName).replace(names.Model, names.defaultModel);
  // A back-navigation replays the pre-write RSC payload; this stamp makes `Load.Units` refetch on re-hydration.
  const staleAtOfSlices = () => {
    const staleAt = new Date();
    return Object.fromEntries(slices.map(({ keys }) => [keys.state.modelStaleAt, staleAt]));
  };
  const updatedAtOf = (model: Full): string | null => {
    const updatedAt = (model as unknown as { updatedAt?: { toISOString?: () => string } }).updatedAt;
    return typeof updatedAt?.toISOString === "function" ? updatedAt.toISOString() : null;
  };
  // A verb whose slice guards resolve to none never reaches the client, so the action has nothing to call.
  const servedFetch = <T>(key: string) => {
    const fn = fetch[key] as ((...args: any[]) => Promise<T>) | undefined;
    if (typeof fn === "function") return fn;
    throw Object.assign(new Error(`${key} is closed: the slice's guards name none that allows it`), {
      error: "base.error.endpointClosed",
      data: { endpoint: key },
    });
  };
  function armDraft(this: SetGet, draftScope: string | undefined, form: object, baseUpdatedAt: string | null) {
    openFormBase = draftScope ? form : null;
    if (!draftScope) return null;
    // Catches a sign-out and sign-in that happened without a reload.
    void DraftStore.reconcileIdentity();
    return {
      key: DraftStore.keyOf(refName, draftScope),
      baseHash: DraftStore.formHash(refName, form),
      baseUpdatedAt,
      pending: null,
      appliedAt: null,
    };
  }
  async function applyDraft(this: SetGet, { auto }: { auto: boolean }) {
    const draft = (this.get() as { [key: string]: any })[names.modelDraft] as DraftState | null;
    if (!draft) return;
    const record = await DraftStore.read(draft.key);
    if (!record) return;
    // The editor moved on while the read was in flight.
    const current = (this.get() as { [key: string]: any })[names.modelDraft] as DraftState | null;
    if (current?.key !== draft.key) return;
    // Same content is not offered back: an autosaving form moves `updatedAt`, so its draft always reads as stale.
    const openedForm = (this.get() as { [key: string]: any })[names.modelForm] as object;
    if (DraftStore.contentHash(record.form) === DraftStore.contentHash(DraftStore.encodeForm(refName, openedForm))) {
      await DraftStore.remove(draft.key);
      return;
    }
    let form: object;
    try {
      form = DraftStore.decodeForm(refName, record.form);
    } catch {
      // The model changed shape under the draft; keeping it would fail again on every open.
      await DraftStore.remove(draft.key);
      return;
    }
    const savedAt = new Date(record.savedAt);
    if (auto || record.baseUpdatedAt === draft.baseUpdatedAt) {
      this.set({ [names.modelForm]: form, [names.modelDraft]: { ...draft, appliedAt: savedAt } });
      return;
    }
    this.set({ [names.modelDraft]: { ...draft, pending: { savedAt, form } } });
  }
  const clearDraft = (draft: DraftState | null) => {
    openFormBase = null;
    if (draft) void DraftStore.remove(draft.key);
    return null;
  };
  // A live slice places the row through `applyLive`, so the server's echo of this create is not counted twice.
  function applyLocalCreate(this: SetGet, sliceName: string, model: Full, seen: { [key: string]: any }) {
    const target = slices.find((entry) => entry.sliceName === sliceName);
    if (target?.slice.live) {
      const applyLive = (this as unknown as DynamicRecord)[target.keys.action.applyLiveModel] as
        | ((event: LiveEventPayload) => void)
        | undefined;
      applyLive?.({ op: "enter", id: model.id, light: new cnst.light().set(model) as unknown as object });
      return;
    }
    if (seen[sliceName.replace(names.model, names.modelListLoading)]) return;
    const listKey = sliceName.replace(names.model, names.modelList);
    const insightKey = sliceName.replace(names.model, names.modelInsight);
    const modelInsight = seen[insightKey] as Insight & BaseInsight;
    this.set({
      [listKey]: new DataList([model, ...(seen[listKey] as DataList<Light>)]),
      [insightKey]: new cnst.insight().set({ ...modelInsight, count: modelInsight.count + 1 }),
    });
  }
  function patchLists(this: SetGet, updatedModel: Full) {
    const updatedLightModel = new cnst.light().set(updatedModel) as unknown as Light;
    slices.forEach(({ keys: { state: namesOfSlice } }) => {
      const currentState = this.get() as { [key: string]: any };
      const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
      const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
      if (modelListLoading || !modelList.has(updatedModel.id)) return;
      this.set({ [namesOfSlice.modelList]: new DataList(modelList).set(updatedLightModel) });
    });
  }
  const baseAction = {
    [names.createModelInForm]: async function (
      this: SetGet,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const defaultModel = currentState[defaultKeyOf(sliceName)] as Full;
      const modelInput = (cnst.input.purify as (form: any) => DefaultOf<Input> | null)(modelForm);

      if (!modelInput) return;
      this.set({ [names.modelLoading]: true });
      const model = await servedFetch<Full>(names.createModel)(modelInput, { onError });
      this.set({
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.modelDraft]: clearDraft(currentState[names.modelDraft] as DraftState | null),
        [names.model]: model,
        [names.modelLoading]: false,
        [names.modelViewAt]: new Date(),
        [names.modelModal]: modal ?? null,
        ...staleAtOfSlices(),
        ...(typeof path === "string" && path ? { [path]: model } : {}),
      });
      applyLocalCreate.call(this, sliceName, model, currentState);
      await onSuccess?.(model);
    },
    [names.updateModelInForm]: async function (
      this: SetGet,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelForm = currentState[names.modelForm] as Input & { id: string };
      const defaultModel = currentState[defaultKeyOf(sliceName)] as Full;
      const modelInput = (cnst.input.purify as (form: any) => DefaultOf<Input> | null)(modelForm);
      if (!modelInput) return;
      if (model?.id === modelForm.id) this.set({ [names.modelLoading]: modelForm.id });
      const updatedModel = await servedFetch<Full>(names.updateModel)(modelForm.id, modelInput, { onError });
      this.set({
        ...(model?.id === updatedModel.id
          ? { [names.model]: updatedModel, [names.modelLoading]: false, [names.modelViewAt]: new Date() }
          : {}),
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.modelDraft]: clearDraft(currentState[names.modelDraft] as DraftState | null),
        [names.modelModal]: modal ?? null,
        ...staleAtOfSlices(),
        ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
      });
      patchLists.call(this, updatedModel);
      await onSuccess?.(updatedModel);
    },
    [names.createModel]: async function (
      this: SetGet,
      data: GetStateObject<Input>,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const modelInput = (cnst.input.purify as (data: any) => Input | null)(data);
      if (!modelInput) return;
      this.set({ [names.modelLoading]: true });
      const model = await servedFetch<Full>(names.createModel)(modelInput, { onError });
      this.set({
        [names.model]: model,
        [names.modelLoading]: false,
        [names.modelViewAt]: new Date(),
        [names.modelModal]: modal ?? null,
        ...staleAtOfSlices(),
        ...(typeof path === "string" && path ? { [path]: model } : {}),
      });
      applyLocalCreate.call(this, sliceName, model, currentState);
      await onSuccess?.(model);
    },
    [names.updateModel]: async function (
      this: SetGet,
      id: string,
      data: GetStateObject<Input>,
      { path, modal, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelInput = (cnst.input.purify as (data: any) => DefaultOf<Input> | null)(data);
      if (!modelInput) return;
      if (model?.id === id) this.set({ [names.modelLoading]: id });
      const updatedModel = await servedFetch<Full>(names.updateModel)(id, modelInput, {
        onError,
      });
      this.set({
        ...(model?.id === updatedModel.id
          ? { [names.model]: updatedModel, [names.modelLoading]: false, [names.modelViewAt]: new Date() }
          : {}),
        [names.modelModal]: modal ?? null,
        ...staleAtOfSlices(),
        ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
      });
      patchLists.call(this, updatedModel);
      await onSuccess?.(updatedModel);
    },
    [names.removeModel]: async function (this: SetGet, id: string, options?: FetchPolicy & { modal?: string | null }) {
      const { modal, ...fetchPolicyOptions } = options ?? {};
      const model = await servedFetch<Full & { removedAt: Dayjs | null }>(names.removeModel)(id, fetchPolicyOptions);
      const lightModel = new cnst.light().set(model) as unknown as Light;
      slices.forEach(({ keys: { state: namesOfSlice } }) => {
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        const modelSelection = currentState[namesOfSlice.modelSelection] as DataList<Light>;
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        if (modelListLoading || !modelList.has(model.id)) return;
        const newModelList = new DataList(modelList);
        if (model.removedAt) {
          newModelList.delete(id);
          const newModelInsight = new cnst.insight().set({
            ...modelInsight,
            count: modelInsight.count - 1,
          });
          const newModelSelection = new DataList(modelSelection);
          newModelSelection.delete(id);
          this.set({
            [namesOfSlice.modelList]: newModelList,
            [namesOfSlice.modelInsight]: newModelInsight,
            ...(modelSelection.has(model.id) ? { [namesOfSlice.modelSelection]: newModelSelection } : {}),
            ...(modal !== undefined ? { [names.modelModal]: modal } : {}),
          });
        } else {
          newModelList.set(lightModel);
          this.set({
            [namesOfSlice.modelList]: newModelList,
            ...(modal !== undefined ? { [names.modelModal]: modal } : {}),
          });
        }
      });
      this.set(staleAtOfSlices());
    },
    [names.checkModelSubmitable]: function (this: SetGet, disabled?: boolean) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const modelSubmit = currentState[names.modelSubmit] as { disabled: boolean };
      const modelInput = (cnst.input.purify as (obj: any) => DefaultOf<Input> | null)(modelForm);
      this.set({ [names.modelSubmit]: { ...modelSubmit, disabled: !modelInput || disabled } });
    },
    [names.submitModel]: async function (this: SetGet, option?: CreateOption<Full>) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input & { id: string };
      const modelSubmit = currentState[names.modelSubmit] as { loading: boolean; times: number };
      this.set({ [names.modelSubmit]: { ...modelSubmit, loading: true } });
      if (modelForm.id)
        await ((this as unknown as DynamicRecord)[names.updateModelInForm] as (...args: any[]) => Promise<Full>)(
          option,
        );
      else
        await ((this as unknown as DynamicRecord)[names.createModelInForm] as (...args: any[]) => Promise<Full>)(
          option,
        );
      this.set({ [names.modelSubmit]: { ...modelSubmit, loading: false, times: modelSubmit.times + 1 } });
    },
    [names.newModel]: function (
      this: SetGet,
      partial: Partial<Full> = {},
      { modal, setDefault, sliceName = names.model, draftScope }: NewOption = {},
    ) {
      const defaultModelKey = defaultKeyOf(sliceName);
      const currentState = this.get() as { [key: string]: any };
      const defaultModel = currentState[defaultModelKey] as Full;
      const merged = { ...plainFieldsOf(defaultModel), ...partial };
      const modelForm = immerify(modelRef, merged);
      this.set({
        [names.modelForm]: modelForm,
        [defaultModelKey]: setDefault ? immerify(modelRef, merged) : defaultModel,
        [names.model]: null,
        [names.modelModal]: modal ?? "edit",
        [names.modelFormLoading]: false,
        [names.modelDraft]: armDraft.call(this, draftScope, modelForm, null),
      });
      // A new form has nothing to conflict with, so its draft is applied without asking.
      if (draftScope) void applyDraft.call(this, { auto: true });
    },
    [names.editModel]: async function (
      this: SetGet,
      modelOrId: Full | string,
      { modal, onError, draftScope }: EditOption & FetchPolicy = {},
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      this.set({ [names.modelFormLoading]: id, [names.modelModal]: modal ?? "edit" });
      const model = await servedFetch<Full>(names.model)(id, { onError });
      const modelForm = immerify(modelRef, deepObjectify<Input>(model as unknown as Input) as object) as Input;
      this.set({
        [names.model]: model,
        [names.modelFormLoading]: false,
        [names.modelViewAt]: new Date(),
        [names.modelForm]: modelForm,
        [names.modelDraft]: armDraft.call(this, draftScope, modelForm, updatedAtOf(model)),
      });
      // A record that moved keeps the draft pending: overwriting a server value the user sees is not recoverable.
      if (draftScope) void applyDraft.call(this, { auto: false });
    },
    [names.mergeModel]: async function (
      this: SetGet,
      modelOrId: Full | string,
      data: Partial<Full>,
      options?: FetchPolicy,
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      if (id === model?.id) this.set({ modelLoading: id });
      const updatedModel = await servedFetch<Full>(names.mergeModel)(modelOrId, data, options);
      this.set({
        [names.model]: id === model?.id ? updatedModel : model,
        [names.modelLoading]: false,
        ...staleAtOfSlices(),
      });
      patchLists.call(this, updatedModel);
    },
    [names.viewModel]: async function (
      this: SetGet,
      modelOrId: Full | string,
      { modal, onError }: { modal?: string | null } & FetchPolicy = {},
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      this.set({ [names.modelModal]: modal ?? "view", [names.modelLoading]: id });
      const model = await servedFetch<Full>(names.model)(id, { onError });
      this.set({ [names.model]: model, [names.modelViewAt]: new Date(), [names.modelLoading]: false });
    },
    [names.setModel]: function (this: SetGet, ...fullOrLightModels: Full[]) {
      const currentState = this.get() as { [key: string]: any };
      if (fullOrLightModels.length === 0) return;
      const firstModel = fullOrLightModels[0];
      const model = currentState[names.model] as Full | null;
      const isFull = firstModel instanceof modelRef;
      if (isFull) {
        const crystalizedModel = new cnst.full().set(firstModel) as unknown as Full;
        this.set({ [names.model]: crystalizedModel });
      } else if (model?.id === firstModel.id) {
        const crystalizedModel = new cnst.full().set(model).set(firstModel) as unknown as Full;
        this.set({ [names.model]: crystalizedModel });
      }
      const lightModels = withSharedInstances(() =>
        fullOrLightModels.map((fullOrLightModel) => new cnst.light().set(fullOrLightModel) as unknown as Light),
      );
      slices.forEach(({ keys: { state: namesOfSlice } }) => {
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        if (modelListLoading) return;
        lightModels.forEach((lightModel) => {
          if (!modelList.has(lightModel.id)) return;
          modelList.set(lightModel);
        });
        this.set({ [namesOfSlice.modelList]: modelList.save() });
      });
      this.set(staleAtOfSlices());
    },
    [names.resetModel]: function (this: SetGet, model?: Full) {
      const currentState = this.get() as { [key: string]: any };
      const defaultModel = currentState[names.defaultModel] as Full;
      this.set({
        [names.model]: model ?? null,
        [names.modelViewAt]: new Date(0),
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.modelModal]: null,
        [names.modelDraft]: clearDraft(currentState[names.modelDraft] as DraftState | null),
      });
      return model ?? null;
    },
    // For a form seeded from an RSC payload: arms saving and offers the draft, as `edit<Model>` does after its fetch.
    [names.loadModelDraft]: async function (this: SetGet, draftScope?: string) {
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelForm = currentState[names.modelForm] as object;
      this.set({
        [names.modelDraft]: armDraft.call(this, draftScope, modelForm, model ? updatedAtOf(model) : null),
      });
      if (draftScope) await applyDraft.call(this, { auto: false });
    },
    [names.restoreModelDraft]: function (this: SetGet) {
      const draft = (this.get() as { [key: string]: any })[names.modelDraft] as DraftState | null;
      if (!draft?.pending) return;
      this.set({
        [names.modelForm]: draft.pending.form,
        [names.modelDraft]: { ...draft, pending: null, appliedAt: draft.pending.savedAt },
      });
    },
    [names.discardModelDraft]: function (this: SetGet) {
      const draft = (this.get() as { [key: string]: any })[names.modelDraft] as DraftState | null;
      if (!draft) return;
      void DraftStore.remove(draft.key);
      // Saving stays armed; dropping an applied draft puts back the form as the editor opened it.
      this.set({
        ...(draft.appliedAt && openFormBase ? { [names.modelForm]: openFormBase } : {}),
        [names.modelDraft]: { ...draft, pending: null, appliedAt: null },
      });
    },
  };
  const sliceAction = slices.reduce((acc, { sliceName, keys, slice }) => {
    // One ticket per slice: every action below writes the same list.
    const requests = new SliceRequest();
    // One room per slice, not per component: a second room would apply every event to the one list twice.
    let liveWatch: { signature: string; dispose: () => void } | null = null;
    const livePauseIdxs = (slice.live?.pauseOn ?? [])
      .map((name) => slice.args.findIndex((arg) => arg.name === name))
      .filter((idx) => idx >= 0);
    const namesOfSlice = { ...keys.state, ...keys.action };
    // Read off the batch, not the insight count: that is absent under `{ insight: false }` and drifts with live events.
    const hasMoreFrom = (batch: unknown[], askedFor: number) => ({
      [namesOfSlice.hasMoreOfModel]: batch.length >= askedFor && askedFor > 0,
    });
    const fetchList = (queryArgs: unknown[], skip: number, limit: number, sort: Sort, options?: object) =>
      (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
        ...expandQueryArgs(queryArgs, slice.args),
        skip,
        limit,
        sort,
        options,
      );
    const fetchInsight = (queryArgs: unknown[], options?: object) =>
      (fetch[namesOfSlice.modelInsight] as (...args: any[]) => Promise<Insight & BaseInsight>)(
        ...expandQueryArgs(queryArgs, slice.args),
        options,
      );
    const loadList = async <T>(self: SetGet, load: () => Promise<T>, commit: (loaded: T) => object) => {
      self.set({ [namesOfSlice.modelListLoading]: true });
      const ticket = requests.claim();
      try {
        const loaded = await load();
        if (requests.isCurrent(ticket)) self.set(commit(loaded));
      } finally {
        if (requests.isCurrent(ticket)) self.set({ [namesOfSlice.modelListLoading]: false });
      }
    };
    const singleSliceAction = {
      [namesOfSlice.initModel]: async function (
        this: SetGet,
        ...args: [...args: any[], initForm: FetchInitForm<Input, Filter> & FetchPolicy]
      ) {
        const initArgLength = Math.min(args.length, slice.args.length);
        const initForm = { invalidate: false, ...(args[slice.args.length] ?? {}) } as FetchInitForm<Input, Filter> &
          FetchPolicy;
        const queryArgs = new Array(initArgLength).fill(null).map((_, i) => args[i] as object);
        const defaultModel = new cnst.full().set(initForm.default ?? {}) as unknown as Full;
        this.set({ [names.defaultModel]: defaultModel, [namesOfSlice.isCumulativeOfModel]: false });
        await ((this as unknown as DynamicRecord)[namesOfSlice.refreshModel] as (...args: any[]) => Promise<void>)({
          ...initForm,
          queryArgs,
        });
      },
      [namesOfSlice.refreshModel]: async function (
        this: SetGet,
        initForm: FetchInitForm<Input, Filter> & FetchPolicy & { queryArgs?: any[] } = {},
      ) {
        const args = initForm.queryArgs ?? [];
        const refreshArgLength = Math.min(args.length, slice.args.length);
        const currentState = this.get() as { [key: string]: any };
        const existingQueryArgs = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const queryArgs = normalizeQueryArgs(
          [
            ...new Array(refreshArgLength).fill(null).map((_, i) => args[i] as object),
            ...existingQueryArgs.slice(refreshArgLength, slice.args.length),
          ],
          slice.args,
        );
        const {
          default: defaultFromInitForm,
          insight,
          page = currentState[namesOfSlice.pageOfModel] as number,
          limit = currentState[namesOfSlice.limitOfModel] as number,
          sort = currentState[namesOfSlice.sortOfModel] as Sort,
          invalidate = true,
          queryArgs: queryArgsFromInitForm,
          ...fetchPolicy
        } = initForm;
        const modelOperation = currentState[names.modelOperation] as string;
        const isCumulative = currentState[namesOfSlice.isCumulativeOfModel] as boolean;
        const loadedLength = (currentState[namesOfSlice.modelList] as DataList<Light>).length;
        // A cumulative list refetches every loaded row, or it would collapse back to the first page.
        const fetchLimit = isCumulative ? Math.max(limit, loadedLength) : limit;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (
          !invalidate &&
          !["sleep", "reset"].includes(modelOperation) &&
          isQueryEqual(queryArgs, queryArgsOfModel) &&
          page === pageOfModel &&
          limit === limitOfModel &&
          isQueryEqual(sort as unknown as object, sortOfModel as unknown as object)
        )
          return;
        await loadList(
          this,
          () =>
            Promise.all([
              fetchList(queryArgs, (page - 1) * limit, fetchLimit, sort, { ...fetchPolicy, onError: initForm.onError }),
              insight === false ? null : fetchInsight(queryArgs, { ...fetchPolicy, onError: initForm.onError }),
            ]),
          ([modelDataList, modelObjInsight]) => {
            const modelList = new DataList(modelDataList);
            const modelInsight =
              modelObjInsight ??
              (new cnst.insight().set({ count: modelDataList.length }) as unknown as Insight & BaseInsight);
            return {
              [namesOfSlice.modelList]: modelList,
              [namesOfSlice.modelInsight]: modelInsight,
              [namesOfSlice.modelInitList]: modelList,
              [namesOfSlice.modelInitAt]: new Date(),
              [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((modelInsight.count - 1) / (limit || 20)) + 1, 1),
              ...hasMoreFrom(modelDataList, fetchLimit),
              [namesOfSlice.limitOfModel]: limit,
              [namesOfSlice.queryArgsOfModel]: queryArgs,
              [namesOfSlice.sortOfModel]: sort,
              [namesOfSlice.pageOfModel]: page,
              [names.modelOperation]: "idle",
            };
          },
        );
      },
      [namesOfSlice.selectModel]: function (
        this: SetGet,
        model: Light | Light[],
        { refresh, remove }: { refresh?: boolean; remove?: boolean } = {},
      ) {
        const models = Array.isArray(model) ? model : [model];
        const currentState = this.get() as { [key: string]: any };
        const modelSelection = currentState[namesOfSlice.modelSelection] as DataList<Light>;
        if (refresh) this.set({ [namesOfSlice.modelSelection]: new DataList(models) });
        else if (remove) {
          const newModelSelection = new DataList(modelSelection);
          models.map((model) => newModelSelection.delete(model.id));
          this.set({ [namesOfSlice.modelSelection]: newModelSelection });
        } else {
          this.set({ [namesOfSlice.modelSelection]: new DataList([...modelSelection.values, ...models]) });
        }
      },
      [namesOfSlice.setPageOfModel]: async function (this: SetGet, page: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (pageOfModel === page) return;
        await loadList(
          this,
          () => fetchList(queryArgsOfModel, (page - 1) * limitOfModel, limitOfModel, sortOfModel, options),
          (modelDataList) => ({
            [namesOfSlice.modelList]: new DataList(modelDataList),
            [namesOfSlice.pageOfModel]: page,
            [namesOfSlice.isCumulativeOfModel]: false,
            ...hasMoreFrom(modelDataList, limitOfModel),
          }),
        );
      },
      // Offsets by the rows on screen, not a page, so a live insert cannot shift it. Never raises `ListLoading`
      // (that would drop live events), so concurrent calls may fetch one offset twice; the ticket keeps the newest.
      [namesOfSlice.loadMoreOfModel]: async function (this: SetGet, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        // A refresh in flight owns the spinner; claiming a ticket over it would strand the spinner on.
        if (currentState[namesOfSlice.modelListLoading] as boolean) return;
        if (!(currentState[namesOfSlice.hasMoreOfModel] as boolean)) return;
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = (currentState[namesOfSlice.limitOfModel] as number) || 20;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        const ticket = requests.claim();
        const modelDataList = await fetchList(
          queryArgsOfModel,
          (pageOfModel - 1) * limitOfModel + modelList.length,
          limitOfModel,
          sortOfModel,
          options,
        );
        if (!requests.isCurrent(ticket)) return;
        // Re-read: a live event may have placed a row meanwhile, and `DataList` collapses the shifted duplicate.
        const currentModelList = (this.get() as { [key: string]: any })[namesOfSlice.modelList] as DataList<Light>;
        this.set({
          [namesOfSlice.modelList]: new DataList([...currentModelList.values, ...modelDataList]),
          [namesOfSlice.isCumulativeOfModel]: true,
          ...hasMoreFrom(modelDataList, limitOfModel),
        });
      },
      [namesOfSlice.setLimitOfModel]: async function (this: SetGet, limit: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (limitOfModel === limit) return;
        const skip = (pageOfModel - 1) * limitOfModel;
        const page = Math.max(Math.floor((skip - 1) / limit) + 1, 1);
        await loadList(
          this,
          () => fetchList(queryArgsOfModel, (page - 1) * limit, limit, sortOfModel, options),
          (modelDataList) => ({
            [namesOfSlice.modelList]: new DataList(modelDataList),
            [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((modelInsight.count - 1) / limit) + 1, 1),
            [namesOfSlice.limitOfModel]: limit,
            [namesOfSlice.pageOfModel]: page,
            [namesOfSlice.isCumulativeOfModel]: false,
            ...hasMoreFrom(modelDataList, limit),
          }),
        );
      },
      [namesOfSlice.setQueryArgsOfModel]: async function (
        this: SetGet,
        ...args:
          | [...queryArgs: any, options?: FetchPolicy]
          | [setQueryArgs: (...prevQueryArgs: object[]) => object[], options?: FetchPolicy]
      ) {
        const isSetQueryAsFunction = typeof args[0] === "function";
        const currentState = this.get() as { [key: string]: any };
        const options = (isSetQueryAsFunction ? args[1] : args[slice.args.length]) as FetchPolicy | undefined;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const queryArgs = normalizeQueryArgs(
          isSetQueryAsFunction
            ? (args[0] as (...prevQueryArgs: object[]) => object[])(...queryArgsOfModel)
            : new Array(slice.args.length).fill(null).map((_, i) => args[i] as object),
          slice.args,
        );
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (isQueryEqual(queryArgsOfModel, queryArgs)) {
          Logger.trace(`${namesOfSlice.queryArgsOfModel} store-level cache hit`);
          return;
        }
        await loadList(
          this,
          () =>
            Promise.all([
              fetchList(queryArgs, 0, limitOfModel, sortOfModel, options),
              fetchInsight(queryArgs, options),
            ]),
          ([modelDataList, modelInsight]) => ({
            [namesOfSlice.queryArgsOfModel]: queryArgs,
            [namesOfSlice.modelList]: new DataList(modelDataList),
            [namesOfSlice.modelInsight]: modelInsight,
            [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((modelInsight.count - 1) / limitOfModel) + 1, 1),
            [namesOfSlice.pageOfModel]: 1,
            [namesOfSlice.isCumulativeOfModel]: false,
            ...hasMoreFrom(modelDataList, limitOfModel),
            [namesOfSlice.modelSelection]: new Map(),
          }),
        );
      },
      [namesOfSlice.setSortOfModel]: async function (this: SetGet, sort: Sort, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (sortOfModel === sort) return;
        await loadList(
          this,
          () => fetchList(queryArgsOfModel, 0, limitOfModel, sort, options),
          (modelDataList) => ({
            [namesOfSlice.modelList]: new DataList(modelDataList),
            [namesOfSlice.sortOfModel]: sort,
            [namesOfSlice.pageOfModel]: 1,
            [namesOfSlice.isCumulativeOfModel]: false,
            ...hasMoreFrom(modelDataList, limitOfModel),
          }),
        );
      },
      // Membership was decided server-side; a row is placed only where its position is knowable, else stamped stale.
      [namesOfSlice.applyLiveModel]: function (this: SetGet, event: LiveEventPayload) {
        const currentState = this.get() as { [key: string]: any };
        if (currentState[namesOfSlice.modelListLoading] as boolean) return;
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const staleAt = { [namesOfSlice.modelStaleAt]: new Date() };
        if (event.op === "invalidate") {
          this.set(staleAt);
          return;
        }
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        const limit = (currentState[namesOfSlice.limitOfModel] as number) || 20;
        const isCumulative = currentState[namesOfSlice.isCumulativeOfModel] as boolean;
        const countedTo = (count: number) => ({
          [namesOfSlice.modelInsight]: new cnst.insight().set({ ...modelInsight, count }),
          [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((count - 1) / limit) + 1, 1),
        });
        if (event.op === "leave") {
          if (!modelList.has(event.id)) return;
          this.set({
            [namesOfSlice.modelList]: new DataList(modelList).delete(event.id).save(),
            ...countedTo(Math.max(modelInsight.count - 1, 0)),
            ...staleAt,
          });
          return;
        }
        const light = event.light ? (new cnst.light().set(event.light) as unknown as Light) : null;
        if (event.op === "update") {
          // Not in this window: another page reads the new value when it is fetched.
          if (!light || !modelList.has(event.id)) return;
          this.set({ [namesOfSlice.modelList]: new DataList(modelList).set(light).save() });
          return;
        }
        // A row already in the window is an echo of an applied insert, so the count must not rise twice.
        const placement =
          light && !modelList.has(event.id)
            ? livePlacementIndex({
                list: modelList as unknown as LiveSortableRow[],
                row: light as unknown as LiveSortableRow,
                page: currentState[namesOfSlice.pageOfModel] as number,
                limit,
                cumulative: isCumulative,
                hasMore: currentState[namesOfSlice.hasMoreOfModel] as boolean,
                sortKey: String(currentState[namesOfSlice.sortOfModel]),
                allowedSorts: slice.live?.sort ?? [],
                sorts: fetch.sortValueMap?.get(refName),
              })
            : null;
        if (!light || placement === null) {
          this.set({ ...(modelList.has(event.id) ? {} : countedTo(modelInsight.count + 1)), ...staleAt });
          return;
        }
        // A paged window pushes its last row to the next page; a cumulative list keeps it, since it is on screen.
        const inserted = [...modelList.slice(0, placement), light, ...modelList.slice(placement)];
        const placed = isCumulative ? inserted : inserted.slice(0, limit);
        this.set({
          [namesOfSlice.modelList]: new DataList(placed as Light[]),
          ...countedTo(modelInsight.count + 1),
          ...staleAt,
        });
      },
      // Opens this slice's live room for `queryArgs`, or closes it on null.
      [namesOfSlice.watchLiveModel]: function (this: SetGet, queryArgs: unknown[] | null) {
        if (!slice.live) return;
        const args = queryArgs ? expandQueryArgs(normalizeQueryArgs(queryArgs, slice.args), slice.args) : null;
        // A filled `pauseOn` argument closes the room as null does, until it is cleared.
        const paused = !!args && livePauseIdxs.some((idx) => args[idx] != null);
        const signature = args && !paused ? JSON.stringify(args) : null;
        if (liveWatch && signature !== liveWatch.signature) {
          liveWatch.dispose();
          liveWatch = null;
        }
        if (!args || paused || liveWatch) return;
        const self = this as unknown as DynamicRecord;
        const apply = self[namesOfSlice.applyLiveModel] as (event: unknown) => void;
        const refresh = self[namesOfSlice.refreshModel] as (form: object) => Promise<void>;
        // The generated subscriber serializes room args as the list query does; a hand-built id would not.
        const subscribe = fetch[`subscribe${capitalize(sliceName.replace(names.model, `${names.model}Live`))}`] as
          | ((...args: unknown[]) => () => void)
          | undefined;
        if (!subscribe) return;
        const dispose = subscribe(...args, (event: unknown) => apply(event), {
          crystalize: false,
          // The events missed while the socket was down are gone, so the list is refetched rather than patched.
          onResync: () => void refresh({ invalidate: true }),
        });
        liveWatch = { signature: signature ?? "", dispose };
      },
    };
    return Object.assign(acc, singleSliceAction);
  }, {});
  return { ...baseAction, ...sliceAction };
};
