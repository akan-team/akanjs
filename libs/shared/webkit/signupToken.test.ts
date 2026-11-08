import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import * as base from "akanjs/base";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const jar = new Map<string, string>();

beforeAll(() => {
  mock.module("akanjs/client", () => ({
    getCookie: (key: string) => jar.get(key),
    setCookie: (key: string, value: string) => {
      jar.set(key, value);
    },
    removeCookie: (key: string) => {
      jar.delete(key);
    },
  }));
});

afterEach(() => {
  jar.clear();
});

const inMode = (operationMode: "local" | "cloud", renderMode: "csr" | "ssr" = "csr") =>
  spyOn(base, "getEnv").mockReturnValue({ ...base.getEnv(), operationMode, side: "client", renderMode });

describe("signup token keeping", () => {
  test("keeps the token under `__Host-signupToken` outside local, and drops it from there", async () => {
    const { clearSignupToken, loadSignupToken, saveSignupToken } = await import("./signupToken");
    const getEnv = inMode("cloud");
    try {
      jar.set("signupToken", "planted");
      expect(loadSignupToken()).toBe("");
      saveSignupToken("mine");
      expect(jar.get("__Host-signupToken")).toBe("mine");
      expect(loadSignupToken()).toBe("mine");
      clearSignupToken();
      expect(jar.has("__Host-signupToken")).toBe(false);
    } finally {
      getEnv.mockRestore();
    }
  });

  test("an SSR page leaves the token to the HttpOnly cookie its answer set", async () => {
    const { loadSignupToken, saveSignupToken } = await import("./signupToken");
    const getEnv = inMode("cloud", "ssr");
    try {
      saveSignupToken("mine");
      expect(jar.size).toBe(0);
      expect(loadSignupToken()).toBe("");
    } finally {
      getEnv.mockRestore();
    }
  });

  test("keeps the plain name on a local server, which cannot hold a Secure cookie", async () => {
    const { loadSignupToken, saveSignupToken } = await import("./signupToken");
    const getEnv = inMode("local");
    try {
      saveSignupToken("mine");
      expect([...jar.keys()]).toEqual(["signupToken"]);
      expect(loadSignupToken()).toBe("mine");
    } finally {
      getEnv.mockRestore();
    }
  });
});
