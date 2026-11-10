export const flushDraftsKey = Symbol("akan.store.flushDrafts");

export interface DraftFlushing {
  [flushDraftsKey]: () => void;
}
