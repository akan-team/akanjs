import { describe, expect, test } from "bun:test";
import { isPortInUseError } from "./portInUse";

describe("isPortInUseError", () => {
  test("detects the EADDRINUSE error code", () => {
    expect(isPortInUseError(Object.assign(new Error("listen failed"), { code: "EADDRINUSE" }))).toBe(true);
  });

  test("detects Bun's message-only shape", () => {
    expect(isPortInUseError(new Error("Failed to start server. Is port 8282 in use?"))).toBe(true);
    expect(isPortInUseError(new Error("bind EADDRINUSE 127.0.0.1:8282"))).toBe(true);
  });

  test("rejects unrelated errors and non-objects", () => {
    expect(isPortInUseError(new Error("connection refused"))).toBe(false);
    expect(isPortInUseError(null)).toBe(false);
    expect(isPortInUseError(undefined)).toBe(false);
    expect(isPortInUseError("EADDRINUSE")).toBe(false);
  });
});
