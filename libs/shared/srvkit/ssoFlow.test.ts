import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as base from "akanjs/base";
import { AppHosts } from "akanjs/common";
import { OAuthPkce } from "akanjs/server";

import { SsoFlow, type SsoFlowService } from "./ssoFlow";
import { SsoProvider } from "./ssoProvider";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const origin = "https://app.example.com";
const stateCookie = "__Host-ssoState";
SsoProvider.configure({ google: { clientID: "google-client", clientSecret: "google-secret" } });

const serviceOf = (overrides: Partial<SsoFlowService> = {}): SsoFlowService => ({
  startNativeSso: async () => "native-state",
  takeNativeSso: async () => null,
  handOffNativeSso: async () => ({ code: "native-code" }),
  handleSsoCallback: async () => ({ cookie: { session: "jwt" }, redirect: "/home" }),
  ...overrides,
});

const requestOf = (url: string, cookie = "") =>
  new Request(url, { headers: cookie ? { cookie } : {} }) as unknown as Bun.BunRequest;
const locationOf = (response: Response) => new URL(response.headers.get("location") ?? "", origin);
const redirectUriOf = (response: Response) => locationOf(response).searchParams.get("redirect_uri");

describe("SsoFlow", () => {
  AppHosts.declare(["app.example.com"]);

  beforeEach(() => {
    spyOn(base, "getEnv").mockReturnValue({ ...base.getEnv(), operationMode: "cloud" });
  });

  afterEach(() => {
    mock.restore();
  });

  test("a web start binds a fresh state to the browser with an HttpOnly cookie", async () => {
    const response = await SsoFlow.start("google", requestOf(`${origin}/api/user/google`), serviceOf());
    const state = locationOf(response).searchParams.get("state");
    expect(state).toBeTruthy();
    const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${stateCookie}=`));
    expect(setCookie).toContain(`${stateCookie}=${state}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Domain=");
  });

  test("the provider's redirect_uri is the request's own origin, never the ssoOrigin cookie", async () => {
    const response = await SsoFlow.start(
      "google",
      requestOf(`${origin}/api/user/google`, "ssoOrigin=https://attacker.example"),
      serviceOf(),
    );
    expect(redirectUriOf(response)).toBe(`${origin}/api/user/google/callback`);
  });

  test("a start on a host the app does not declare is refused, web or native", async () => {
    const challenge = OAuthPkce.challengeOf("v".repeat(64));
    let isNativeStarted = false;
    const service = serviceOf({
      startNativeSso: async () => {
        isNativeStarted = true;
        return "native-state";
      },
    });
    for (const url of [
      "https://evil.example/api/user/google",
      `https://evil.example/api/user/google?callbackScheme=angelo&codeChallenge=${challenge}&state=abc`,
    ])
      await expect(SsoFlow.start("google", requestOf(url), service)).rejects.toThrow("shared.error.invalidSsoOrigin");
    expect(isNativeStarted).toBe(false);
  });

  test("the service's configured host counts as the app's own", async () => {
    const response = await SsoFlow.start(
      "google",
      requestOf("https://login.example.com/api/user/google"),
      serviceOf({ host: "login.example.com" }),
    );
    expect(redirectUriOf(response)).toBe("https://login.example.com/api/user/google/callback");
  });

  test("a native start hands the provider and the service the same validated origin", async () => {
    const challenge = OAuthPkce.challengeOf("v".repeat(64));
    let started: { origin: string } | undefined;
    const response = await SsoFlow.start(
      "google",
      requestOf(`${origin}/api/user/google?callbackScheme=angelo&codeChallenge=${challenge}&state=abc`),
      serviceOf({
        startNativeSso: async (_type, start) => {
          started = start;
          return "native-state";
        },
      }),
    );
    expect(started?.origin).toBe(origin);
    expect(redirectUriOf(response)).toBe(`${origin}/api/user/google/callback`);
  });

  test("a callback whose state is not this browser's never reaches the provider", async () => {
    const identify = spyOn(SsoProvider, "identify");
    const response = await SsoFlow.callback(
      "google",
      requestOf(
        `${origin}/api/user/google/callback?code=attacker&state=attacker`,
        `${stateCookie}=mine; errorRedirect=%2Ferror`,
      ),
      serviceOf(),
    );
    expect(identify).not.toHaveBeenCalled();
    expect(locationOf(response).pathname).toBe("/error");
    expect(locationOf(response).searchParams.get("error")).toBe("user.error.ssoStateMismatch");
  });

  test("a state cookie outside `__Host-`, or sent twice, is no state", async () => {
    const identify = spyOn(SsoProvider, "identify");
    for (const cookie of ["ssoState=mine", `${stateCookie}=mine; ${stateCookie}=mine`]) {
      const response = await SsoFlow.callback(
        "google",
        requestOf(`${origin}/api/user/google/callback?code=c&state=mine`, cookie),
        serviceOf(),
      );
      expect(locationOf(response).searchParams.get("error")).toBe("user.error.ssoStateMismatch");
    }
    expect(identify).not.toHaveBeenCalled();
  });

  test("a matching state signs in through the request's own origin and clears the state cookie", async () => {
    const identify = spyOn(SsoProvider, "identify").mockResolvedValue({
      accountId: "ann@example.com",
      nickname: "Ann",
    });
    let hints: unknown;
    const response = await SsoFlow.callback(
      "google",
      requestOf(
        `${origin}/api/user/google/callback?code=c&state=mine`,
        `${stateCookie}=mine; ssoOrigin=https://attacker.example; ssoFor=admin; adminRedirect=%2Fa; adminRedirect=%2Fb`,
      ),
      serviceOf({
        handleSsoCallback: async (_identity, _type, cookie) => {
          hints = cookie;
          return { cookie: { session: "jwt" }, redirect: "/home" };
        },
      }),
    );
    expect(identify).toHaveBeenCalledWith("google", "c", origin);
    expect(hints).toEqual({
      ssoFor: "admin",
      signupToken: undefined,
      signinRedirect: "",
      signupRedirect: "",
      adminRedirect: undefined,
      errorRedirect: undefined,
    });
    expect(locationOf(response).pathname).toBe("/home");
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${stateCookie}=;`))).toBe(true);
  });

  test("the sign-up token is read from its `__Host-` name only", async () => {
    spyOn(SsoProvider, "identify").mockResolvedValue({ accountId: "ann@example.com", nickname: "Ann" });
    const hintsFor = async (cookie: string) => {
      let signupToken: string | undefined;
      await SsoFlow.callback(
        "google",
        requestOf(`${origin}/api/user/google/callback?code=c&state=mine`, `${stateCookie}=mine; ${cookie}`),
        serviceOf({
          handleSsoCallback: async (_identity, _type, hints) => {
            signupToken = hints.signupToken;
            return { redirect: "/signup" };
          },
        }),
      );
      return signupToken;
    };
    expect(await hintsFor("__Host-signupToken=mine")).toBe("mine");
    expect(await hintsFor("signupToken=planted")).toBeUndefined();
    expect(await hintsFor("__Host-signupToken=mine; __Host-signupToken=planted")).toBeUndefined();
  });

  test("a callback on a host the app does not declare fails before the provider", async () => {
    const identify = spyOn(SsoProvider, "identify");
    const response = await SsoFlow.callback(
      "google",
      requestOf("https://evil.example/api/user/google/callback?code=c&state=mine", `${stateCookie}=mine`),
      serviceOf(),
    );
    expect(identify).not.toHaveBeenCalled();
    expect(locationOf(response).searchParams.get("error")).toBe("shared.error.invalidSsoOrigin");
  });

  test("an off-site error redirect falls back to this site, and the error is a key, not the provider's message", async () => {
    spyOn(SsoProvider, "identify").mockRejectedValue(new Error("upstream said something long"));
    const response = await SsoFlow.callback(
      "google",
      requestOf(
        `${origin}/api/user/google/callback?code=c&state=mine`,
        `${stateCookie}=mine; errorRedirect=%2F%2Fevil.example`,
      ),
      serviceOf(),
    );
    expect(locationOf(response).origin).toBe(origin);
    expect(locationOf(response).searchParams.get("error")).toBe("user.error.ssoProviderFailed");
  });
});
