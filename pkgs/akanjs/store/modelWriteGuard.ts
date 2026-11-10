import { AbortSignals } from "akanjs/common";
import { actionErrorKey } from "./actionErrorKey";
import { markOpenedIn, type OpenSeq, openSeqIn } from "./openSeq";
import type { SetGet } from "./types";

type StateRecord = { [key: string]: unknown };
interface WriteGuardNames {
  model: string;
  modelForm: string;
  modelModal: string;
  modelLoading: string;
}

export const makeModelWriteGuard = (names: WriteGuardNames) => {
  const flagOwners = new WeakMap<SetGet, Map<string, object>>();
  const openSeqOf = (ctx: SetGet) => openSeqIn(ctx, names.model);
  const markOpened = (ctx: SetGet, opens: { form: boolean }) => markOpenedIn(ctx, names.model, opens);
  // A view, edit or new form opened during a write's request owns the modal and the open model when the write lands.
  const isOvertaken = (ctx: SetGet, seen: OpenSeq) => openSeqOf(ctx).open !== seen.open;
  // Only an edit or new form takes the form over: a save that a view overtook still resets the form it saved.
  const isSavedFormOpen = (ctx: SetGet, seen: OpenSeq, savedForm: { id?: string }) =>
    openSeqOf(ctx).form === seen.form &&
    ((ctx.get() as StateRecord)[names.modelForm] as { id?: string }).id === savedForm.id;
  // A write owns its loading flag while the flag holds its value and no later write has set the flag since.
  const withFlag = async <T>(
    ctx: SetGet,
    {
      flag,
      opening = {},
      failed,
      onError,
      request,
      land,
    }: {
      flag: { key: string; value: string | true } | null;
      opening?: StateRecord;
      failed?: () => StateRecord;
      onError?: (key: string) => void;
      request: () => Promise<T>;
      land: (answer: T, ownsFlag: boolean) => void;
    },
  ) => {
    const owner = {};
    let answered = false;
    const ownsFlag = () =>
      !!flag && flagOwners.get(ctx)?.get(flag.key) === owner && (ctx.get() as StateRecord)[flag.key] === flag.value;
    try {
      if (flag) {
        const owners = flagOwners.get(ctx) ?? new Map<string, object>();
        flagOwners.set(ctx, owners.set(flag.key, owner));
      }
      if (flag || Object.keys(opening).length) ctx.set({ ...opening, ...(flag ? { [flag.key]: flag.value } : {}) });
      const answer = await request();
      answered = true;
      land(answer, ownsFlag());
      return answer;
    } catch (error) {
      const released = { ...(flag && ownsFlag() ? { [flag.key]: false } : {}), ...failed?.() };
      if (Object.keys(released).length) ctx.set(released);
      // A landing that throws after the server took the write is not the caller's failed request to report.
      if (!answered && !AbortSignals.isAbort(error)) onError?.(actionErrorKey(error));
      throw error;
    }
  };
  // A failed latest open would leave its modal over another record; a payload-seeded one already shows the right record.
  const closedUnlessShown = (ctx: SetGet, seen: OpenSeq, shownKey: string, id: string): StateRecord =>
    isOvertaken(ctx, seen) || ((ctx.get() as StateRecord)[shownKey] as { id?: string } | null)?.id === id
      ? {}
      : { [names.modelModal]: null };
  const openModelPatchOf = (
    latest: StateRecord,
    updatedModel: { id: string },
    ownsFlag: boolean,
    opened: StateRecord = {},
  ) => ({
    ...((latest[names.model] as { id: string } | null)?.id === updatedModel.id
      ? { [names.model]: updatedModel, ...opened }
      : {}),
    ...(ownsFlag ? { [names.modelLoading]: false } : {}),
  });
  return { openSeqOf, markOpened, isOvertaken, isSavedFormOpen, withFlag, closedUnlessShown, openModelPatchOf };
};
