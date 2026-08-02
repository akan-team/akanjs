import fs from "node:fs";

/**
 * Where a process's RSS ceiling comes from, shared by every host that recycles a child to bound it.
 *
 * A budget can be declared explicitly, discovered from the container, or absent altogether, so each
 * host asks for a fraction of whatever limit it can find and supplies its own fallback for the last
 * case. Kept as its own module rather than living on a host class because both `akanjs/server` and
 * the dev host in `@akanjs/devkit` need it, and neither should import the other's stack to get it.
 */
export class MemoryLimit {
  static readonly #cgroupLimitFiles = ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"];
  /** Host-level cgroup files report effectively-unlimited sentinels; anything this large means "no limit". */
  static readonly #unlimitedSentinelBytes = 1024 ** 5;

  static parsePositiveIntEnv(name: string): number | null {
    const parsed = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  /** Reads a byte count with an optional unit suffix, e.g. `512mb`, `2GiB`, `1073741824`. */
  static parseBytesEnv(name: string): number | null {
    const value = process.env[name];
    if (!value) return null;
    const match = /^(\d+)(b|kb|kib|mb|mib|gb|gib)?$/i.exec(value.trim());
    if (!match) return null;
    const amount = Number.parseInt(match[1] ?? "", 10);
    const unit = (match[2] ?? "b").toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (unit === "gb" || unit === "gib") return amount * 1024 * 1024 * 1024;
    if (unit === "mb" || unit === "mib") return amount * 1024 * 1024;
    if (unit === "kb" || unit === "kib") return amount * 1024;
    return amount;
  }

  static readCgroupBytes(): number | null {
    for (const filePath of MemoryLimit.#cgroupLimitFiles) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw || raw === "max") continue;
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed < MemoryLimit.#unlimitedSentinelBytes) return parsed;
      } catch {
        // cgroup files are best-effort; explicit env thresholds still work.
      }
    }
    return null;
  }

  /**
   * Resolves a ceiling from, in order: an explicit MiB env, an explicit byte env, a fraction of the
   * container's memory limit, and finally the caller's fallback (`null` to leave the process
   * unbounded).
   */
  static resolveMaxRssBytes({
    megabytesEnv,
    bytesEnv,
    limitFraction,
    fallbackBytes,
  }: {
    megabytesEnv: string;
    bytesEnv: string;
    limitFraction: number;
    fallbackBytes: number | null;
  }): number | null {
    const explicitMb = MemoryLimit.parsePositiveIntEnv(megabytesEnv);
    if (explicitMb) return explicitMb * 1024 * 1024;

    const explicitBytes = MemoryLimit.parseBytesEnv(bytesEnv);
    if (explicitBytes) return explicitBytes;

    const memoryLimitBytes = MemoryLimit.parseBytesEnv("AKAN_MEMORY_LIMIT") ?? MemoryLimit.readCgroupBytes();
    if (memoryLimitBytes) return Math.floor(memoryLimitBytes * limitFraction);

    return fallbackBytes;
  }
}
