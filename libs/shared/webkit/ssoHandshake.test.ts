import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import { AkanNativeError } from "akanjs/client/native";

const starts: { url: string; callbackScheme: string }[] = [];
let answer: (args: { url: string }) => unknown = () => undefined;
let host: MockHost | null = null;

const shellOn = (platform: "ios" | "macos") => {
  host = installMockHost({
    platform,
    plugins: {
      "auth-session": {
        methods: {
          start: (args: { url: string; callbackScheme: string }) => {
            starts.push(args);
            return answer(args);
          },
        },
      },
    },
  });
};

beforeAll(async () => {
  const base = await import("akanjs/base");
  mock.module("akanjs/base", () => ({
    ...base,
    getEnv: () => ({ side: "client", renderMode: "csr", appName: "shop" }),
    getServerOrigin: () => "https://api.shop.test",
    getApiPrefix: () => "/api",
  }));
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: { lang: "ko" } },
    configurable: true,
  });
});

afterEach(() => {
  host?.uninstall();
  host = null;
  starts.length = 0;
  answer = () => undefined;
});

describe("SsoHandshake.runNative", () => {
  test("signs in through the shell's auth session and hands back the code with its PKCE verifier", async () => {
    const { SsoHandshake } = await import("./ssoHandshake");
    shellOn("ios");
    const handshake = new SsoHandshake("google");
    answer = ({ url }) => ({ url: `shop://sso?code=c-1&state=${new URL(url).searchParams.get("state")}` });

    const callback = await handshake.runNative();

    const start = new URL(starts[0]?.url ?? "");
    expect(starts[0]?.callbackScheme).toBe("shop");
    expect(`${start.origin}${start.pathname}`).toBe("https://api.shop.test/api/user/google");
    expect(Object.fromEntries(start.searchParams)).toEqual({
      callbackScheme: "shop",
      codeChallenge: expect.any(String),
      state: handshake.nonce,
      lang: "ko",
    });
    expect(callback).toEqual({ code: "c-1", verifier: expect.any(String) });
  });

  test("asks a desktop shell to show the provider's page", async () => {
    const { SsoHandshake } = await import("./ssoHandshake");
    shellOn("macos");
    answer = () => ({ url: "shop://sso?code=c-2" });

    expect(await new SsoHandshake("github").runNative()).toEqual({ code: "c-2", verifier: expect.any(String) });
    expect(new URL(starts[0]?.url ?? "").searchParams.get("returnPage")).toBe("1");
  });

  test("takes a dismissed sign-in for no answer, and passes any other failure on", async () => {
    const { SsoHandshake } = await import("./ssoHandshake");
    shellOn("ios");
    answer = () => {
      throw new AkanNativeError("CANCELLED", "closed");
    };
    expect(await new SsoHandshake("google").runNative()).toBeNull();

    answer = () => {
      throw new AkanNativeError("INVALID_ARGS", "unknown scheme");
    };
    await expect(new SsoHandshake("google").runNative()).rejects.toMatchObject({ code: "INVALID_ARGS" });
  });
});
