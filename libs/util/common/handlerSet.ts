/**
 * A tiny in-process observer registry: how a library notifies a host of something it observed, without
 * knowing who is listening or what they will do about it.
 *
 * `listen` returns its own unsubscribe closure, so a caller never has to hold onto the handler identity to
 * detach it. Handlers are isolated — one that throws cannot stop the others from being called, because a
 * notification is not the notifier's business logic and must not fail it.
 *
 * XXX: in-process only. Handlers registered in one process are invisible to another, so a library and its
 * listener must run in the SAME process (in this workspace, the `batch` process) for wiring to take
 * effect. If they are ever split, this has to become a real message channel.
 */
export class HandlerSet<Args extends unknown[]> {
  private readonly handlers = new Set<(...args: Args) => void | Promise<void>>();

  listen(handler: (...args: Args) => void | Promise<void>): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(...args: Args): void {
    for (const handler of this.handlers) {
      try {
        handler(...args);
      } catch {
        // isolated: one listener's failure must not stop the rest, nor fail the emitter
      }
    }
  }

  /**
   * Same isolation, but waits for each handler to settle before returning.
   *
   * Use it wherever the emitter goes on to do something the handler's work has to precede — seeding a file
   * into a checkout that is about to be committed, say. With plain {@link emit} a handler that returns a
   * promise is fire-and-forget, and the race is invisible: it usually wins.
   */
  async emitAsync(...args: Args): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(...args);
      } catch {
        // isolated: one listener's failure must not stop the rest, nor fail the emitter
      }
    }
  }
}
