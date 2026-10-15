import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { SsoFlow, type SsoFlowService } from "./ssoFlow";
import { SsoProvider } from "./ssoProvider";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const origin = "https://app.example.com";
SsoProvider.configure({ google: { clientID: "google-client", clientSecret: "google-secret" } });

const serviceOf = (overrides: Partial<SsoFlowService> = {}): SsoFlowService => ({
  startNativeSso: async () => "native-state",
  takeNativeSso: async () => null,
  handOffNativeSso: async () => ({ code: "native-code" }),
  handleSsoCallback: async () => ({ cookie: { session: "jwt" }, redirect: "/home" }),
  ...overrides,
});

const requestOf = (url: string, cookies: Record<string, string> = {}) => {
  const req = new Request(url) as unknown as Bun.BunRequest;
  const jar = new Map(Object.entries(cookies));
  Object.assign(req, {
    cookies: { get: (key: string) => jar.get(key) ?? null, toJSON: () => Object.fromEntries(jar) },
  });
  return req;
};
const locationOf = (response: Response) => new URL(response.headers.get("location") ?? "", origin);

describe("SsoFlow", () => {
  afterEach(() => {
    spyOn(SsoProvider, "identify").mockRestore();
  });

  test("a web start binds a fresh state to the browser with an HttpOnly cookie", async () => {
    const response = await SsoFlow.start(
      "google",
      requestOf(`${origin}/api/user/google`, { ssoOrigin: origin }),
      serviceOf(),
    );
    const state = locationOf(response).searchParams.get("state");
    expect(state).toBeTruthy();
    const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith("ssoState="));
    expect(setCookie).toContain(`ssoState=${state}`);
    expect(setCookie).toContain("HttpOnly");
  });

  test("a callback whose state is not this browser's never reaches the provider", async () => {
    const identify = spyOn(SsoProvider, "identify");
    const response = await SsoFlow.callback(
      "google",
      requestOf(`${origin}/api/user/google/callback?code=attacker&state=attacker`, {
        ssoOrigin: origin,
        ssoState: "mine",
        errorRedirect: "/error",
      }),
      serviceOf(),
    );
    expect(identify).not.toHaveBeenCalled();
    expect(locationOf(response).pathname).toBe("/error");
    expect(locationOf(response).searchParams.get("error")).toBe("user.error.ssoStateMismatch");
  });

  test("a matching state signs in and clears the state cookie", async () => {
    spyOn(SsoProvider, "identify").mockResolvedValue({ accountId: "ann@example.com", nickname: "Ann" });
    const response = await SsoFlow.callback(
      "google",
      requestOf(`${origin}/api/user/google/callback?code=c&state=mine`, { ssoOrigin: origin, ssoState: "mine" }),
      serviceOf(),
    );
    expect(locationOf(response).pathname).toBe("/home");
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("ssoState=;"))).toBe(true);
  });

  test("an off-site error redirect falls back to this site, and the error is a key, not the provider's message", async () => {
    spyOn(SsoProvider, "identify").mockRejectedValue(new Error("upstream said something long"));
    const response = await SsoFlow.callback(
      "google",
      requestOf(`${origin}/api/user/google/callback?code=c&state=mine`, {
        ssoOrigin: origin,
        ssoState: "mine",
        errorRedirect: "//evil.example",
      }),
      serviceOf(),
    );
    expect(locationOf(response).origin).toBe(origin);
    expect(locationOf(response).searchParams.get("error")).toBe("user.error.ssoProviderFailed");
  });
});
