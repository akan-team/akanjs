import { rm } from "node:fs/promises";
import path from "node:path";
import { ApplicationBuildReporter } from "@akanjs/devkit/app/applicationBuildReporter";
import type { App } from "@akanjs/devkit/commandDecorators";
import { CsrDevBundler } from "@akanjs/devkit/frontendBuild/csrDevBundler";
import { CsrDevPatcher } from "@akanjs/devkit/frontendBuild/csrDevPatcher";
import type { Logger } from "akanjs/common";
import type { BaseBuildArtifact, BuilderCsrReq, HmrTrace } from "akanjs/server";
import { CSR_DEV_PATCHING_MARKER } from "akanjs/server/hmr/csrDevManifest";
import type { BatchWork, BuildBatchRequest } from "./buildBatchProtocol";
import type { BuildBatchRunner } from "./buildBatchRunner";
import { isCompileError, sendBuildStatus } from "./builderBuildStatus";
import { BuilderChannel } from "./builderChannel";
import type { BuilderLanes } from "./builderLanes";

interface CsrRegistryLinks {
  generation: () => number;
  artifact: () => BaseBuildArtifact;
  batchRequest: (work: BatchWork) => Promise<BuildBatchRequest>;
  countDelegation: (registry: "csr" | "ssr", reason: string) => string;
}

export class CsrRegistry {
  readonly #app: App;
  readonly #logger: Logger;
  readonly #lanes: BuilderLanes;
  readonly #batchRunner: BuildBatchRunner;
  readonly #links: CsrRegistryLinks;
  #shellKey: string | null = null;
  #csrActive = CsrRegistry.#csrArmedByEnv();
  #csrBundler: CsrDevBundler;
  /** Null when `AKAN_DEV_CSR_PATCHER=off`: every CSR save then goes to a build worker, as before the patcher. */
  #patcher: CsrDevPatcher | null;
  /** A worker's full CSR build (arming, re-arming) that a patch must not race for the csr-dev directory. */
  #csrGate: Promise<void> = Promise.resolve();
  #csrArming = false;
  #csrArms = 0;
  #csrWasActive = false;
  #csrArmSucceeded = false;

  constructor(
    app: App,
    { logger, lanes, batchRunner }: { logger: Logger; lanes: BuilderLanes; batchRunner: BuildBatchRunner },
    links: CsrRegistryLinks,
  ) {
    this.#app = app;
    this.#logger = logger;
    this.#lanes = lanes;
    this.#batchRunner = batchRunner;
    this.#links = links;
    this.#csrBundler = new CsrDevBundler(app);
    this.#patcher =
      process.env.AKAN_DEV_CSR_PATCHER === "off" ? null : new CsrDevPatcher(this.#csrBundler, { resident: true });
  }

  get csrActive(): boolean {
    return this.#csrActive;
  }

  get csrArming(): boolean {
    return this.#csrArming;
  }

  get patcher(): CsrDevPatcher | null {
    return this.#patcher;
  }

  // True when the save has to go to a build worker: the patcher handed it back, or threw (the worker reports why).
  async patchCsr(generation: number, files: string[], trace: HmrTrace): Promise<boolean> {
    const patcher = this.#patcher;
    if (!patcher) return true;
    await this.#csrGate;
    // The arming build this save waited for failed: CSR is off again, and the next request arms it anew.
    if (!this.#csrActive) return false;
    const started = Date.now();
    const marker = path.join(this.#csrBundler.outDir, CSR_DEV_PATCHING_MARKER);
    await Bun.write(marker, String(process.pid));
    try {
      const result = await patcher.update(files, {
        announce: (update) => {
          const now = Date.now();
          BuilderChannel.emit({
            type: "csr-updated",
            data: {
              generation: update.generation,
              mode: "registry",
              reload: update.reload,
              reason: update.reason,
              patchUrl: update.patchUrl,
              changedIds: update.changedIds,
              trace: { ...trace, patchAt: now, sentAt: now },
            },
          });
        },
      });
      if (result.kind === "delegate") {
        this.#logger.verbose(
          `csr-patch handed to a build worker (${this.#links.countDelegation("csr", result.reason)}): ${result.reason}`,
        );
        return true;
      }
      sendBuildStatus("csr", { generation, ok: true, files });
      this.#logger.verbose(
        result.kind === "unchanged"
          ? `csr-patch unchanged (${Date.now() - started}ms)`
          : `csr-patch generation=${result.update.generation} ${result.update.reload ? `reload (${result.update.reason})` : `patch modules=${result.update.changedIds.length}`} (${Date.now() - started}ms)`,
      );
      return false;
    } catch (err) {
      const message = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      if (isCompileError(err)) {
        sendBuildStatus("csr", { generation, ok: false, files, message });
        return false;
      }
      this.#logger.verbose(`csr-patch threw; a build worker takes this save: ${message}`);
      patcher.forget();
      return true;
    } finally {
      await rm(marker, { force: true });
    }
  }

  // On demand: dev serves CSR only via the opt-in `/__csr` and `?csr=true` routes; once built, it rebuilds every save.
  async handleBuildCsr(msg: BuilderCsrReq): Promise<void> {
    if (msg.shell) {
      await this.#buildShell(msg);
      return;
    }
    //? Armed now, not when the build lands: a save handled meanwhile then patches CSR behind #csrGate instead of skipping.
    this.#beginCsrArm();
    this.#csrActive = true;
    const armed = this.#lanes.workQueue.enqueue("build-csr", async (): Promise<void> => {
      const started = Date.now();
      let error: string | undefined;
      try {
        // Not relayed: an on-demand CSR build is request/response, and its error travels in the response.
        const result = await this.#batchRunner.run(
          await this.#links.batchRequest({ generation: this.#links.generation(), needs: ["csr"], changedFiles: [] }),
        );
        error = result.errors.csr;
      } catch (err) {
        error = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      }
      if (error) {
        this.#logger.error(`csr-build failed: ${error}`);
        await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: false, error });
        return;
      }
      this.#csrArmSucceeded = true;
      this.#patcher?.forget();
      this.#logger.info(`csr-build ok on demand (${Date.now() - started}ms); rebuilding CSR on every save now`);
      await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: true });
    });
    this.#csrGate = this.#armingCsr(armed);
    await armed;
  }

  // Asked on every view read and rebuilt only when a save moved the generation or the css it inlines, instead of armed
  // per save: a restarted builder has no last build to trust, and so rebuilds once on the next read.
  async #buildShell(msg: BuilderCsrReq): Promise<void> {
    await this.#lanes.workQueue.enqueue("build-shell", async (): Promise<void> => {
      const generation = this.#links.generation();
      //? A save moves the generation before its css compile lands, so a shell built in between holds the old css.
      const shellKey = `${generation}:${JSON.stringify(this.#links.artifact().cssAssets)}`;
      let error: string | undefined;
      if (this.#shellKey !== shellKey)
        try {
          const result = await this.#batchRunner.run(
            await this.#links.batchRequest({ generation, needs: ["shell"], changedFiles: [] }),
          );
          error = result.errors.shell;
          if (!error) this.#shellKey = shellKey;
        } catch (err) {
          error = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
        }
      await BuilderChannel.send(
        error
          ? { type: "build-csr-res", id: msg.id, ok: false, error }
          : { type: "build-csr-res", id: msg.id, ok: true },
      );
    });
  }

  //? Settled by the last of the arming builds in flight, not by each: two requests that both fail would otherwise leave
  //? CSR on (the second saw the first's optimistic flag as where it started), and the first to finish would let saves
  //? patch CSR first while the second still builds.
  #beginCsrArm(): void {
    if (this.#csrArms === 0) {
      this.#csrWasActive = this.#csrActive;
      this.#csrArmSucceeded = false;
    }
    this.#csrArms += 1;
    this.#csrArming = true;
  }

  #armingCsr(armed: Promise<void>): Promise<void> {
    const settle = () => {
      this.#csrArms -= 1;
      if (this.#csrArms > 0) return;
      this.#csrArming = false;
      this.#csrActive = this.#csrWasActive || this.#csrArmSucceeded;
    };
    return armed.then(settle, settle);
  }

  static #csrArmedByEnv() {
    return process.env.AKAN_DEV_CSR_REBUILD === "1";
  }

  // The env flag carries an armed CSR session across builder restarts, so the replacement rebuilds it after ready.
  async rearmCsrFromEnv(): Promise<void> {
    if (!CsrRegistry.#csrArmedByEnv()) return;
    this.#beginCsrArm();
    this.#csrActive = true;
    //? The env keeps CSR armed whatever this build does, as it did before the builder restarted.
    this.#csrArmSucceeded = true;
    const rearmed = this.#lanes.workQueue.enqueue("build-csr-rearm", async () => {
      //? Relayed, unlike an on-demand build: a rebuild for a metadata save must reach the CSR tabs as their reload.
      const result = await this.#batchRunner.run(
        await this.#links.batchRequest({ generation: this.#links.generation(), needs: ["csr"], changedFiles: [] }),
        (msg) => BuilderChannel.emit(msg),
      );
      this.#patcher?.forget();
      if (result.errors.csr) this.#logger.error(`csr-rearm failed: ${result.errors.csr}`);
      else this.#logger.verbose("csr-rearm ok; this session had CSR armed before the builder restarted");
    });
    this.#csrGate = this.#armingCsr(rearmed);
    await rearmed.catch((err: unknown) =>
      this.#logger.error(
        `csr-rearm failed: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
      ),
    );
  }
}
