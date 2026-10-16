import { getEnv } from "akanjs/base";
import type { MachineIdentity, Middleware, SignalContext } from "akanjs/signal";
import { type MachineProof, MachineToken } from "./machineToken";

interface VerifiedMachine {
  authorization: string | null;
  epoch: number;
  proof: MachineProof | null;
}

interface AccountHolder {
  headers?: Headers;
  account?: Record<string, unknown>;
}

//* Registered after every lib middleware, so it reads the account they resolved and has the last word on `machine`:
//* only a verified machine token sets it, and whatever else put one there is taken off, a session's claims included.
export class MachineAccount implements Middleware {
  static readonly refName = "MachineAccount";
  //? A socket presents the same token on every frame, and its verdict holds until the token's expiry or a key change;
  //? revocation is the version a guard compares, which this leaves alone. An EdDSA verify per frame buys nothing.
  static readonly #verifiedBySocket = new WeakMap<object, VerifiedMachine>();

  use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const holder = (
        context.transport === "http" ? context.getHttpContext().req : context.getWebSocketContext().ws.data
      ) as AccountHolder;
      const authorization = holder.headers?.get("authorization") ?? null;
      const machine =
        context.transport === "websocket"
          ? MachineAccount.#verifiedOnSocket(holder, authorization)
          : MachineToken.fromAuthorization(authorization);
      const { machine: _unverified, ...account } = holder.account ?? {};
      if (machine) {
        const { appName, environment } = getEnv();
        holder.account = { ...(holder.account ? account : { appName, environment }), machine };
      } else if (holder.account && "machine" in holder.account) holder.account = account;
      return await next();
    };
  }

  static #verifiedOnSocket(socket: object, authorization: string | null): MachineIdentity | null {
    const epoch = MachineToken.keyEpoch();
    const verified = MachineAccount.#verifiedBySocket.get(socket);
    const reusable =
      verified?.authorization === authorization &&
      verified.epoch === epoch &&
      (verified.proof?.expiresAt === undefined || verified.proof.expiresAt > Date.now() / 1000);
    if (verified && reusable) return verified.proof?.identity ?? null;
    const proof = MachineToken.proofOf(authorization);
    MachineAccount.#verifiedBySocket.set(socket, { authorization, epoch, proof });
    return proof?.identity ?? null;
  }
}
