import { afterEach, describe, expect, test } from "bun:test";
import { authTokenKey, websocketCredentialContract } from "akanjs/common";
import type { WebsocketAdaptor, WsCredentialClaims } from "akanjs/service";
import { AppWsData } from "./appWsData";
import { WsCredentialRevocation } from "./wsCredentialRevocation";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "alpha",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_OPERATION_MODE: "local",
});

const jwtOf = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;

const tracked: Bun.ServerWebSocket<unknown>[] = [];

const socketWith = (headers: Record<string, string> = {}) => {
  const closes: [number, string][] = [];
  const data = AppWsData.fromRequest(new Request("http://localhost/api/ws", { headers }));
  const ws = {
    data,
    close: (code: number, reason: string) => closes.push([code, reason]),
  } as unknown as Bun.ServerWebSocket<unknown>;
  WsCredentialRevocation.track(ws);
  tracked.push(ws);
  return { ws, data, closes };
};

const bearer = (claims: Record<string, unknown>) => socketWith({ authorization: `Bearer ${jwtOf(claims)}` });

const otherServers = () => {
  const published: WsCredentialClaims[] = [];
  let deliver: (claims: WsCredentialClaims) => void = () => {};
  const websocket = {
    publishRevocation: (claims: WsCredentialClaims) => published.push(claims),
    onRevocation: (handler: (claims: WsCredentialClaims) => void) => {
      deliver = handler;
    },
  } as unknown as WebsocketAdaptor;
  WsCredentialRevocation.use(websocket);
  return { published, deliver: (claims: WsCredentialClaims) => deliver(claims) };
};

const revoked: [number, string][] = [
  [websocketCredentialContract.expiredCode, websocketCredentialContract.revokedReason],
];

afterEach(() => {
  for (const ws of tracked.splice(0)) WsCredentialRevocation.untrack(ws);
});

describe("WsCredentialRevocation", () => {
  test("closes each socket whose credential carries a revoked value under any named claim, and leaves the rest", () => {
    const { published } = otherServers();
    const revokedSid = bearer({ sid: "s-1" });
    const revokedMe = bearer({ selfSid: "s-2", meSid: "s-1" });
    const cookie = socketWith({ cookie: `${authTokenKey()}=${jwtOf({ sid: "s-1" })}` });
    const otherSession = bearer({ sid: "s-2", selfSid: "s-3" });
    const sameValueOtherClaim = bearer({ sub: "s-1" });
    const anonymous = socketWith();
    const malformed = socketWith({ authorization: "Bearer not-a-jwt" });

    WsCredentialRevocation.revoke({ sid: ["s-1"], selfSid: ["s-1"], meSid: ["s-1"] });

    expect([revokedSid.closes, revokedMe.closes, cookie.closes]).toEqual([revoked, revoked, revoked]);
    expect([otherSession, sameValueOtherClaim, anonymous, malformed].flatMap(({ closes }) => closes)).toEqual([]);
    expect(published).toEqual([{ sid: ["s-1"], selfSid: ["s-1"], meSid: ["s-1"] }]);
  });

  test("closes this server's sockets for a revocation another server published, without publishing it again", () => {
    const { published, deliver } = otherServers();
    const holder = bearer({ sid: "s-1" });
    const other = bearer({ sid: "s-2" });

    deliver({ sid: ["s-1"] });

    expect(holder.closes).toEqual(revoked);
    expect(other.closes).toEqual([]);
    expect(published).toEqual([]);
  });

  test("matches the credential `__auth` swapped in, and leaves a closed socket and an empty revocation alone", () => {
    const { published } = otherServers();
    const renewedAway = bearer({ sid: "s-1" });
    AppWsData.applyCredential(renewedAway.data, jwtOf({ sid: "s-2" }));
    const renewedInto = bearer({ sid: "s-2" });
    AppWsData.applyCredential(renewedInto.data, jwtOf({ sid: "s-1" }));
    const closed = bearer({ sid: "s-1" });
    WsCredentialRevocation.untrack(closed.ws);

    WsCredentialRevocation.revoke({ sid: [] });
    expect(published).toEqual([]);
    WsCredentialRevocation.revoke({ sid: ["s-1"] });

    expect([renewedAway.closes, renewedInto.closes, closed.closes]).toEqual([[], revoked, []]);
  });
});
