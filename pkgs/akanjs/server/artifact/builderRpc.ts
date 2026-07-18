import { Logger } from "akanjs/common";
import type {
  BuilderEvent,
  BuilderMessage,
  BuilderReq,
  BuilderRes,
  BuildRouteResultPayload,
  CssPayload,
  DevBuildStatus,
  PagesBundlePayload,
} from "./ipcTypes";
import type { BuildRouteClientResult } from "./manifestTypes";

export interface BuilderRpcEventHandlers {
  /**
   * Filesystem batch invalidation from the builder's watcher. The backend
   * should treat this as a hint to clear its route cache and broadcast a
   * dev reload to connected HMR clients.
   */
  onInvalidate?: (event: { kinds: ("code" | "css" | "config")[]; files: string[]; generation?: number }) => void;
  /** Builder proactively recompiled CSS; payload includes base64 bytes. */
  onCssUpdated?: (css: CssPayload) => void;
  /**
   * Builder emitted a freshly bundled `pages-*.js`. Backend should
   * re-import it (e.g. by calling `RscWorker.reload({ pagesBundlePath,
   * buildId })`) so new user code takes effect without spawning a new
   * worker subprocess.
   */
  onPagesUpdated?: (bundle: PagesBundlePayload) => void;
  /** Builder reported a dev build phase success/failure. */
  onBuildStatus?: (status: DevBuildStatus) => void;
}

/**
 * Typed RPC facade around the raw `BuilderTransport`. Handles the
 * correlation-id bookkeeping (request promise + resolver map) and exposes
 * a narrow surface matching the three builder operations.
 *
 * Only one `BuilderRpc` instance should exist per backend process. It
 * subscribes to the transport at construction and unsubscribes on
 * `dispose()`.
 */
export class BuilderRpc {
  readonly #logger = new Logger("BuilderRpc");
  readonly #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly #offMessage: () => void;
  readonly #proc = process;
  readonly #send: (msg: BuilderReq) => void;
  #nextId = 1;
  #disposed = false;

  constructor(handlers: BuilderRpcEventHandlers = {}) {
    if (!this.#proc.send)
      throw new Error("[builder] process.send unavailable — backend must be spawned by the CLI with ipc enabled");
    this.#send = this.#proc.send.bind(this.#proc);
    this.#offMessage = this.#listen((msg) => {
      // Responses: look up the pending promise by id and settle.
      if (msg.type === "build-route-res") {
        const res = msg as BuilderRes;
        const waiter = this.#pending.get(res.id);
        if (!waiter) return;
        this.#pending.delete(res.id);
        if (res.ok) waiter.resolve(res.data);
        else waiter.reject(new Error(`[builder] ${res.type} failed: ${res.error}`));
        return;
      }
      // Broadcast events: dispatch to subscriber hooks.
      const ev = msg as BuilderEvent;
      switch (ev.type) {
        case "builder-ready":
          this.#logger.verbose(`[builder] builder ready buildId=${ev.buildId}`);
          return;
        case "invalidate":
          handlers.onInvalidate?.({ kinds: ev.kinds, files: ev.files, generation: ev.generation });
          return;
        case "css-updated":
          handlers.onCssUpdated?.(ev.data);
          return;
        case "pages-updated":
          handlers.onPagesUpdated?.(ev.data);
          return;
        case "build-status":
          handlers.onBuildStatus?.(ev.data);
          return;
        default:
          return;
      }
    });
  }

  async buildRoute(
    routeId: string,
    { seeds, knownEntries, generation }: { seeds: string[]; knownEntries: Set<string>; generation?: number },
  ): Promise<BuildRouteClientResult> {
    if (this.#disposed) throw new Error("[builder] rpc is disposed");
    const id = this.#nextId++;
    const payload = await new Promise<BuildRouteResultPayload>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.#send({ type: "build-route", id, routeId, seeds, knownEntries: [...knownEntries], generation });
    });
    return {
      manifestDelta: payload.manifestDelta,
      ssrManifestDelta: { moduleLoading: null, moduleMap: payload.ssrManifestDelta },
      newEntries: payload.newEntries,
      discoveredEntries: payload.discoveredEntries,
      clientDeps: payload.clientDeps,
      clientDepsByEntry: payload.clientDepsByEntry,
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#offMessage();
    for (const [, waiter] of this.#pending) waiter.reject(new Error("[builder] rpc disposed"));
    this.#pending.clear();
  }

  #listen(listener: (msg: BuilderMessage) => void): () => void {
    const handler = (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      listener(msg as BuilderMessage);
    };
    this.#proc.on("message", handler);
    return () => {
      if (this.#proc.off) this.#proc.off("message", handler);
      else if (this.#proc.removeListener) this.#proc.removeListener("message", handler);
    };
  }
}
