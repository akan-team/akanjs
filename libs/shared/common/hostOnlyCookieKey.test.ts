import { describe, expect, spyOn, test } from "bun:test";
import * as base from "akanjs/base";

import { hostOnlyCookieKey } from "./hostOnlyCookieKey";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

describe("hostOnlyCookieKey", () => {
  test("takes the `__Host-` prefix everywhere but local", () => {
    const env = base.getEnv();
    const getEnv = spyOn(base, "getEnv").mockReturnValue({ ...env, operationMode: "local" });
    try {
      expect(hostOnlyCookieKey("ssoState")).toBe("ssoState");
      for (const operationMode of ["edge", "cloud", "module"] as const) {
        getEnv.mockReturnValue({ ...env, operationMode });
        expect(hostOnlyCookieKey("signupToken")).toBe("__Host-signupToken");
      }
    } finally {
      getEnv.mockRestore();
    }
  });
});
