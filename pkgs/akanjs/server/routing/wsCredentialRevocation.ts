import { decodeJwtPayload, websocketCredentialContract } from "akanjs/common";
import type { WebsocketAdaptor, WsCredentialClaims } from "akanjs/service";
import { AppWsData } from "./appWsData";

export class WsCredentialRevocation {
  static readonly #sockets = new Set<Bun.ServerWebSocket<unknown>>();
  static #websocket: WebsocketAdaptor | null = null;

  static use(websocket: WebsocketAdaptor) {
    WsCredentialRevocation.#websocket = websocket;
    websocket.onRevocation?.((claims) => WsCredentialRevocation.#closeMatching(claims));
  }

  static track(ws: Bun.ServerWebSocket<unknown>) {
    WsCredentialRevocation.#sockets.add(ws);
  }

  static untrack(ws: Bun.ServerWebSocket<unknown>) {
    WsCredentialRevocation.#sockets.delete(ws);
  }

  /**
   * Closes, on every server of the app, each socket whose credential carries one of the values under one of the
   * claims, with the code a client renews and reconnects on. Its frames already answer to the account middleware;
   * what this ends is the broadcasts to the rooms it joined before.
   */
  static revoke(claims: WsCredentialClaims) {
    if (!Object.values(claims).some((values) => values.length)) return;
    WsCredentialRevocation.#closeMatching(claims);
    WsCredentialRevocation.#websocket?.publishRevocation?.(claims);
  }

  //? Read unverified: a forged token's claims can only close the socket that presents it.
  static #closeMatching(claims: WsCredentialClaims) {
    const revoked = Object.entries(claims).map(([claim, values]) => [claim, new Set(values)] as const);
    for (const ws of WsCredentialRevocation.#sockets) {
      const token = AppWsData.of(ws).credentialToken();
      const payload = token ? WsCredentialRevocation.#payloadOf(token) : null;
      if (!payload) continue;
      const matches = revoked.some(([claim, values]) => {
        const value = payload[claim];
        return typeof value === "string" && values.has(value);
      });
      if (matches) ws.close(websocketCredentialContract.expiredCode, websocketCredentialContract.revokedReason);
    }
  }

  static #payloadOf(token: string): Record<string, unknown> | null {
    try {
      const payload = decodeJwtPayload<unknown>(token);
      return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
