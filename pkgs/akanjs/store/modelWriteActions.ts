import { DataList, type Dayjs, type GetStateObject } from "akanjs/base";
import type { DynamicRecord } from "akanjs/common";
import { type BaseInsight, type BaseObject, type DefaultOf, immerify } from "akanjs/constant";
import type { CreateOption } from "./actionOption";
import type { ModelActionContext, ReportingFetchPolicy } from "./modelActionContext";
import type { DraftState } from "./state";
import type { SetGet } from "./types";

type StateRecord = { [key: string]: unknown };
type Input = BaseObject;
type Full = BaseObject;
type Light = BaseObject;
interface Insight {
  count: number;
}

export const formSaveActionsOf = (ctx: ModelActionContext) => {
  const { cnst, modelRef, names, isUploadingIn, defaultKeyOf, staleAtOfSlices, servedFetch } = ctx;
  const { openSeqOf, isOvertaken, isSavedFormOpen, withFlag, openModelPatchOf } = ctx;
  const { clearDraft, savingDraft, createdListPatchOf, applyLiveCreate, updatedListPatchOf } = ctx;
  return {
    [names.createModelInForm]: async function (
      this: SetGet,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const defaultModel = currentState[defaultKeyOf(sliceName)] as Full;
      const modelInput = (cnst.input.purify as (form: any) => DefaultOf<Input> | null)(modelForm);

      if (!modelInput || isUploadingIn(currentState)) return;
      const openSeq = openSeqOf(this);
      const draft = currentState[names.modelDraft] as DraftState | null;
      const model = await withFlag(this, {
        flag: { key: names.modelLoading, value: true },
        onError,
        request: () => savingDraft(this, draft, modelForm, () => servedFetch<Full>(names.createModel)(modelInput)),
        land: (model, ownsFlag) => {
          this.set({
            ...(isSavedFormOpen(this, openSeq, modelForm)
              ? { [names.modelForm]: immerify(modelRef, defaultModel), [names.modelDraft]: clearDraft(this, draft) }
              : {}),
            ...(isOvertaken(this, openSeq)
              ? {}
              : { [names.model]: model, [names.modelViewAt]: new Date(), [names.modelModal]: modal ?? null }),
            ...(ownsFlag ? { [names.modelLoading]: false } : {}),
            ...staleAtOfSlices(),
            ...(typeof path === "string" && path ? { [path]: model } : {}),
            ...createdListPatchOf(sliceName, model, this.get()),
          });
        },
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
      const openSeq = openSeqOf(this);
      const draft = currentState[names.modelDraft] as DraftState | null;
      const updatedModel = await withFlag(this, {
        flag: model?.id === modelForm.id ? { key: names.modelLoading, value: modelForm.id } : null,
        onError,
        request: () =>
          savingDraft(this, draft, modelForm, () => servedFetch<Full>(names.updateModel)(modelForm.id, modelInput)),
        land: (updatedModel, ownsFlag) => {
          const latest = this.get() as StateRecord;
          this.set({
            ...openModelPatchOf(latest, updatedModel, ownsFlag, { [names.modelViewAt]: new Date() }),
            ...(isSavedFormOpen(this, openSeq, modelForm)
              ? { [names.modelForm]: immerify(modelRef, defaultModel), [names.modelDraft]: clearDraft(this, draft) }
              : {}),
            ...(isOvertaken(this, openSeq) ? {} : { [names.modelModal]: modal ?? null }),
            ...staleAtOfSlices(),
            ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
            ...updatedListPatchOf(latest, updatedModel),
          });
        },
      });
      await onSuccess?.(updatedModel);
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
  };
};

export const modelWriteActionsOf = (ctx: ModelActionContext) => {
  const { cnst, slices, names, staleAtOfSlices, servedFetch } = ctx;
  const { openSeqOf, isOvertaken, withFlag, openModelPatchOf } = ctx;
  const { createdListPatchOf, applyLiveCreate, updatedListPatchOf } = ctx;
  return {
    [names.createModel]: async function (
      this: SetGet,
      data: GetStateObject<Input>,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const modelInput = (cnst.input.purify as (data: any) => Input | null)(data);
      if (!modelInput) return;
      const openSeq = openSeqOf(this);
      const model = await withFlag(this, {
        flag: { key: names.modelLoading, value: true },
        onError,
        request: () => servedFetch<Full>(names.createModel)(modelInput),
        land: (model, ownsFlag) => {
          this.set({
            ...(isOvertaken(this, openSeq)
              ? {}
              : { [names.model]: model, [names.modelViewAt]: new Date(), [names.modelModal]: modal ?? null }),
            ...(ownsFlag ? { [names.modelLoading]: false } : {}),
            ...staleAtOfSlices(),
            ...(typeof path === "string" && path ? { [path]: model } : {}),
            ...createdListPatchOf(sliceName, model, this.get()),
          });
        },
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
      const openSeq = openSeqOf(this);
      const updatedModel = await withFlag(this, {
        flag: model?.id === id ? { key: names.modelLoading, value: id } : null,
        onError,
        request: () => servedFetch<Full>(names.updateModel)(id, modelInput),
        land: (updatedModel, ownsFlag) => {
          const latest = this.get() as StateRecord;
          this.set({
            ...openModelPatchOf(latest, updatedModel, ownsFlag, { [names.modelViewAt]: new Date() }),
            ...(isOvertaken(this, openSeq) ? {} : { [names.modelModal]: modal ?? null }),
            ...staleAtOfSlices(),
            ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
            ...updatedListPatchOf(latest, updatedModel),
          });
        },
      });
      await onSuccess?.(updatedModel);
    },
    [names.removeModel]: async function (
      this: SetGet,
      id: string,
      options?: ReportingFetchPolicy & { modal?: string | null },
    ) {
      const { modal, onError, ...fetchPolicyOptions } = options ?? {};
      await withFlag(this, {
        flag: null,
        onError,
        request: () => servedFetch<Full & { removedAt: Dayjs | null }>(names.removeModel)(id, fetchPolicyOptions),
        land: (model) => {
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
      });
    },
    [names.mergeModel]: async function (
      this: SetGet,
      modelOrId: Full | string,
      data: Partial<Full>,
      options?: ReportingFetchPolicy,
    ) {
      const { onError, ...fetchPolicyOptions } = options ?? {};
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      const model = (this.get() as StateRecord)[names.model] as Full | null;
      await withFlag(this, {
        flag: id === model?.id ? { key: names.modelLoading, value: id } : null,
        onError,
        request: () => servedFetch<Full>(names.mergeModel)(modelOrId, data, fetchPolicyOptions),
        land: (updatedModel, ownsFlag) => {
          const latest = this.get() as StateRecord;
          this.set({
            ...openModelPatchOf(latest, updatedModel, ownsFlag),
            ...staleAtOfSlices(),
            ...updatedListPatchOf(latest, updatedModel),
          });
        },
      });
    },
  };
};
