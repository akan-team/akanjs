import { describe, expect, test } from "bun:test";
import { MemoryLimit } from "./memoryLimit";

const withEnv = (values: Record<string, string | undefined>, fn: () => void) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe("MemoryLimit.parsePositiveIntEnv", () => {
  test("accepts positive integers and rejects everything else", () => {
    withEnv({ PROBE: "12" }, () => expect(MemoryLimit.parsePositiveIntEnv("PROBE")).toBe(12));
    withEnv({ PROBE: "0" }, () => expect(MemoryLimit.parsePositiveIntEnv("PROBE")).toBeNull());
    withEnv({ PROBE: "-3" }, () => expect(MemoryLimit.parsePositiveIntEnv("PROBE")).toBeNull());
    withEnv({ PROBE: "many" }, () => expect(MemoryLimit.parsePositiveIntEnv("PROBE")).toBeNull());
    withEnv({ PROBE: undefined }, () => expect(MemoryLimit.parsePositiveIntEnv("PROBE")).toBeNull());
  });
});

describe("MemoryLimit.parseBytesEnv", () => {
  test("reads every accepted unit suffix", () => {
    withEnv({ PROBE: "512" }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBe(512));
    withEnv({ PROBE: "512kb" }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBe(512 * 1024));
    withEnv({ PROBE: " 768MiB " }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBe(768 * 1024 ** 2));
    withEnv({ PROBE: "2GB" }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBe(2 * 1024 ** 3));
  });

  test("rejects malformed values rather than guessing", () => {
    withEnv({ PROBE: "1.5gb" }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBeNull());
    withEnv({ PROBE: "512tb" }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBeNull());
    withEnv({ PROBE: "0mb" }, () => expect(MemoryLimit.parseBytesEnv("PROBE")).toBeNull());
  });
});

describe("MemoryLimit.resolveMaxRssBytes", () => {
  const options = {
    megabytesEnv: "PROBE_MAX_RSS_MB",
    bytesEnv: "PROBE_MAX_RSS",
    limitFraction: 0.5,
    fallbackBytes: 768 * 1024 ** 2,
  };
  const clearAll = { PROBE_MAX_RSS_MB: undefined, PROBE_MAX_RSS: undefined, AKAN_MEMORY_LIMIT: undefined };

  test("prefers the megabyte override over every other source", () => {
    withEnv({ ...clearAll, PROBE_MAX_RSS_MB: "300", PROBE_MAX_RSS: "1gb", AKAN_MEMORY_LIMIT: "8gb" }, () => {
      expect(MemoryLimit.resolveMaxRssBytes(options)).toBe(300 * 1024 ** 2);
    });
  });

  test("falls back to the byte override, then to a fraction of the declared limit", () => {
    withEnv({ ...clearAll, PROBE_MAX_RSS: "900mb", AKAN_MEMORY_LIMIT: "8gb" }, () => {
      expect(MemoryLimit.resolveMaxRssBytes(options)).toBe(900 * 1024 ** 2);
    });
    withEnv({ ...clearAll, AKAN_MEMORY_LIMIT: "8gb" }, () => {
      expect(MemoryLimit.resolveMaxRssBytes(options)).toBe(4 * 1024 ** 3);
    });
  });

  test("uses the caller's fallback when nothing declares a limit", () => {
    // The cgroup files only exist under Linux containers, so on any dev machine this is the path taken.
    withEnv(clearAll, () => {
      const resolved = MemoryLimit.resolveMaxRssBytes(options);
      const cgroupBytes = MemoryLimit.readCgroupBytes();
      expect(resolved).toBe(cgroupBytes ? Math.floor(cgroupBytes * 0.5) : options.fallbackBytes);
    });
  });

  test("a null fallback leaves the process unbounded", () => {
    withEnv(clearAll, () => {
      const resolved = MemoryLimit.resolveMaxRssBytes({ ...options, fallbackBytes: null });
      const cgroupBytes = MemoryLimit.readCgroupBytes();
      expect(resolved).toBe(cgroupBytes ? Math.floor(cgroupBytes * 0.5) : null);
    });
  });
});
