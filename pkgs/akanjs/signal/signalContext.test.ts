import { afterEach, describe, expect, test } from "bun:test";
import { TrustedProxy } from "akanjs/common";

import { buildEndpoint } from "./endpointInfo";
import { SignalContext } from "./signalContext";

const req = new Request("http://akan-child/api/user/google");

const contextOf = (request: Request | { ws: unknown; data: unknown[]; eventType: string }, type = "query") =>
  new SignalContext("contextKey", request as never, {
    endpointInfo: (type === "query" ? buildEndpoint.query(String) : buildEndpoint.message(String)).exec(() => "ok"),
    adaptor: {} as never,
    registry: {} as never,
    env: {} as never,
    live: {} as never,
    middleware: new Map(),
  });

afterEach(() => {
  SignalContext.setHttpPeerResolver(null);
  TrustedProxy.reset();
});

describe("SignalContext.isTrustedHop", () => {
  test("trusts nobody when no peer resolver is installed", () => {
    expect(SignalContext.isTrustedHop(req)).toBe(false);
  });

  test("trusts a unix socket and a peer the trusted proxy list covers, never a public peer", () => {
    SignalContext.setHttpPeerResolver(() => null);
    expect(SignalContext.isTrustedHop(req)).toBe(true);

    SignalContext.setHttpPeerResolver(() => ({ address: "10.0.0.2", port: 50_000 }));
    expect(SignalContext.isTrustedHop(req)).toBe(true);

    SignalContext.setHttpPeerResolver(() => ({ address: "203.0.113.9", port: 50_000 }));
    expect(SignalContext.isTrustedHop(req)).toBe(false);
    TrustedProxy.configure("203.0.113.0/24");
    expect(SignalContext.isTrustedHop(req)).toBe(true);
  });

  test("a rebuilt request, which no socket answers for, keeps the trust its original had", () => {
    const original = new Request("http://app.example/api/x", { headers: { "x-forwarded-host": "evil.example" } });
    const rebuilt = new Request("http://app.example/api/y", { headers: original.headers });
    SignalContext.setHttpPeerResolver((request) =>
      request === original ? { address: "198.51.100.7", port: 1 } : undefined,
    );

    expect(SignalContext.isTrustedHop(rebuilt)).toBe(false);
    expect(SignalContext.clientIpOf(rebuilt)).toBeNull();
    SignalContext.carryClientIp(rebuilt, original);
    expect(SignalContext.isTrustedHop(rebuilt)).toBe(false);
    expect(SignalContext.clientIpOf(rebuilt)).toBe("198.51.100.7");

    const again = new Request("http://app.example/api/z", { headers: rebuilt.headers });
    SignalContext.carryClientIp(again, rebuilt);
    expect(SignalContext.isTrustedHop(again)).toBe(false);

    const viaIngress = new Request("http://app.example/api/x");
    const rewritten = new Request("http://app.example/api/y");
    SignalContext.setHttpPeerResolver((request) => (request === viaIngress ? { address: "10.0.0.2", port: 1 } : null));
    SignalContext.carryClientIp(rewritten, viaIngress);
    expect(SignalContext.isTrustedHop(rewritten)).toBe(true);
  });
});

describe("SignalContext.getClientPort", () => {
  const forwarded = () => new Request("http://app.example/api/x", { headers: { "x-forwarded-port": "443" } });

  test("reads x-forwarded-port only from a trusted hop, else the socket's own port", () => {
    SignalContext.setHttpPeerResolver(() => ({ address: "198.51.100.7", port: 40_000 }));
    expect(contextOf(forwarded()).getClientPort()).toBe(40_000);

    SignalContext.setHttpPeerResolver(() => ({ address: "10.0.0.2", port: 40_000 }));
    expect(contextOf(forwarded()).getClientPort()).toBe(443);

    SignalContext.setHttpPeerResolver(() => null);
    expect(contextOf(forwarded()).getClientPort()).toBe(443);
  });

  test("does not read the port off a rebuilt request whose original came from an untrusted peer", () => {
    const original = forwarded();
    const rebuilt = new Request("http://app.example/api/y", { headers: original.headers });
    SignalContext.setHttpPeerResolver((request) =>
      request === original ? { address: "198.51.100.7", port: 1 } : null,
    );
    SignalContext.carryClientIp(rebuilt, original);
    expect(contextOf(rebuilt).getClientPort()).toBeNull();
  });

  test("reads a socket's recorded port only when its peer is trusted", () => {
    const socketOf = (remoteAddress: string) => ({
      ws: { remoteAddress, data: { headers: new Headers({ "x-forwarded-port": "443" }) } },
      data: [],
      eventType: "message",
    });
    expect(contextOf(socketOf("127.0.0.1"), "message").getClientPort()).toBe(443);
    expect(contextOf(socketOf("198.51.100.7"), "message").getClientPort()).toBeNull();
  });
});
