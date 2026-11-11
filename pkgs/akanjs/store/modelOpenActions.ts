import { deepObjectify, plainFieldsOf } from "akanjs/common";
import { type BaseObject, immerify } from "akanjs/constant";
import type { EditOption, NewOption } from "./actionOption";
import type { ModelActionContext, ReportingFetchPolicy } from "./modelActionContext";
import type { DraftState } from "./state";
import type { SetGet } from "./types";

type Input = BaseObject;
type Full = BaseObject;

export const modelOpenActionsOf = (ctx: ModelActionContext) => {
  const { modelRef, names, defaultKeyOf, updatedAtOf, servedFetch } = ctx;
  const { markOpened, isOvertaken, withFlag, closedUnlessShown, armDraft, applyDraft } = ctx;
  return {
    [names.newModel]: function (
      this: SetGet,
      partial: Partial<Full> = {},
      { modal, setDefault, sliceName = names.model, draftScope }: NewOption = {},
    ) {
      markOpened(this, { form: true });
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
      { modal, onError, draftScope }: EditOption & ReportingFetchPolicy = {},
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      const openSeq = markOpened(this, { form: true });
      await withFlag(this, {
        flag: { key: names.modelFormLoading, value: id },
        opening: { [names.modelModal]: modal ?? "edit" },
        failed: () => closedUnlessShown(this, openSeq, names.modelForm, id),
        onError,
        request: () => servedFetch<Full>(names.model)(id),
        land: (model, ownsFlag) => {
          const released = ownsFlag ? { [names.modelFormLoading]: false } : {};
          if (isOvertaken(this, openSeq)) {
            if (ownsFlag) this.set(released);
            return;
          }
          const modelForm = immerify(modelRef, deepObjectify<Input>(model as unknown as Input) as object) as Input;
          this.set({
            ...released,
            [names.model]: model,
            [names.modelViewAt]: new Date(),
            [names.modelForm]: modelForm,
            [names.modelDraft]: armDraft.call(this, draftScope, modelForm, updatedAtOf(model)),
          });
          // A record that moved keeps the draft pending: overwriting a server value the user sees is not recoverable.
          if (draftScope) void applyDraft.call(this, { auto: false });
        },
      });
    },
    [names.viewModel]: async function (
      this: SetGet,
      modelOrId: Full | string,
      { modal, onError }: { modal?: string | null } & ReportingFetchPolicy = {},
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      const openSeq = markOpened(this, { form: false });
      await withFlag(this, {
        flag: { key: names.modelLoading, value: id },
        opening: { [names.modelModal]: modal ?? "view" },
        failed: () => closedUnlessShown(this, openSeq, names.model, id),
        onError,
        request: () => servedFetch<Full>(names.model)(id),
        land: (model, ownsFlag) => {
          this.set({
            ...(isOvertaken(this, openSeq) ? {} : { [names.model]: model, [names.modelViewAt]: new Date() }),
            ...(ownsFlag ? { [names.modelLoading]: false } : {}),
          });
        },
      });
    },
  };
};

export const modelStateActionsOf = (ctx: ModelActionContext) => {
  const { cnst, modelRef, names, staleAtOfSlices, updatedAtOf, updatedListPatchOf } = ctx;
  const { formBase, armDraft, applyDraft, forgetDraft, clearDraft } = ctx;
  return {
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
        [names.modelDraft]: clearDraft(this, currentState[names.modelDraft] as DraftState | null),
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
      forgetDraft(this, draft.key);
      // Saving stays armed; dropping an applied draft puts back the form as the editor opened it.
      this.set({
        ...(draft.appliedAt && formBase() ? { [names.modelForm]: formBase() } : {}),
        [names.modelDraft]: { ...draft, pending: null, appliedAt: null },
      });
    },
  };
};
