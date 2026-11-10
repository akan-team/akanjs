import type { SetGet } from "./types";

export interface OpenSeq {
  open: number;
  form: number;
}
type StateOf = Pick<SetGet, "get">;

// Keyed by the state getter, not the action context a component cannot reach: `st` and the context share the getter.
const openSeqs = new WeakMap<SetGet["get"], Map<string, OpenSeq>>();

export const openSeqIn = (store: StateOf, model: string): OpenSeq =>
  openSeqs.get(store.get)?.get(model) ?? { open: 0, form: 0 };

export const markOpenedIn = (store: StateOf, model: string, { form }: { form: boolean }) => {
  const seen = openSeqIn(store, model);
  const opened = { open: seen.open + 1, form: form ? seen.form + 1 : seen.form };
  openSeqs.set(store.get, (openSeqs.get(store.get) ?? new Map<string, OpenSeq>()).set(model, opened));
  return opened;
};

export const seedOpen = (
  store: Pick<SetGet, "get" | "set">,
  model: string,
  opens: "view" | "form",
  seed: { [key: string]: unknown },
) => {
  markOpenedIn(store, model, { form: opens === "form" });
  store.set(seed);
};
