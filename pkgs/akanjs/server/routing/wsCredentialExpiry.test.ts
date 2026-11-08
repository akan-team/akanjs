import { describe, expect, test } from "bun:test";
import { websocketCredentialContract } from "akanjs/common";
import { AppWsData } from "./appWsData";
import { WsCredentialExpiry } from "./wsCredentialExpiry";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "alpha",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_OPERATION_MODE: "local",
});

const jwtExpiringIn = (ms: number) =>
  `header.${Buffer.from(JSON.stringify({ exp: (Date.now() + ms) / 1000 })).toString("base64url")}.signature`;

const socketWith = (authorization?: string) => {
  const closes: [number, string][] = [];
  const data = AppWsData.fromRequest(
    new Request("http://localhost/api/ws", { headers: authorization ? { authorization } : {} }),
  );
  const ws = {
    data,
    close: (code: number, reason: string) => closes.push([code, reason]),
  } as unknown as Bun.ServerWebSocket<unknown>;
  return { ws, data, closes };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("WsCredentialExpiry", () => {
  test("closes a socket when the credential it carries expires, with the code the client renews on", async () => {
    const { ws, closes } = socketWith(`Bearer ${jwtExpiringIn(30)}`);
    WsCredentialExpiry.watch(ws);
    await sleep(10);
    expect(closes).toEqual([]);
    await sleep(60);
    expect(closes).toEqual([[websocketCredentialContract.expiredCode, websocketCredentialContract.expiredReason]]);
  });

  test("leaves alone a socket with no credential, an expired one, or one that closed first", async () => {
    const anonymous = socketWith();
    const expired = socketWith(`Bearer ${jwtExpiringIn(-1_000)}`);
    const closed = socketWith(`Bearer ${jwtExpiringIn(20)}`);
    for (const { ws } of [anonymous, expired, closed]) WsCredentialExpiry.watch(ws);
    WsCredentialExpiry.unwatch(closed.ws);
    await sleep(50);
    expect([...anonymous.closes, ...expired.closes, ...closed.closes]).toEqual([]);
  });

  test("times the close from the credential `__auth` swapped in, and drops it on a sign-out", async () => {
    const renewed = socketWith(`Bearer ${jwtExpiringIn(20)}`);
    WsCredentialExpiry.watch(renewed.ws);
    AppWsData.applyCredential(renewed.data, jwtExpiringIn(60_000));
    WsCredentialExpiry.watch(renewed.ws);

    const signedOut = socketWith(`Bearer ${jwtExpiringIn(20)}`);
    WsCredentialExpiry.watch(signedOut.ws);
    AppWsData.applyCredential(signedOut.data, null);
    WsCredentialExpiry.watch(signedOut.ws);

    await sleep(50);
    expect([...renewed.closes, ...signedOut.closes]).toEqual([]);
    WsCredentialExpiry.unwatch(renewed.ws);
  });
});
