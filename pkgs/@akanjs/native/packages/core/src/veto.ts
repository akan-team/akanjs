// Page side of a cancelable host event (window closeRequested, app beforeQuit; plugins.md D4).
// One subscription runs every handler in order. The host gets { id } as soon as the event arrives
// (so it knows the page is alive and deciding) and { id, allow } once the handlers are done.

export interface VetoEvent {
  /** Keeps the window open / the app running. Call it before the handler returns (await first if needed). */
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export type VetoHandler<E> = (event: E & VetoEvent) => void | Promise<void>;

/**
 * Builds an `onX(handler)` registration for a cancelable event.
 * `listen` subscribes to the plugin event; `answer` is the plugin method the host waits for.
 * Registering is a no-op where the event is not supported (it simply never fires).
 */
export function vetoable<E extends object>(
  listen: (listener: (data: E & { id: number }) => void) => () => void,
  answer: (args: { id: number; allow?: boolean }) => Promise<unknown>,
): (handler: VetoHandler<E>) => () => void {
  const handlers = new Set<VetoHandler<E>>();
  let stop: (() => void) | null = null;

  const onEvent = async ({ id, ...data }: E & { id: number }) => {
    const send = (allow?: boolean) => answer(allow === undefined ? { id } : { id, allow }).catch(() => {});
    void send();
    let prevented = false;
    const event = {
      ...(data as unknown as E),
      preventDefault: () => {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    };
    for (const handler of [...handlers]) {
      try {
        await handler(event);
      } catch (error) {
        console.error("[akan-native] cancelable event handler failed", error);
      }
    }
    void send(!prevented);
  };

  return (handler) => {
    handlers.add(handler);
    stop ??= listen(onEvent);
    return () => {
      if (!handlers.delete(handler) || handlers.size > 0) return;
      stop?.();
      stop = null;
    };
  };
}
