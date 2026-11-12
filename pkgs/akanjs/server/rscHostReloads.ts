import { type AkanI18nConfig, DEFAULT_AKAN_I18N } from "akanjs/common";
import type { ClientManifest } from "./artifact";
import type { RscProcess, RscWorkerProcess } from "./rscWorkerProcess";
import type { RscWorkerRecycler } from "./rscWorkerRecycler";
import type { BaseBuildArtifact, CssAsset } from "./types";

export interface RscWorkerReloadInput {
  clientManifest: ClientManifest;
  cssAssets?: Record<string, CssAsset>;
  buildId: number;
  /** Undefined keeps the latest bundle a reload named (e.g. a client-manifest-only reload after a lazy route build). */
  pagesBundlePath?: string;
}

export interface RscAdoptedBundle {
  pagesBundlePath: string;
  buildId: number;
}

interface RscReloadWaiter {
  resolve: (adopted: RscAdoptedBundle) => void;
  reject: (err: RscReloadFailure) => void;
}

/** A reload the worker did not take: what it runs instead, and whether a later reload failed in this one's place. */
export interface RscReloadFailure extends Error {
  /** What the worker runs now. */
  adopted: RscAdoptedBundle;
  /** The latest state it was asked to take, which a later reload may have moved past the caller's own. */
  failed: RscAdoptedBundle;
}

interface RscBootState extends RscAdoptedBundle {
  reloadState: number;
  cssAssets: Record<string, CssAsset>;
}

interface RscReloadedReply {
  buildId: number;
  reloadId?: number;
  pagesBundlePath?: string;
}

interface RscReloadErrorReply {
  message: string;
  reloadId?: number;
  running?: RscAdoptedBundle;
}

export class RscHostReloads {
  cssAssets: Record<string, CssAsset>;
  #clientManifest: ClientManifest;
  #pagesBundlePath: string;
  #pagesBundleBuildId: number;
  readonly #basePaths: string[];
  readonly #i18n: AkanI18nConfig;
  //? The newest reload state and everyone waiting on it: sent to a ready worker under `reloadId`, or left for the next
  //? worker to become ready (a respawn, a rolling recycle), whose init reply or next reload carries it.
  #pendingReload: {
    waiters: RscReloadWaiter[];
    reloadState: number;
    reloadId: number | null;
    pagesBundlePath: string;
    buildId: number;
  } | null = null;
  #nextReloadId = 1;
  #answeredReloadId = 0;
  #reloadState = 0;
  #init: RscBootState = {
    pagesBundlePath: "",
    buildId: 0,
    reloadState: 0,
    cssAssets: {},
  };
  /** What the worker runs: a respawn falls back to it when the bundle a reload named failed to import. */
  #adopted: RscAdoptedBundle;
  readonly #worker: RscWorkerProcess;
  readonly #recycler: RscWorkerRecycler;

  constructor(artifact: BaseBuildArtifact, worker: RscWorkerProcess, recycler: RscWorkerRecycler) {
    this.#worker = worker;
    this.#recycler = recycler;
    this.#clientManifest = artifact.rscRuntimeClientManifest ?? {};
    this.#pagesBundlePath = artifact.pagesBundlePath;
    this.#pagesBundleBuildId = artifact.pagesBundleBuildId;
    this.#adopted = { pagesBundlePath: artifact.pagesBundlePath, buildId: artifact.pagesBundleBuildId };
    this.cssAssets = artifact.cssAssets ?? {};
    this.#basePaths = artifact.basePaths ?? [];
    this.#i18n = artifact.i18n ?? DEFAULT_AKAN_I18N;
  }

  get init(): Readonly<RscBootState> {
    return this.#init;
  }

  reload(input: RscWorkerReloadInput): Promise<RscAdoptedBundle> {
    if (this.#worker.killed) return Promise.reject(new Error("rsc worker is stopped"));
    this.#reloadState += 1;
    this.#clientManifest = input.clientManifest;
    this.cssAssets = input.cssAssets ?? this.cssAssets;
    this.#pagesBundleBuildId = input.buildId;
    if (input.pagesBundlePath) this.#pagesBundlePath = input.pagesBundlePath;
    return new Promise<RscAdoptedBundle>((resolve, reject) => {
      //? A superseded reload settles with the one that superseded it: the worker drops it unadopted, so resolving it
      //? at once let its caller refresh the tabs while the worker still ran the bundle before both.
      this.#pendingReload = {
        waiters: [...(this.#pendingReload?.waiters ?? []), { resolve, reject }],
        reloadState: this.#reloadState,
        reloadId: null,
        pagesBundlePath: this.#pagesBundlePath,
        buildId: this.#pagesBundleBuildId,
      };
      if (this.#worker.status === "ready") this.sendPendingReload();
    });
  }

  sendPendingReload(): void {
    const pending = this.#pendingReload;
    if (!pending) return;
    // Bun's ESM registry never evicts an old `?v=<buildId>` import, so in-place reloads ratchet RSS; recycle (rolling)
    // past a threshold — recycling on every reload would throw away every lazily-warmed route module.
    //? Not while a reload sent to this worker is unanswered: it may still adopt that one after a replacement took over,
    //? unheard, so this one goes in place and a later reload recycles.
    const answering = this.#answeredReloadId < this.#nextReloadId - 1;
    if (
      !answering &&
      this.#recycler.shouldRecycleForReloadAccumulation() &&
      this.#recycler.restartWhenIdle("pages-reload-accumulation")
    )
      return;
    this.#worker.reloadsSinceSpawn += 1;
    pending.reloadId = this.#nextReloadId++;
    try {
      //? The latest bundle, never a request's own: one sent without a path made the worker fall back to the bundle it
      //? had adopted, while the reload it superseded was still importing the newer one.
      this.#worker.proc.send({
        type: "reload",
        clientManifest: this.#clientManifest,
        cssAssets: this.cssAssets,
        buildId: pending.buildId,
        pagesBundlePath: pending.pagesBundlePath,
        reloadId: pending.reloadId,
      });
    } catch {
      // A closed channel means the worker is exiting: its respawn's init reply carries this state.
      pending.reloadId = null;
    }
  }

  #resolveReload(adopted: RscAdoptedBundle): void {
    this.#adopted = adopted;
    const pending = this.#pendingReload;
    if (!pending) return;
    this.#pendingReload = null;
    for (const waiter of pending.waiters) waiter.resolve(adopted);
  }

  //? The worker did not take the latest state, so the host goes back to what it runs: the next respawn then boots a
  //? bundle that loads, and each caller learns what the worker serves.
  rejectReload(message: string): void {
    this.#pagesBundlePath = this.#adopted.pagesBundlePath;
    this.#pagesBundleBuildId = this.#adopted.buildId;
    const pending = this.#pendingReload;
    if (!pending) return;
    this.#pendingReload = null;
    const failed = { pagesBundlePath: pending.pagesBundlePath, buildId: pending.buildId };
    for (const waiter of pending.waiters)
      waiter.reject(Object.assign(new Error(message), { adopted: this.#adopted, failed }));
  }

  rejectIfCovered(message: string): boolean {
    const covered = !this.#pendingReload || this.#pendingReload.reloadState <= this.#init.reloadState;
    if (covered) this.rejectReload(message);
    return covered;
  }

  sendInit(): void {
    this.#init = {
      pagesBundlePath: this.#pagesBundlePath,
      buildId: this.#pagesBundleBuildId,
      reloadState: this.#reloadState,
      cssAssets: this.cssAssets,
    };
    this.#worker.proc.send({
      type: "init",
      clientManifest: this.#clientManifest,
      pagesBundlePath: this.#pagesBundlePath,
      pagesBundleBuildId: this.#pagesBundleBuildId,
      cssAssets: this.cssAssets,
      basePaths: this.#basePaths,
      i18n: this.#i18n,
    });
  }

  answerSentReloads(): void {
    this.#answeredReloadId = this.#nextReloadId - 1;
  }

  adoptInit(): void {
    //? A worker that booted from the init reply runs the reload state of its hello: a reload the crashed or recycled
    //? one never answered is taken by it, and one that came after that hello is sent to it now.
    this.#adopted = { pagesBundlePath: this.#init.pagesBundlePath, buildId: this.#init.buildId };
    if (this.#pendingReload && this.#pendingReload.reloadState <= this.#init.reloadState)
      this.#resolveReload(this.#adopted);
    else this.sendPendingReload();
  }

  onReloaded(message: RscReloadedReply, proc: RscProcess): void {
    const pending = this.#pendingReload;
    //? The worker adopts in the order it was sent, so its latest answer is what it runs, even one a newer reload
    //? overtook on the way here: a failure of that newer one goes back to it, not to the bundle before. With no
    //? reload waiting, the host's own state follows too, so a crash respawn boots it.
    if (proc === this.#worker.proc && message.pagesBundlePath) {
      this.#adopted = { pagesBundlePath: message.pagesBundlePath, buildId: message.buildId };
      this.#answeredReloadId = Math.max(this.#answeredReloadId, message.reloadId ?? 0);
      if (!pending) {
        this.#pagesBundlePath = message.pagesBundlePath;
        this.#pagesBundleBuildId = message.buildId;
      }
    }
    if (pending && pending.reloadId !== null && pending.reloadId === message.reloadId)
      this.#resolveReload({ pagesBundlePath: pending.pagesBundlePath, buildId: pending.buildId });
  }

  onReloadFailed(message: RscReloadErrorReply, proc: RscProcess): void {
    if (proc === this.#worker.proc) this.#answeredReloadId = Math.max(this.#answeredReloadId, message.reloadId ?? 0);
    if (proc === this.#worker.proc && message.running) this.#adopted = message.running;
    const pending = this.#pendingReload;
    if (pending && pending.reloadId !== null && pending.reloadId === message.reloadId)
      this.rejectReload(String(message.message));
  }
}
