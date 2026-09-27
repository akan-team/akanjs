import { describe, expect, test } from "bun:test";
import { compatProblems, type NativeApi, nativeApiHash, runtimeLine } from "../src/lib/compat.ts";

const api = (patch: Partial<NativeApi> = {}): NativeApi => ({
  protocol: 1,
  features: ["doc", "seq", "once"],
  runtime: "0.1",
  platform: "ios",
  plugins: {
    preferences: { decl: { methods: ["get", "set"], events: [] }, version: "0.1.0" },
    clipboard: { decl: "web" },
  },
  acl: null,
  permissions: ["camera"],
  deepLinks: ["myapp"],
  ...patch,
});

describe("native API compatibility (UP-3)", () => {
  test("runtime lines follow semver caret ranges", () => {
    expect(runtimeLine("0.1.4")).toBe("0.1");
    expect(runtimeLine("0.2.0")).toBe("0.2");
    expect(runtimeLine("1.4.2")).toBe("1");
  });

  test("the hash ignores key order but not content", () => {
    const a = api();
    const reordered: NativeApi = {
      deepLinks: ["myapp"],
      permissions: ["camera"],
      acl: null,
      plugins: {
        clipboard: { decl: "web" },
        preferences: { version: "0.1.0", decl: { events: [], methods: ["get", "set"] } },
      },
      platform: "ios",
      runtime: "0.1",
      features: ["doc", "seq", "once"],
      protocol: 1,
    };
    expect(nativeApiHash(reordered)).toBe(nativeApiHash(a));
    expect(nativeApiHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(nativeApiHash(api({ runtime: "0.2" }))).not.toBe(nativeApiHash(a));
  });

  test("says what a web-only update would need from the binary", () => {
    expect(compatProblems(api(), api())).toEqual([]);
    const next = api({
      runtime: "0.2",
      plugins: {
        preferences: { decl: { methods: ["get", "set", "clear"], events: [] }, version: "0.2.0" },
        haptics: { decl: { methods: ["impact"], events: [] }, version: "0.1.0" },
      },
      permissions: ["camera", "location"],
    });
    expect(compatProblems(api(), next)).toEqual([
      "akan-native runtime 0.2 vs 0.1 in the app",
      "plugin clipboard is in the app but not in the bundle",
      "plugin haptics is not in the app",
      "plugin preferences 0.2.0 vs 0.1.0 in the app",
      "plugin preferences is native: get, set, clear in the bundle, native: get, set in the app",
      "permissions [camera, location] vs [camera] in the app",
    ]);
    expect(compatProblems(api(), api({ platform: "android" }))).toEqual(["the bundle is for android, the app is ios"]);
    expect(compatProblems(api(), api({ acl: { grants: [] } }))).toEqual(["capabilities changed"]);
  });
});
