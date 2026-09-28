import os from "node:os";
import { MemoryLimit } from "akanjs/server/memoryLimit";

export interface DevBootBudget {
  memoryBytes: number;
  cores: number;
}

export interface DevBootConcurrencyPlan {
  concurrency: number;
  reason: string;
}

// n apps booting at once are n overlapping builder RSS peaks, which OOM-kills a small container.
// `os.freemem()` is not consulted: it counts free pages, not reclaimable ones, and would pin every machine to one.
export class DevBootConcurrency {
  /**
   * The peak of one app's boot, all of its processes: apps/akan measured 1.76GB (2026-09-28), most of it the build
   * worker (the base build, then the SSR registry's) beside the builder, RSC worker, backend and dev host.
   */
  static readonly perAppBytes = 1_800 * 1024 * 1024;
  /** The other half is the editor, the browser, and whatever else the session was already running. */
  static readonly memoryShare = 0.5;
  /** A dev host is a builder, an RSC worker and a backend, and the boot build is the CPU-hungry one. */
  static readonly coresPerApp = 4;

  static budget(): DevBootBudget {
    const hostBytes = os.totalmem();
    const declaredBytes = MemoryLimit.parseBytesEnv("AKAN_MEMORY_LIMIT") ?? MemoryLimit.readCgroupBytes();
    //? AKAN_MEMORY_LIMIT is per-process, but a session cannot outgrow its container either: take the smaller.
    return { memoryBytes: Math.min(hostBytes, declaredBytes ?? hostBytes), cores: os.availableParallelism() };
  }

  static resolve(
    appCount: number,
    requested: number | null,
    budget: DevBootBudget = DevBootConcurrency.budget(),
  ): DevBootConcurrencyPlan {
    const apps = Math.max(1, Math.trunc(appCount));
    if (requested !== null && Number.isFinite(requested)) {
      const asked = Math.max(1, Math.trunc(requested));
      return { concurrency: Math.min(apps, asked), reason: `--concurrency ${asked}` };
    }
    const byMemory = Math.floor((budget.memoryBytes * DevBootConcurrency.memoryShare) / DevBootConcurrency.perAppBytes);
    const byCores = Math.floor(budget.cores / DevBootConcurrency.coresPerApp);
    return {
      concurrency: Math.max(1, Math.min(apps, byMemory, byCores)),
      reason: `${budget.cores} cores, ${DevBootConcurrency.#formatBytes(budget.memoryBytes)} memory`,
    };
  }

  static describe(appCount: number, plan: DevBootConcurrencyPlan) {
    if (plan.concurrency >= appCount) return `booting all ${appCount} apps at once (${plan.reason})`;
    return `booting ${plan.concurrency} of ${appCount} apps at a time (${plan.reason}) — --concurrency raises it`;
  }

  static #formatBytes(bytes: number) {
    const gigabytes = bytes / 1024 ** 3;
    return gigabytes >= 10 ? `${Math.round(gigabytes)}GB` : `${gigabytes.toFixed(1)}GB`;
  }
}
