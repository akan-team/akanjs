import { Logger } from "akanjs/common";
import { type DraftFlushing, flushDraftsKey } from "./draftFlush";
import { DraftStore } from "./draftStore";
import type { DraftState } from "./state";
import type { SetGet } from "./types";

interface DraftSave {
  restore: boolean;
}

export const makeFormDrafts = (refName: string, names: { modelDraft: string; modelForm: string }) => {
  // Deliberately not store state: a secret field in the opened form must not reach a subscribed component.
  let openFormBase: object | null = null;
  const draftSaves = new WeakMap<SetGet, Map<string, Set<DraftSave>>>();
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
    // While a form under this key saves, the record holds the form being saved.
    if (!draft || draftSaves.get(this)?.has(draft.key)) return;
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
  // A discard or reset during a save wins over that save's restore when it fails.
  const forgetDraft = (ctx: SetGet, key: string) => {
    for (const save of draftSaves.get(ctx)?.get(key) ?? []) save.restore = false;
    void DraftStore.remove(key);
  };
  const clearDraft = (ctx: SetGet, draft: DraftState | null) => {
    openFormBase = null;
    if (draft) forgetDraft(ctx, draft.key);
    return null;
  };
  const holdsSavedForm = (record: { form: Record<string, unknown> }, form: object) =>
    DraftStore.contentHash(record.form) === DraftStore.contentHash(DraftStore.encodeForm(refName, form));
  const restoreSavedDraft = async (draft: DraftState, form: object) => {
    // A record still there is the saved form's or one a form opened meanwhile wrote; an unchanged form never had one.
    if ((await DraftStore.read(draft.key)) || DraftStore.formHash(refName, form) === draft.baseHash) return;
    await DraftStore.write(draft.key, {
      v: 1,
      savedAt: new Date().toISOString(),
      baseUpdatedAt: draft.baseUpdatedAt,
      form: DraftStore.encodeForm(refName, form),
    });
  };
  // The record stays in storage until the request succeeds, so a reload mid-save that never reached the server keeps it.
  const savingDraft = async <T>(ctx: SetGet, draft: DraftState | null, form: object, save: () => Promise<T>) => {
    if (!draft) return await save();
    // A debounce left pending past submit fires on whatever form is open by then, and drops the record if it is blank.
    (ctx as SetGet & Partial<DraftFlushing>)[flushDraftsKey]?.();
    const saves = draftSaves.get(ctx) ?? new Map<string, Set<DraftSave>>();
    draftSaves.set(ctx, saves);
    const keySaves = saves.get(draft.key) ?? new Set<DraftSave>();
    saves.set(draft.key, keySaves);
    const thisSave: DraftSave = { restore: true };
    keySaves.add(thisSave);
    try {
      const answer = await save();
      // A form opened under the key during the save may have written its own record since.
      const record = await DraftStore.read(draft.key);
      if (record && holdsSavedForm(record, form)) await DraftStore.remove(draft.key);
      return answer;
    } catch (error) {
      if (thisSave.restore)
        await restoreSavedDraft(draft, form).catch((restoreError: unknown) => {
          Logger.warn(`Failed to restore the ${refName} form draft: ${String(restoreError)}`);
        });
      throw error;
    } finally {
      keySaves.delete(thisSave);
      if (!keySaves.size) saves.delete(draft.key);
    }
  };
  return { formBase: () => openFormBase, armDraft, applyDraft, forgetDraft, clearDraft, savingDraft };
};
