import type { Logger } from "akanjs/common";
import { createRscHostRenderStream, type RscPending, type RscRenderResult } from "./rscHostRenderStream";
import type { RscWorkerProcess } from "./rscWorkerProcess";
import type { RscRenderOptions } from "./ssrTypes";

interface RscCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface RscQueuedSend {
  requestId: string;
  send: () => void;
}

export class RscHostRequests {
  readonly pending = new Map<string, RscPending>();
  readonly calls = new Map<string, RscCall>();
  #queuedSends: RscQueuedSend[] = [];
  #hostPendingChunkOverflowCount = 0;
  readonly #worker: RscWorkerProcess;
  readonly #logger: Logger;

  constructor(worker: RscWorkerProcess, logger: Logger) {
    this.#worker = worker;
    this.#logger = logger;
  }

  get queuedSends(): readonly RscQueuedSend[] {
    return this.#queuedSends;
  }

  get hostPendingChunkOverflowCount() {
    return this.#hostPendingChunkOverflowCount;
  }

  render(req: Request, options: RscRenderOptions): Promise<RscRenderResult> {
    const requestId = crypto.randomUUID();
    return createRscHostRenderStream({
      setPending: (pending) => this.pending.set(requestId, pending),
      deletePending: () => this.pending.delete(requestId),
      sendRenderOrQueue: () => this.#sendRenderOrQueue(requestId, req, options),
      cancelRender: () => this.#cancelRender(requestId),
      signal: options.signal,
      onPendingChunkOverflow: () => {
        this.#hostPendingChunkOverflowCount += 1;
      },
    });
  }

  call<T>(message: (requestId: string) => object): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.calls.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      const send = () => {
        if (!this.calls.has(requestId)) return;
        try {
          this.#worker.proc.send(message(requestId));
        } catch (err) {
          this.settleCall(requestId, (call) =>
            call.reject(new Error(`rsc worker send failed: ${err instanceof Error ? err.message : String(err)}`)),
          );
        }
      };
      if (this.#worker.status === "ready") send();
      else if (this.#worker.status === "stopped")
        this.settleCall(requestId, (call) => call.reject(new Error("rsc worker is stopped")));
      else this.#queuedSends.push({ requestId, send });
    });
  }

  settleCall(requestId: string, fn: (call: RscCall) => void): boolean {
    const call = this.calls.get(requestId);
    if (!call) return false;
    this.calls.delete(requestId);
    fn(call);
    return true;
  }

  resolvePending(requestId: string, fn: (p: RscPending) => void): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    fn(p);
    this.pending.delete(requestId);
  }

  static workerHeaders(req: Request, clientIp: string | null | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    // Security: the worker's fetch hands `x-real-ip` to a loopback that trusts it, so a browser's own one never passes.
    delete headers["x-real-ip"];
    if (clientIp) headers["x-real-ip"] = clientIp;
    return headers;
  }

  #sendRenderOrQueue(requestId: string, req: Request, { clientManifest, clientIp, prefetch }: RscRenderOptions): void {
    const send = () => {
      if (!this.pending.has(requestId)) return;
      try {
        const headers = RscHostRequests.workerHeaders(req, clientIp);
        const { url, method } = req;
        this.#worker.proc.send({ type: "render", requestId, url, method, headers, clientManifest, prefetch });
      } catch (err) {
        this.resolvePending(requestId, (p) =>
          p.onError(`rsc worker send failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    };
    if (this.#worker.status === "ready") send();
    else if (this.#worker.status === "stopped") {
      this.resolvePending(requestId, (p) => p.onError("rsc worker is stopped"));
    } else {
      this.#queuedSends.push({ requestId, send });
    }
  }

  #cancelRender(requestId: string): void {
    if (this.#worker.status !== "ready") return;
    try {
      this.#worker.proc.send({ type: "cancel", requestId });
    } catch {
      // A worker that died before this send is cleaned up by its exit path.
    }
  }

  flushQueuedSends(): void {
    const queue = this.#queuedSends;
    this.#queuedSends = [];
    for (const { send } of queue) {
      try {
        send();
      } catch (err) {
        this.#logger.error(`[rsc] queued send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  failRequests(err: Error, which: (requestId: string) => boolean = () => true): void {
    for (const [requestId, pending] of this.pending) {
      if (!which(requestId)) continue;
      this.pending.delete(requestId);
      pending.onError(err.message);
    }
    for (const [requestId, call] of this.calls) {
      if (!which(requestId)) continue;
      this.calls.delete(requestId);
      call.reject(err);
    }
    this.#queuedSends = this.#queuedSends.filter((entry) => !which(entry.requestId));
  }
}
