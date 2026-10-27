import { describe, expect, test } from "bun:test";
import { AppWsData } from "./appWsData";

const handshake = (headers: Record<string, string> = {}) =>
  AppWsData.fromRequest(new Request("http://localhost/api/ws", { headers }));

describe("AppWsData", () => {
  test("snapshots only the credential headers from the handshake", () => {
    const data = handshake({
      authorization: "Bearer handshake-token",
      cookie: "jwt=cookie-token; theme=dark",
      "user-agent": "akan-test",
      "x-secret": "should-not-be-kept",
    });

    expect(data.headers.get("authorization")).toBe("Bearer handshake-token");
    expect(data.headers.get("user-agent")).toBe("akan-test");
    expect(data.headers.get("x-secret")).toBeNull();
    expect(data.jar.read("jwt").value).toBe("cookie-token");
    expect(data.cookies.get("jwt")).toBe("cookie-token");
    expect(data.createdAt).toBeGreaterThan(0);
  });

  test("keeps the forwarded set, which is the only record of who connected", () => {
    const data = handshake({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "203.0.113.10, 10.0.0.5",
      "x-forwarded-port": "54321",
      "x-secret": "should-not-be-kept",
    });

    expect(data.ip).toBe("203.0.113.10");
    expect(data.port).toBe(54321);
    expect(data.headers.get("x-secret")).toBeNull();
  });

  test("falls back to the socket peer only when nothing proxied the handshake", () => {
    const data = handshake();
    const peer = { remoteAddress: "::ffff:198.51.100.7" } as Bun.ServerWebSocket<unknown>;

    expect(data.ip).toBeNull();
    expect(data.ipOf(peer)).toBe("198.51.100.7");
  });

  test("mints one socketId per connection and keeps it across a credential swap", () => {
    const data = handshake();
    const other = handshake();
    const { socketId } = data;

    expect(socketId).toBeTruthy();
    expect(other.socketId).not.toBe(socketId);

    AppWsData.applyCredential(data, "next-token");
    AppWsData.applyCredential(data, null);

    expect(data.socketId).toBe(socketId);
  });

  test("replaces the credential and drops the cached account", () => {
    const data = handshake();
    data.account = { role: "user" };

    AppWsData.applyCredential(data, "next-token");

    expect(data.headers.get("authorization")).toBe("Bearer next-token");
    expect(data.account).toBeUndefined();
  });

  test("signing out clears the handshake cookie so it cannot re-authenticate the socket", () => {
    const data = handshake({ authorization: "Bearer handshake-token", cookie: "jwt=cookie-token; theme=dark" });
    data.account = { role: "user" };

    AppWsData.applyCredential(data, null);

    expect(data.headers.get("authorization")).toBeNull();
    expect(data.jar.has("jwt")).toBe(false);
    expect(data.cookies.has("jwt")).toBe(false);
    expect(data.headers.get("cookie")).toBe("theme=dark");
    expect(data.account).toBeUndefined();
  });

  test("signing out clears the app-scoped cookie too, whichever app on the host wrote it", () => {
    const data = handshake({
      cookie: "__Host-jwt:alpha=alpha-token; jwt:alpha=retired-token; jwt:beta=beta-token; theme=dark",
    });

    AppWsData.applyCredential(data, null);

    expect(data.jar.has("__Host-jwt:alpha")).toBe(false);
    expect(data.jar.has("jwt:alpha")).toBe(false);
    expect(data.jar.has("jwt:beta")).toBe(false);
    expect(data.headers.get("cookie")).toBe("theme=dark");
  });

  test("keeps every copy of a duplicated cookie until sign-out drops them all, leaving other values as sent", () => {
    const data = handshake({ cookie: 'jwt:alpha=planted; theme=a%3Bb; jwt:alpha=own; prefs="q"' });

    expect(data.jar.read("jwt:alpha")).toEqual({ count: 2 });

    AppWsData.applyCredential(data, null);

    expect(data.headers.get("cookie")).toBe('theme=a%3Bb; prefs="q"');
    expect(data.jar.read("theme").value).toBe("a;b");
    expect(data.cookies.get("theme")).toBe("a;b");
  });

  test("removes the cookie header entirely when the jwt was its only entry", () => {
    const data = handshake({ cookie: "jwt=cookie-token" });

    AppWsData.applyCredential(data, null);

    expect(data.headers.get("cookie")).toBeNull();
  });
});
