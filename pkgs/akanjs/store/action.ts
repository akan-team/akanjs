import { DataList, type Dayjs, FIELD_META, type GetStateObject } from "akanjs/base";
import {
  AbortSignals,
  capitalize,
  type DynamicRecord,
  deepObjectify,
  type FetchPolicy,
  formSetterNames,
  isQueryEqual,
  Logger,
  modelNames,
  pathSet,
  plainFieldsOf,
  resolveFileUploadCapability,
  sliceNames,
} from "akanjs/common";
import {
  type BaseInsight,
  type BaseObject,
  ConstantRegistry,
  type DefaultOf,
  type FieldState,
  immerify,
  MAX_PAGE_SIZE,
  type ProtoFile,
  type ProtoLightFile,
  withSharedInstances,
} from "akanjs/constant";
import type { BaseFilterSortKey, ExtractSort, FilterInstance } from "akanjs/document";
import { type FetchInitForm, type FetchProxy, restoreRemoteError } from "akanjs/fetch";
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
import { produce } from "immer";
import { expandQueryArgs, normalizeQueryArgs } from "../fetch/client/sliceQueryArgs";
import { tagAction } from "./actionTag";
import { DraftStore } from "./draftStore";
import { type LiveSortableRow, livePlacementIndex } from "./liveInsert";
import { SliceRequest } from "./SliceRequest";
import { servedEndpointOf } from "./servedEndpointOf";
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
} & { [K in `invalidate${_CapitalizedRefName}`]: () => void };

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
  const className = capitalize(refName);
  const modelRef = ConstantRegistry.getDatabase(refName).full;
  const fileUploadRefName = resolveFileUploadCapability(fetch.serializedSignal)?.refName;

  const names = modelNames(refName);
  type Uploading = { [field: string]: string[] };
  type FormState = { [key: string]: any };
  let uploadSeq = 0;
  const releasedUpload = (uploading: Uploading, field: string, ticket?: string): Uploading => {
    const pending = uploading[field];
    if (!pending || (ticket && !pending.includes(ticket))) return uploading;
    const { [field]: tickets = [], ...rest } = uploading;
    const left = ticket ? tickets.filter((pending) => pending !== ticket) : [];
    return left.length ? { ...rest, [field]: left } : rest;
  };
  const formPatchOf = (
    state: FormState,
    recipe: (form: FormState) => void,
    uploading: Uploading = state[names.modelFormUploading],
  ) => ({
    [names.modelForm]: produce(state[names.modelForm] as FormState, recipe),
    // `set` reads a form patch without the upload slot as a whole-form replace and drops every upload in flight.
    [names.modelFormUploading]: uploading,
  });
  const baseSetAction = {
    [names.writeOnModel]: function (this: SetGet, path: string | (string | number)[], value: any) {
      this.set(
        formPatchOf(this.get(), (form) => {
          pathSet(form, path, value);
        }),
      );
    },
  };
  const fieldSetAction = Object.entries(modelRef[FIELD_META]).reduce((acc, [key, field]) => {
    const namesOfField = formSetterNames(className, key);
    const isFileField =
      field.isClass && !!fileUploadRefName && ConstantRegistry.getRefName(field.modelRef) === fileUploadRefName;
    const singleFieldSetAction = {
      [namesOfField.setFieldOnModel]: function (this: SetGet, value: any | null) {
        const state = this.get() as FormState;
        const setValue =
          value === null ? null : field.isClass ? immerify<object>(field.modelRef, value as object) : (value as object);
        // An explicit write wins over a single field's upload in flight; an array keeps its uploads.
        const uploading: Uploading =
          isFileField && !field.isArray
            ? releasedUpload(state[names.modelFormUploading], namesOfField.field)
            : state[names.modelFormUploading];
        this.set(
          formPatchOf(
            state,
            (form) => {
              form[namesOfField.field] = setValue;
            },
            uploading,
          ),
        );
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
              this.set(
                formPatchOf(this.get(), (draft) => {
                  draft[namesOfField.field] = [
                    ...(form[namesOfField.field] as object[]).slice(0, idx),
                    ...(Array.isArray(setValue) ? setValue : [setValue]),
                    ...(form[namesOfField.field] as object[]).slice(idx),
                  ];
                }),
              );
            },
            [namesOfField.subFieldOnModel]: function (this: SetGet, idx: number | number[]) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: object[] };
              this.set(
                formPatchOf(this.get(), (draft) => {
                  draft[namesOfField.field] =
                    typeof idx === "number"
                      ? form[namesOfField.field].filter((_, i) => i !== idx)
                      : form[namesOfField.field].filter((_, i) => !idx.includes(i));
                }),
              );
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
      ...(isFileField && fileUploadRefName
        ? {
            [namesOfField.uploadFieldOnModel]: async function (
              this: SetGet,
              fileList: FileList | File[],
              index?: number,
            ) {
              const formId = ((this.get() as { [key: string]: any })[names.modelForm] as { id?: string }).id;
              if (!fileList.length) return;
              // A whole-form set clears all tickets and a single field keeps only the newest; a missing one is stale.
              const ticket = `${++uploadSeq}`;
              const uploading = (this.get() as FormState)[names.modelFormUploading] as Uploading;
              const tickets = uploading[namesOfField.field] ?? [];
              this.set({
                [names.modelFormUploading]: {
                  ...uploading,
                  [namesOfField.field]: field.isArray ? [...tickets, ticket] : [ticket],
                },
              });
              const releasedIn = (state: FormState) =>
                releasedUpload(state[names.modelFormUploading], namesOfField.field, ticket);
              let files: ProtoFile[];
              try {
                files = await (fetch[names.addModelFiles] as (...args: any) => Promise<ProtoFile[]>)(fileList, formId);
              } catch (error) {
                this.set({ [names.modelFormUploading]: releasedIn(this.get() as FormState) });
                throw error;
              }
              const state = this.get() as FormState;
              const isWritten =
                !!(state[names.modelFormUploading] as Uploading)[namesOfField.field]?.includes(ticket) &&
                (state[names.modelForm] as { id?: string }).id === formId;
              if (!isWritten) {
                this.set({ [names.modelFormUploading]: releasedIn(state) });
                return;
              }
              // One update, so no subscriber sees the field idle before the file it waited for is in the form.
              this.set(
                formPatchOf(
                  state,
                  (form) => {
                    if (field.isArray) {
                      const current = (form[namesOfField.field] as ProtoLightFile[] | null) ?? [];
                      const idx = Math.min(index ?? current.length, current.length);
                      form[namesOfField.field] = [...current.slice(0, idx), ...files, ...current.slice(idx)];
                    } else form[namesOfField.field] = files[0] ?? null;
                  },
                  releasedIn(state),
                ),
              );
              const postSet = (this as unknown as { [key: string]: ((value: unknown) => unknown) | undefined })[
                namesOfField.postSetField
              ];
              if (postSet)
                void postSet.call(this, (this.get() as { [key: string]: any })[names.modelForm][namesOfField.field]);
              // A light-declared field stores the light projection, so the poll re-reads through the light endpoint.
              const fileReadName = ConstantRegistry.isLight(field.modelRef)
                ? modelNames(fileUploadRefName).lightModel
                : fileUploadRefName;
              const holdsFile = (id: string) => {
                const value = (this.get() as { [key: string]: { [key: string]: unknown } })[names.modelForm][
                  namesOfField.field
                ] as ProtoLightFile | ProtoLightFile[] | null;
                return Array.isArray(value) ? value.some((heldFile) => heldFile.id === id) : value?.id === id;
              };
              files.forEach((file) => {
                let attemptsLeft = UPLOAD_POLL_ATTEMPTS;
                const intervalKey = setInterval(() => {
                  void (async () => {
                    if (!holdsFile(file.id)) {
                      clearInterval(intervalKey);
                      return;
                    }
                    attemptsLeft -= 1;
                    try {
                      const currentFile = await (
                        (fetch as { [key: string]: any })[fileReadName] as (id: string) => Promise<ProtoLightFile>
                      )(file.id);
                      if (!holdsFile(currentFile.id)) {
                        clearInterval(intervalKey);
                        return;
                      }
                      this.set(
                        formPatchOf(this.get(), (form) => {
                          const value = form[namesOfField.field] as ProtoLightFile[] | ProtoLightFile | null;
                          form[namesOfField.field] = Array.isArray(value)
                            ? value.map((heldFile) => (heldFile.id === currentFile.id ? currentFile : heldFile))
                            : currentFile;
                        }),
                      );
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
  const className = capitalize(refName);
  const cnst = ConstantRegistry.getDatabase(refName);
  const modelRef = cnst.full;
  // Deliberately not store state: a secret field in the opened form must not reach a subscribed component.
  let openFormBase: object | null = null;
  const slices = Object.entries(slice).map(([suffix, serializedSlice]) => {
    const keys = sliceKeysOf(refName, suffix);
    return { sliceName: keys.slice, keys, slice: serializedSlice };
  });
  const { modelInsight, modelList, modelListLoading } = sliceNames(refName).state;
  const names = { ...modelNames(refName), Model: className, modelInsight, modelList, modelListLoading };
  // A save while a file is still uploading would store the form without it.
  const isUploadingIn = (state: { [key: string]: any }) =>
    Object.keys(state[names.modelFormUploading] as object).length > 0;
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
  const servedFetch = <T>(key: string) => {
    const fn = servedEndpointOf<(...args: any[]) => Promise<T>>(fetch, key);
    if (fn) return fn;
    throw restoreRemoteError({ error: "base.error.endpointClosed", data: { endpoint: key } }, 404);
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
    // Earlier releases could save another record's form under this key, which must never fill this one's.
    const draftedId = record.form.id;
    if (typeof draftedId === "string" && draftedId && draftedId !== (openedForm as { id?: unknown }).id) {
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
  const isLiveSlice = (sliceName: string) => !!slices.find((entry) => entry.sliceName === sliceName)?.slice.live;
  // A live slice places the row through `applyLive`, so the server's echo of this create is not counted twice.
  const createdListPatchOf = (sliceName: string, model: Full, seen: { [key: string]: unknown }) => {
    const listKey = sliceName.replace(names.model, names.modelList);
    if (isLiveSlice(sliceName) || seen[sliceName.replace(names.model, names.modelListLoading)] || !seen[listKey])
      return {};
    const insightKey = sliceName.replace(names.model, names.modelInsight);
    const modelInsight = seen[insightKey] as Insight & BaseInsight;
    return {
      [listKey]: new DataList([model, ...(seen[listKey] as DataList<Light>)]),
      [insightKey]: new cnst.insight().set({ ...modelInsight, count: modelInsight.count + 1 }),
    };
  };
  function applyLiveCreate(this: SetGet, sliceName: string, model: Full) {
    const target = slices.find((entry) => entry.sliceName === sliceName);
    if (!target?.slice.live) return;
    const applyLive = (this as unknown as DynamicRecord)[target.keys.action.applyLiveModel] as
      | ((event: LiveEventPayload) => void)
      | undefined;
    applyLive?.({ op: "enter", id: model.id, light: new cnst.light().set(model) as unknown as object });
  }
  const updatedListPatchOf = (state: { [key: string]: unknown }, ...updatedModels: Full[]) => {
    const lightModels = withSharedInstances(() =>
      updatedModels.map((updatedModel) => new cnst.light().set(updatedModel) as unknown as Light),
    );
    const patch: { [key: string]: DataList<Light> } = {};
    for (const { keys } of slices) {
      const namesOfSlice = keys.state;
      const modelList = state[namesOfSlice.modelList] as DataList<Light>;
      if (state[namesOfSlice.modelListLoading] || !lightModels.some(({ id }) => modelList.has(id))) continue;
      const nextList = new DataList(modelList);
      for (const lightModel of lightModels) if (nextList.has(lightModel.id)) nextList.set(lightModel);
      patch[namesOfSlice.modelList] = nextList;
    }
    return patch;
  };
  const baseAction = {
    [names.createModelInForm]: async function (
      this: SetGet,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const defaultModel = currentState[defaultKeyOf(sliceName)] as Full;
      const modelInput = (cnst.input.purify as (form: any) => DefaultOf<Input> | null)(modelForm);

      if (!modelInput || isUploadingIn(currentState)) return;
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
        ...createdListPatchOf(sliceName, model, this.get()),
      });
      applyLiveCreate.call(this, sliceName, model);
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
      if (!modelInput || isUploadingIn(currentState)) return;
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
        ...updatedListPatchOf(this.get(), updatedModel),
      });
      await onSuccess?.(updatedModel);
    },
    [names.createModel]: async function (
      this: SetGet,
      data: GetStateObject<Input>,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
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
        ...createdListPatchOf(sliceName, model, this.get()),
      });
      applyLiveCreate.call(this, sliceName, model);
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
        ...updatedListPatchOf(this.get(), updatedModel),
      });
      await onSuccess?.(updatedModel);
    },
    [names.removeModel]: async function (this: SetGet, id: string, options?: FetchPolicy & { modal?: string | null }) {
      const { modal, ...fetchPolicyOptions } = options ?? {};
      const model = await servedFetch<Full & { removedAt: Dayjs | null }>(names.removeModel)(id, fetchPolicyOptions);
      const currentState = this.get() as { [key: string]: unknown };
      if (!model.removedAt) {
        const listPatch = updatedListPatchOf(currentState, model);
        this.set({
          ...listPatch,
          ...(modal !== undefined && Object.keys(listPatch).length ? { [names.modelModal]: modal } : {}),
          ...staleAtOfSlices(),
        });
        return;
      }
      const removedPatch: { [key: string]: unknown } = {};
      for (const { keys } of slices) {
        const namesOfSlice = keys.state;
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelSelection = currentState[namesOfSlice.modelSelection] as DataList<Light>;
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        if (currentState[namesOfSlice.modelListLoading] || !modelList.has(model.id)) continue;
        removedPatch[namesOfSlice.modelList] = new DataList(modelList).delete(id);
        removedPatch[namesOfSlice.modelInsight] = new cnst.insight().set({
          ...modelInsight,
          count: modelInsight.count - 1,
        });
        if (modelSelection.has(model.id))
          removedPatch[namesOfSlice.modelSelection] = new DataList(modelSelection).delete(id);
        if (modal !== undefined) removedPatch[names.modelModal] = modal;
      }
      this.set({ ...removedPatch, ...staleAtOfSlices() });
    },
    [names.checkModelSubmitable]: function (this: SetGet, disabled?: boolean) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const modelSubmit = currentState[names.modelSubmit] as { disabled: boolean };
      const modelInput = (cnst.input.purify as (obj: any) => DefaultOf<Input> | null)(modelForm);
      const isDisabled = !modelInput || isUploadingIn(currentState) || disabled;
      this.set({ [names.modelSubmit]: { ...modelSubmit, disabled: isDisabled } });
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
      if (id === model?.id) this.set({ [names.modelLoading]: id });
      const updatedModel = await servedFetch<Full>(names.mergeModel)(modelOrId, data, options);
      this.set({
        [names.model]: id === model?.id ? updatedModel : model,
        [names.modelLoading]: false,
        ...staleAtOfSlices(),
        ...updatedListPatchOf(this.get(), updatedModel),
      });
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
      const crystalizedModel = isFull
        ? (new cnst.full().set(firstModel) as unknown as Full)
        : model?.id === firstModel.id
          ? (new cnst.full().set(model).set(firstModel) as unknown as Full)
          : null;
      this.set({
        ...(crystalizedModel ? { [names.model]: crystalizedModel } : {}),
        ...updatedListPatchOf(currentState, ...fullOrLightModels),
        ...staleAtOfSlices(),
      });
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
    [names.invalidateModel]: function (this: SetGet) {
      this.set(staleAtOfSlices());
    },
    // For a form seeded from an RSC payload: arms saving and offers the draft, as `edit<Model>` does after its fetch.
    [names.loadModelFormDraft]: async function (this: SetGet, draftScope?: string) {
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelForm = currentState[names.modelForm] as object;
      this.set({
        [names.modelDraft]: armDraft.call(this, draftScope, modelForm, model ? updatedAtOf(model) : null),
      });
      if (draftScope) await applyDraft.call(this, { auto: false });
    },
    [names.restoreModelFormDraft]: function (this: SetGet) {
      const draft = (this.get() as { [key: string]: any })[names.modelDraft] as DraftState | null;
      if (!draft?.pending) return;
      this.set({
        [names.modelForm]: draft.pending.form,
        [names.modelDraft]: { ...draft, pending: null, appliedAt: draft.pending.savedAt },
      });
    },
    [names.discardModelFormDraft]: function (this: SetGet) {
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
  const sliceAction = slices.reduce((acc, { keys, slice }) => {
    // One ticket per slice: every action below writes the same list.
    const requests = new SliceRequest();
    // One room per slice, not per component: a second room would apply every event to the one list twice.
    let liveWatch: { signature: string; dispose: () => void } | null = null;
    let liveWatchers = 0;
    let liveClosed: { signature: string; at: Date } | null = null;
    const closeLiveWatch = () => {
      if (!liveWatch) return;
      liveWatch.dispose();
      liveClosed = { signature: liveWatch.signature, at: new Date() };
      liveWatch = null;
    };
    const livePauseIdxs = (slice.live?.pauseOn ?? [])
      .map((name) => slice.args.findIndex((arg) => arg.name === name))
      .filter((idx) => idx >= 0);
    const namesOfSlice = { ...keys.state, ...keys.action };
    // Read off the batch, not the insight count: that is absent under `{ insight: false }` and drifts with live events.
    const hasMoreFrom = (batch: unknown[], askedFor: number) => ({
      [namesOfSlice.hasMoreOfModel]: batch.length >= (askedFor > 0 ? Math.min(askedFor, MAX_PAGE_SIZE) : MAX_PAGE_SIZE),
    });
    // `limit: 0` lists every row on one page.
    const lastPageFrom = (count: number, limit: number) => ({
      [namesOfSlice.lastPageOfModel]: limit > 0 ? Math.max(Math.floor((count - 1) / limit) + 1, 1) : 1,
    });
    const fetchList = (queryArgs: unknown[], skip: number, limit: number, sort: Sort, options?: object) =>
      (fetch[keys.endpoint.list] as (...args: any[]) => Promise<Light[]>)(
        ...expandQueryArgs(queryArgs, slice.args),
        skip,
        limit,
        sort,
        options,
      );
    const fetchInsight = (queryArgs: unknown[], options?: object) =>
      (fetch[keys.endpoint.insight] as (...args: any[]) => Promise<Insight & BaseInsight>)(
        ...expandQueryArgs(queryArgs, slice.args),
        options,
      );
    const insightOf = (modelObjInsight: (Insight & BaseInsight) | null, modelDataList: Light[]) =>
      modelObjInsight ?? (new cnst.insight().set({ count: modelDataList.length }) as unknown as Insight & BaseInsight);
    const queryArgsIn = (self: SetGet) =>
      (self.get() as { [key: string]: any })[namesOfSlice.queryArgsOfModel] as object[];
    // A row stamped stale while the request ran may be missing from its rows, so they are read once more, and only once.
    const loadList = async <T>(
      self: SetGet,
      callerSignal: AbortSignal | undefined,
      load: (signal: AbortSignal) => Promise<T>,
      commit: (loaded: T, requestedAt: Date) => object,
    ) => {
      if (callerSignal?.aborted) return;
      self.set({ [namesOfSlice.modelListLoading]: true });
      const { ticket, signal: ownSignal } = requests.claim();
      const joined = AbortSignals.join([ownSignal, callerSignal]);
      const signal = joined.signal ?? ownSignal;
      try {
        for (let round = 0; round < 2; round += 1) {
          // Taken before the request: a write stamped while it runs may be missing from the rows it returns.
          const requestedAt = new Date();
          const queryArgs = queryArgsIn(self);
          const loaded = await load(signal);
          // Arguments seeded meanwhile, as by a `Load.Units` of another page, own the slice now.
          if (!requests.isCurrent(ticket) || queryArgsIn(self) !== queryArgs) return;
          self.set(commit(loaded, requestedAt));
          const staleAt = (self.get() as { [key: string]: any })[namesOfSlice.modelStaleAt] as Date;
          if (staleAt.getTime() <= requestedAt.getTime()) return;
        }
      } catch (error) {
        if (signal.aborted) return;
        throw error;
      } finally {
        joined.dispose();
        if (requests.isCurrent(ticket)) self.set({ [namesOfSlice.modelListLoading]: false });
      }
    };
    const singleSliceAction = {
      [namesOfSlice.initModel]: async function (
        this: SetGet,
        ...args: [...args: any[], initForm: FetchInitForm<Input, Filter> & FetchPolicy]
      ) {
        const initArgLength = Math.min(args.length, slice.args.length);
        const initForm = {
          invalidate: false,
          insight: true,
          ...(args[slice.args.length] ?? {}),
        } as FetchInitForm<Input, Filter> & FetchPolicy;
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
          insight = currentState[namesOfSlice.hasInsightOfModel] as boolean,
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
          fetchPolicy.signal,
          (signal) =>
            Promise.all([
              fetchList(queryArgs, (page - 1) * limit, fetchLimit, sort, { ...fetchPolicy, signal }),
              insight === false ? null : fetchInsight(queryArgs, { ...fetchPolicy, signal }),
            ]),
          ([modelDataList, modelObjInsight], requestedAt) => {
            const modelList = new DataList(modelDataList);
            const modelInsight = insightOf(modelObjInsight, modelDataList);
            return {
              [namesOfSlice.modelList]: modelList,
              [namesOfSlice.modelInsight]: modelInsight,
              [namesOfSlice.hasInsightOfModel]: insight !== false,
              [namesOfSlice.modelInitList]: modelList,
              [namesOfSlice.modelInitAt]: requestedAt,
              ...lastPageFrom(modelInsight.count, limit),
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
          options?.signal,
          (signal) =>
            fetchList(queryArgsOfModel, (page - 1) * limitOfModel, limitOfModel, sortOfModel, { ...options, signal }),
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
        if (options?.signal?.aborted) return;
        const { ticket, signal: ownSignal } = requests.claim();
        const joined = AbortSignals.join([ownSignal, options?.signal]);
        const signal = joined.signal ?? ownSignal;
        const modelDataList = await fetchList(
          queryArgsOfModel,
          (pageOfModel - 1) * limitOfModel + modelList.length,
          limitOfModel,
          sortOfModel,
          { ...options, signal },
        )
          .catch((error: unknown) => {
            if (signal.aborted) return null;
            throw error;
          })
          .finally(joined.dispose);
        if (!modelDataList || !requests.isCurrent(ticket) || queryArgsIn(this) !== queryArgsOfModel) return;
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
        const page = limit > 0 ? Math.max(Math.floor((skip - 1) / limit) + 1, 1) : 1;
        await loadList(
          this,
          options?.signal,
          (signal) => fetchList(queryArgsOfModel, (page - 1) * limit, limit, sortOfModel, { ...options, signal }),
          (modelDataList) => ({
            [namesOfSlice.modelList]: new DataList(modelDataList),
            ...lastPageFrom(modelInsight.count, limit),
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
        const hasInsightOfModel = currentState[namesOfSlice.hasInsightOfModel] as boolean;
        if (isQueryEqual(queryArgsOfModel, queryArgs)) {
          Logger.trace(`${namesOfSlice.queryArgsOfModel} store-level cache hit`);
          return;
        }
        await loadList(
          this,
          options?.signal,
          (signal) =>
            Promise.all([
              fetchList(queryArgs, 0, limitOfModel, sortOfModel, { ...options, signal }),
              hasInsightOfModel === false ? null : fetchInsight(queryArgs, { ...options, signal }),
            ]),
          ([modelDataList, modelObjInsight]) => {
            const modelInsight = insightOf(modelObjInsight, modelDataList);
            return {
              [namesOfSlice.queryArgsOfModel]: queryArgs,
              [namesOfSlice.modelList]: new DataList(modelDataList),
              [namesOfSlice.modelInsight]: modelInsight,
              ...lastPageFrom(modelInsight.count, limitOfModel),
              [namesOfSlice.pageOfModel]: 1,
              [namesOfSlice.isCumulativeOfModel]: false,
              ...hasMoreFrom(modelDataList, limitOfModel),
              [namesOfSlice.modelSelection]: new Map(),
            };
          },
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
          options?.signal,
          (signal) => fetchList(queryArgsOfModel, 0, limitOfModel, sort, { ...options, signal }),
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
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const staleAt = { [namesOfSlice.modelStaleAt]: new Date() };
        // The refetch in flight may have read before this event, so it cannot be patched in, only remembered.
        if (event.op === "invalidate" || (currentState[namesOfSlice.modelListLoading] as boolean)) {
          this.set(staleAt);
          return;
        }
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        const limit = currentState[namesOfSlice.limitOfModel] as number;
        const isCumulative = currentState[namesOfSlice.isCumulativeOfModel] as boolean;
        const countedTo = (count: number) => ({
          [namesOfSlice.modelInsight]: new cnst.insight().set({ ...modelInsight, count }),
          ...lastPageFrom(count, limit),
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
                count: modelInsight.count,
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
        // A paged window pushes its last row to the next page; a cumulative or `limit: 0` list keeps every row.
        const inserted = [...modelList.slice(0, placement), light, ...modelList.slice(placement)];
        const placed = isCumulative || !limit ? inserted : inserted.slice(0, limit);
        this.set({
          [namesOfSlice.modelList]: new DataList(placed as Light[]),
          ...countedTo(modelInsight.count + 1),
          ...staleAt,
        });
      },
      // Points this slice's live room at `queryArgs` for one more watcher, or lets one go on null; the last one closes it.
      [namesOfSlice.watchLiveModel]: function (this: SetGet, queryArgs: unknown[] | null) {
        if (!slice.live) return;
        if (!queryArgs) {
          liveWatchers = Math.max(liveWatchers - 1, 0);
          //? A tick later, as StrictMode or a remount lets go and watches again within one commit.
          if (!liveWatchers)
            queueMicrotask(() => {
              if (!liveWatchers) closeLiveWatch();
            });
          return;
        }
        liveWatchers += 1;
        const args = expandQueryArgs(normalizeQueryArgs(queryArgs, slice.args), slice.args);
        // A filled `pauseOn` argument closes the room as null does, until it is cleared.
        const paused = livePauseIdxs.some((idx) => args[idx] != null);
        const signature = paused ? null : JSON.stringify(args);
        if (liveWatch && signature !== liveWatch.signature) closeLiveWatch();
        if (!signature || liveWatch) return;
        const self = this as unknown as DynamicRecord;
        const apply = self[namesOfSlice.applyLiveModel] as (event: unknown) => void;
        const refresh = self[namesOfSlice.refreshModel] as (form: object) => Promise<void>;
        // The generated subscriber serializes room args as the list query does; a hand-built id would not.
        const subscribe = fetch[keys.endpoint.subscribeLive] as ((...args: unknown[]) => () => void) | undefined;
        if (!subscribe) return;
        const dispose = subscribe(...args, (event: unknown) => apply(event), {
          crystalize: false,
          // The events missed while the socket was down are gone, so the list is refetched rather than patched.
          onResync: () => void refresh({ invalidate: true }),
        });
        liveWatch = { signature, dispose };
        // Rows older than the room's last close missed the events sent while it was closed, as on a page shown again.
        const modelInitAt = (this.get() as { [key: string]: any })[namesOfSlice.modelInitAt] as Date;
        if (liveClosed?.signature === signature && modelInitAt < liveClosed.at)
          this.set({ [namesOfSlice.modelStaleAt]: new Date() });
      },
    };
    return Object.assign(acc, singleSliceAction);
  }, {});
  return { ...baseAction, ...sliceAction };
};
