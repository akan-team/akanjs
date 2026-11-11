type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

//? A provider streams through a callback, which cannot yield: deltas queue here until the consumer pulls them.
export class DeltaStream {
  static async *of<T, E>(
    run: (onDelta?: (delta: string) => void) => Promise<T>,
    toEvent: ((delta: string) => E) | null,
  ): AsyncGenerator<E, T> {
    if (!toEvent) return await run();
    const deltas: string[] = [];
    const state: { settled: Settled<T> | null; wake: () => void } = { settled: null, wake: () => undefined };
    void run((delta) => {
      deltas.push(delta);
      state.wake();
    }).then(
      (value) => {
        state.settled = { ok: true, value };
        state.wake();
      },
      (error: unknown) => {
        state.settled = { ok: false, error };
        state.wake();
      },
    );
    for (;;) {
      const delta = deltas.shift();
      if (delta !== undefined) {
        yield toEvent(delta);
        continue;
      }
      const { settled } = state;
      if (settled) {
        if (settled.ok) return settled.value;
        throw settled.error;
      }
      await new Promise<void>((resolve) => {
        state.wake = resolve;
      });
    }
  }
}
