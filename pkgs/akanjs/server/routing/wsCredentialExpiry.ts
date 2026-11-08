import { websocketCredentialContract } from "akanjs/common";
import { AppWsData } from "./appWsData";

//? A setTimeout past 2^31-1 ms fires at once, so a later expiry re-arms at that horizon.
const MAX_TIMER_MS = 2 ** 31 - 1;

export class WsCredentialExpiry {
  static readonly #timers = new WeakMap<Bun.ServerWebSocket<unknown>, ReturnType<typeof setTimeout>>();

  static watch(ws: Bun.ServerWebSocket<unknown>) {
    WsCredentialExpiry.unwatch(ws);
    const expiresAt = AppWsData.of(ws).credentialExpiresAt();
    const delay = expiresAt === null ? 0 : expiresAt - Date.now();
    //? An expired credential reads as anonymous to the account middleware; closing on it would loop the reconnect.
    if (delay <= 0) return;
    const timer = setTimeout(
      () => {
        WsCredentialExpiry.#timers.delete(ws);
        if (delay > MAX_TIMER_MS) WsCredentialExpiry.watch(ws);
        else ws.close(websocketCredentialContract.expiredCode, websocketCredentialContract.expiredReason);
      },
      Math.min(delay, MAX_TIMER_MS),
    );
    timer.unref?.();
    WsCredentialExpiry.#timers.set(ws, timer);
  }

  static unwatch(ws: Bun.ServerWebSocket<unknown>) {
    const timer = WsCredentialExpiry.#timers.get(ws);
    if (timer) clearTimeout(timer);
    WsCredentialExpiry.#timers.delete(ws);
  }
}
