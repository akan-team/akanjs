import type { AsyncLocalStorage } from "node:async_hooks";
import type { TransactionContext } from "./types";

export class TransactionScope {
  //? A task the transaction started without awaiting keeps its async context past the commit: it must not join the
  //? finished transaction, queue onto callbacks that already ran, or reuse the connection Postgres gave back.
  static live<T extends TransactionContext>(storage: AsyncLocalStorage<T>) {
    const context = storage.getStore();
    return context && !context.closed ? context : undefined;
  }

  //? One post-save hook that throws must not skip the callbacks after it; its error still reaches the caller, as it
  //? does for a save outside a transaction.
  static async runAfterCommit(context: TransactionContext) {
    let failure: { error: unknown } | null = null;
    for (const hook of context.afterCommit) {
      try {
        await hook();
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  }
}
