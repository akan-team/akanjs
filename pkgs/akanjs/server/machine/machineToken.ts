import { createPublicKey, type KeyObject } from "node:crypto";
import { getEnv } from "akanjs/base";
import { bearerTokenOf, Logger } from "akanjs/common";
import type { MachineIdentity } from "akanjs/signal";
import { Ed25519Key } from "../ed25519Key";
import { EdDsaJwt } from "../edDsaJwt";

export interface MachineTokenIssueOptions {
  /** None by default: a machine's token lapses only when its version is bumped. */
  expiresAt?: Date | { toDate(): Date };
  /** The `<app>/<environment>` that accepts it; this server's own by default. */
  audience?: string;
}

export type MachineTokenVerdict = { ok: true; identity: MachineIdentity } | { ok: false; reason: string };

interface KeyPair {
  privateKey: KeyObject | null;
  publicKey: KeyObject | null;
}

//* EdDSA so a staff session's HS256 verification can never accept one, and so a server that only checks them holds no
//* key that mints them. Revocation is the identity's `version`: the guard compares it with the record's own.
export class MachineToken {
  static readonly type = "akan-machine+jwt";
  static readonly #logger = new Logger("MachineToken");
  static #keys: { source: string; pair: KeyPair } | null = null;
  static #warnedKeyless = false;

  static audience() {
    const { appName, environment } = getEnv();
    return `${appName}/${environment}`;
  }

  //? Read per call and cached by value: a test or a console session may set the env after the module loaded.
  static #keyPair(): KeyPair {
    const privateValue = process.env.AKAN_MACHINE_PRIVATE_KEY?.trim() ?? "";
    const publicValue = process.env.AKAN_MACHINE_PUBLIC_KEY?.trim() ?? "";
    const source = `${privateValue}\0${publicValue}`;
    if (MachineToken.#keys?.source === source) return MachineToken.#keys.pair;
    const privateKey = privateValue ? Ed25519Key.parsePrivate(privateValue, "AKAN_MACHINE_PRIVATE_KEY") : null;
    const publicKey = publicValue
      ? Ed25519Key.parsePublic(publicValue, "AKAN_MACHINE_PUBLIC_KEY")
      : privateKey
        ? createPublicKey(privateKey)
        : null;
    const pair = { privateKey, publicKey };
    MachineToken.#keys = { source, pair };
    return pair;
  }

  static canIssue() {
    return !!MachineToken.#keyPair().privateKey;
  }

  static canVerify() {
    return !!MachineToken.#keyPair().publicKey;
  }

  static issue(identity: MachineIdentity, { expiresAt, audience }: MachineTokenIssueOptions = {}): string {
    const { privateKey } = MachineToken.#keyPair();
    if (!privateKey) throw new Error("MachineToken.issue needs AKAN_MACHINE_PRIVATE_KEY on the server that issues it");
    MachineToken.#assertIdentity(identity);
    const iat = Math.floor(Date.now() / 1000);
    const expiry = expiresAt ? ("toDate" in expiresAt ? expiresAt.toDate() : expiresAt) : null;
    const claims = {
      aud: audience ?? MachineToken.audience(),
      sub: identity.id,
      kind: identity.kind,
      ver: identity.version,
      iat,
      ...(expiry ? { exp: Math.floor(expiry.getTime() / 1000) } : {}),
    };
    return EdDsaJwt.sign(claims, privateKey, { typ: MachineToken.type });
  }

  /** By its header alone, so a staff session's bearer is told apart without a verification. */
  static isMachineToken(token: string) {
    return EdDsaJwt.headerOf(token)?.typ === MachineToken.type;
  }

  static verify(token: string, nowSec = Math.floor(Date.now() / 1000)): MachineTokenVerdict {
    const { publicKey } = MachineToken.#keyPair();
    if (!publicKey)
      return { ok: false, reason: "no AKAN_MACHINE_PUBLIC_KEY or AKAN_MACHINE_PRIVATE_KEY to verify with" };
    const verdict = EdDsaJwt.verify(token, publicKey, { typ: MachineToken.type, audience: MachineToken.audience() });
    if (!verdict.ok) return verdict;
    const { sub, kind, ver, exp } = verdict.claims;
    if (exp !== undefined && (typeof exp !== "number" || exp <= nowSec)) return { ok: false, reason: "expired" };
    const identity = { kind, id: sub, version: ver } as MachineIdentity;
    if (!MachineToken.#isIdentity(identity)) return { ok: false, reason: "sub, kind and ver are required" };
    return { ok: true, identity: { kind: identity.kind, id: identity.id, version: identity.version } };
  }

  /** The identity a bearer machine token proves, or `null`: absent, another kind of token, or one that fails. */
  static fromAuthorization(authorization: string | null | undefined): MachineIdentity | null {
    const token = bearerTokenOf(authorization);
    if (!token || !MachineToken.isMachineToken(token)) return null;
    const verdict = MachineToken.verify(token);
    if (verdict.ok) return verdict.identity;
    if (!MachineToken.canVerify() && !MachineToken.#warnedKeyless) {
      MachineToken.#warnedKeyless = true;
      MachineToken.#logger.error(
        "A machine token arrived, and this server has neither AKAN_MACHINE_PUBLIC_KEY nor AKAN_MACHINE_PRIVATE_KEY to verify it: every machine call is anonymous.",
      );
    } else MachineToken.#logger.verbose(`refused a machine token: ${verdict.reason}`);
    return null;
  }

  static #isIdentity(identity: MachineIdentity) {
    return (
      typeof identity.kind === "string" &&
      !!identity.kind &&
      typeof identity.id === "string" &&
      !!identity.id &&
      Number.isSafeInteger(identity.version) &&
      identity.version >= 0
    );
  }

  static #assertIdentity(identity: MachineIdentity) {
    if (!MachineToken.#isIdentity(identity))
      throw new Error("A machine identity is { kind, id } as non-empty strings and version as an integer from 0");
  }
}
