import { describe, expect, test } from "bun:test";
import { BunVersionGuard } from "./bunVersionGuard";
import { engines } from "./package.json";

describe("BunVersionGuard", () => {
  test("refuses a Bun older than the package's engines range in one line naming bun upgrade", () => {
    const refusal = BunVersionGuard.refusal("1.4.3", engines.bun);

    expect(refusal).toContain("1.4.3");
    expect(refusal).toContain(engines.bun);
    expect(refusal).toContain("bun upgrade");
    expect(refusal?.split("\n")).toHaveLength(1);
  });

  test("lets the running Bun and a newer one through", () => {
    expect(BunVersionGuard.refusal(Bun.version, engines.bun)).toBeNull();
    expect(BunVersionGuard.refusal("1.5.0", engines.bun)).toBeNull();
  });

  test("judges a canary build by its release", () => {
    expect(BunVersionGuard.refusal("1.4.5-canary.1", engines.bun)).toBeNull();
    expect(BunVersionGuard.refusal("1.4.3-canary.9", engines.bun)).toContain("bun upgrade");
  });
});
