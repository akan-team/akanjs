import { Logger } from "akanjs/common";
import type {
  BuilderCsrReq,
  BuilderCsrRes,
  BuilderEvent,
  BuilderMessage,
  BuilderReq,
  BuilderRes,
  BuildRouteClientResult,
  BuildRouteResultPayload,
  CsrUpdatedPayload,
  CssPayload,
  DevBuildStatus,
  PagesBundlePayload,
  SsrUpdatedPayload,
} from "./ipcTypes";

export interface BuilderRpcEventHandlers {
  /** A watcher batch changed files: clear the route cache and broadcast a dev reload. */
  onInvalidate?: (event: { kinds: ("code" | "css" | "config")[]; files: string[]; generation?: number }) => void;
  onCssUpdated?: (css: CssPayload) => void;
  /** A fresh `pages-*.js` bundle: re-import it in the running worker (`RscWorker.reload`) rather than respawning. */
  onPagesUpdated?: (bundle: PagesBundlePayload) => void | Promise<void>;
  onCsrUpdated?: (update: CsrUpdatedPayload) => void;
  onSsrUpdated?: (update: SsrUpdatedPayload) => void;
  onBuildStatus?: (status: DevBuildStatus) => void;
}

/** One per backend process: subscribes to the IPC channel on construction and unsubscribes on `dispose()`. */
export class BuilderRpc {
  readonly #logger = new Logger("BuilderRpc");
  readonly #pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly #offMessage: () => void;
  readonly #send: (msg: BuilderReq | BuilderCsrReq) => void;
  #nextId = 1;
  #disposed = false;

  constructor(handlers: BuilderRpcEventHandlers = {}) {
    if (!process.send)
      throw new Error("[builder] process.send unavailable — backend must be spawned by the CLI with ipc enabled");
    this.#send = process.send.bind(process);
    this.#offMessage = this.#listen((msg) => {
      if (msg.type === "build-route-res" || msg.type === "build-csr-res") {
        const res = msg as BuilderRes | BuilderCsrRes;
        const waiter = this.#pending.get(res.id);
        if (!waiter) return;
        this.#pending.delete(res.id);
        if (!res.ok) waiter.reject(new Error(`[builder] ${res.type} failed: ${res.error}`));
        else waiter.resolve(res.type === "build-route-res" ? res.data : undefined);
        return;
      }
      const ev = msg as BuilderEvent;
      switch (ev.type) {
        case "builder-ready":
          this.#logger.verbose("[builder] builder ready");
          return;
        case "invalidate":
          handlers.onInvalidate?.({ kinds: ev.kinds, files: ev.files, generation: ev.generation });
          return;
        case "css-updated":
          handlers.onCssUpdated?.(ev.data);
          return;
        case "pages-updated":
          // Unhandled, a rejection here would reach the process as an unhandledRejection and say nothing to the tabs.
          void Promise.resolve(handlers.onPagesUpdated?.(ev.data)).catch((error: unknown) =>
            this.#logger.error(
              `[builder] pages-updated failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
          return;
        case "csr-updated":
          handlers.onCsrUpdated?.(ev.data);
          return;
        case "ssr-updated":
          handlers.onSsrUpdated?.(ev.data);
          return;
        case "build-status":
          handlers.onBuildStatus?.(ev.data);
          return;
      }
    });
  }

  async buildRoute(
    routeId: string,
    {
      seeds,
      graphSeeds,
      knownEntries,
      generation,
    }: { seeds: string[]; graphSeeds?: string[]; knownEntries: Set<string>; generation?: number },
  ): Promise<BuildRouteClientResult> {
    const payload = await this.#request<BuildRouteResultPayload>(`build-route ${routeId}`, (id) =>
      this.#send({ type: "build-route", id, routeId, seeds, graphSeeds, knownEntries: [...knownEntries], generation }),
    );
    return {
      manifestDelta: payload.manifestDelta,
      ssrManifestDelta: { moduleLoading: null, moduleMap: payload.ssrManifestDelta },
      newEntries: payload.newEntries,
      discoveredEntries: payload.discoveredEntries,
      clientDeps: payload.clientDeps,
      clientDepsByEntry: payload.clientDepsByEntry,
      ...(payload.seenGeneration !== undefined ? { seenGeneration: payload.seenGeneration } : {}),
    };
  }

  /** Arms dev CSR, which the builder skips by default (a full browser build per save), and keeps it in sync after. */
  async buildCsr(reason: string): Promise<void> {
    await this.#request<void>(`build-csr (${reason})`, (id) => this.#send({ type: "build-csr", id, reason }));
  }

  // Generous on purpose: a cold CSR build of every page takes tens of seconds; the point is only to be finite.
  static #timeoutMs(): number {
    const configured = Number(process.env.AKAN_BUILDER_RPC_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return 120_000;
  }

  // Must time out: a builder recycled mid-request never answers, and the dev host only reports failed sends.
  async #request<T>(label: string, send: (id: number) => void): Promise<T> {
    if (this.#disposed) throw new Error("[builder] rpc is disposed");
    const id = this.#nextId++;
    const timeoutMs = BuilderRpc.#timeoutMs();
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new Error(
            `[builder] ${label} got no answer in ${timeoutMs}ms; the builder was likely recycled or restarted mid-request — reload to retry`,
          ),
        );
      }, timeoutMs);
      // `unref` so a pending request cannot by itself keep the process alive during shutdown.
      timer.unref?.();
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      send(id);
    });
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
    process.on("message", handler);
    return () => {
      if (process.off) process.off("message", handler);
      else if (process.removeListener) process.removeListener("message", handler);
    };
  }
}
