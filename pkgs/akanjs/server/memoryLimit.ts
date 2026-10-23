import fs from "node:fs";
import os from "node:os";

// Its own module: `akanjs/server` and the devkit dev host both need it without importing each other's stack.
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
    // Bun reads this process's cgroup, which the paths below miss under cgroupns=host; with no limit it returns total RAM.
    const constrained = process.constrainedMemory() ?? 0;
    if (constrained > 0 && constrained < os.totalmem()) return constrained;
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

  /** Order: MiB env, byte env, `limitFraction` of the container limit, then `fallbackBytes` (`null` = unbounded). */
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
