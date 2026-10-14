import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { resetEnvCache } from "akanjs/base";
import { Machine, type SignalContext } from "akanjs/signal";
import { Ed25519Key } from "../ed25519Key";
import { EdDsaJwt } from "../edDsaJwt";
import { MachineAccount } from "./machineAccount";
import { MachineToken } from "./machineToken";

const kiosk = { kind: "kiosk", id: "pc-7", version: 3 };
const keys = Ed25519Key.generate();
const saved = { ...process.env };

const useEnv = (env: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
};

beforeEach(() => {
  useEnv({
    AKAN_PUBLIC_APP_NAME: "fleet",
    AKAN_PUBLIC_REPO_NAME: "akan",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
    AKAN_PUBLIC_ENV: "main",
    AKAN_MACHINE_PRIVATE_KEY: keys.privatePem,
    AKAN_MACHINE_PUBLIC_KEY: undefined,
  });
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  resetEnvCache();
});

const hs256 = (claims: object) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${signed}.${createHmac("sha256", "staff-secret").update(signed).digest("base64url")}`;
};

describe("MachineToken", () => {
  test("a token it issues verifies to the same identity, with no expiry unless asked", () => {
    const token = MachineToken.issue(kiosk);
    expect(MachineToken.verify(token)).toEqual({ ok: true, identity: kiosk });
    const [, payload = ""] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    expect(claims).toMatchObject({ aud: "fleet/main", sub: "pc-7", kind: "kiosk", ver: 3 });
    expect(claims.exp).toBeUndefined();
  });

  test("a server holding only the public key verifies and cannot issue", () => {
    const token = MachineToken.issue(kiosk);
    useEnv({ AKAN_MACHINE_PRIVATE_KEY: undefined, AKAN_MACHINE_PUBLIC_KEY: keys.publicKey });
    expect(MachineToken.canVerify()).toBe(true);
    expect(MachineToken.canIssue()).toBe(false);
    expect(MachineToken.verify(token)).toEqual({ ok: true, identity: kiosk });
    expect(() => MachineToken.issue(kiosk)).toThrow("needs AKAN_MACHINE_PRIVATE_KEY");
  });

  test("refuses another key's token, another app or environment, a lapsed expiry and a tampered payload", () => {
    const token = MachineToken.issue(kiosk);
    const expired = MachineToken.issue(kiosk, { expiresAt: new Date(Date.now() - 1000) });
    const elsewhere = MachineToken.issue(kiosk, { audience: "fleet/debug" });
    const [header, , signature] = token.split(".");
    const forged = `${header}.${Buffer.from(JSON.stringify({ aud: "fleet/main", sub: "pc-8", kind: "kiosk", ver: 3 })).toString("base64url")}.${signature}`;
    expect(MachineToken.verify(expired)).toEqual({ ok: false, reason: "expired" });
    expect(MachineToken.verify(elsewhere)).toEqual({ ok: false, reason: "audience mismatch" });
    expect(MachineToken.verify(forged)).toEqual({ ok: false, reason: "bad signature" });
    useEnv({ AKAN_MACHINE_PRIVATE_KEY: Ed25519Key.generate().privatePem });
    expect(MachineToken.verify(token)).toEqual({ ok: false, reason: "bad signature" });
  });

  test("a staff session's bearer is not a machine token, and is never verified as one", () => {
    const staff = hs256({ appName: "fleet", environment: "main", machine: kiosk });
    expect(MachineToken.isMachineToken(staff)).toBe(false);
    expect(MachineToken.fromAuthorization(`Bearer ${staff}`)).toBeNull();
    expect(MachineToken.verify(staff)).toEqual({ ok: false, reason: "not an EdDSA akan-machine+jwt" });
  });

  test("refuses an EdDSA token its own key signed under another typ, which no session reads as a machine's", () => {
    const privateKey = Ed25519Key.parsePrivate(keys.privatePem, "AKAN_MACHINE_PRIVATE_KEY");
    const claims = { aud: "fleet/main", sub: "pc-7", kind: "kiosk", ver: 3 };
    const plain = EdDsaJwt.sign(claims, privateKey, { typ: "JWT" });
    expect(MachineToken.verify(plain)).toEqual({ ok: false, reason: "not an EdDSA akan-machine+jwt" });
    expect(MachineToken.fromAuthorization(`Bearer ${plain}`)).toBeNull();
    const listed = EdDsaJwt.sign({ ...claims, aud: ["fleet/debug", "fleet/main"] }, privateKey, {
      typ: MachineToken.type,
    });
    expect(MachineToken.verify(listed)).toEqual({ ok: true, identity: kiosk });
  });

  test("reads the bearer as every other gate does: one word after the scheme, in any case", () => {
    const token = MachineToken.issue(kiosk);
    expect(MachineToken.fromAuthorization(`bearer  ${token}`)).toEqual(kiosk);
    for (const authorization of [`Bearer\t${token}`, `Bearer ${token} x`, token, null, undefined])
      expect(MachineToken.fromAuthorization(authorization)).toBeNull();
  });

  test("refuses an identity without kind, id or a whole version", () => {
    expect(() => MachineToken.issue({ kind: "", id: "pc-7", version: 1 })).toThrow("A machine identity is");
    expect(() => MachineToken.issue({ kind: "kiosk", id: "pc-7", version: 1.5 })).toThrow("A machine identity is");
  });
});

describe("MachineAccount", () => {
  const callWith = async (holder: { headers: Headers; account?: Record<string, unknown> }, transport = "http") => {
    const get = (key: string) => (holder as Record<string, unknown>)[key] ?? null;
    const context = (transport === "http"
      ? { transport, get, getHttpContext: () => ({ req: holder }) }
      : { transport, get, getWebSocketContext: () => ({ ws: { data: holder } }) }) as unknown as SignalContext;
    let reached = false;
    await new MachineAccount().use()(context, async () => {
      reached = true;
    });
    expect(reached).toBe(true);
    return { account: holder.account, machine: new Machine().getArg(context) };
  };

  test("sets account.machine from a verified token, over HTTP and a websocket's credential", async () => {
    const authorization = `Bearer ${MachineToken.issue(kiosk)}`;
    const http = await callWith({
      headers: new Headers({ authorization }),
      account: { appName: "fleet", environment: "main" },
    });
    expect(http.account).toEqual({ appName: "fleet", environment: "main", machine: kiosk });
    expect(http.machine).toEqual(kiosk);
    const ws = await callWith({ headers: new Headers({ authorization }) }, "websocket");
    expect(ws.account).toEqual({ appName: "fleet", environment: "main", machine: kiosk });
  });

  test("takes off a machine any other middleware put on the account", async () => {
    const forged = { kind: "kiosk", id: "pc-1", version: 99 };
    const staff = await callWith({
      headers: new Headers({ authorization: `Bearer ${hs256({ machine: forged })}` }),
      account: { appName: "fleet", environment: "main", me: { id: "staff" }, machine: forged },
    });
    expect(staff.account).toEqual({ appName: "fleet", environment: "main", me: { id: "staff" } });
    expect(staff.machine).toBeNull();
  });

  test("leaves an anonymous call's account as the libs left it", async () => {
    const anonymous = await callWith({ headers: new Headers() });
    expect(anonymous.account).toBeUndefined();
    expect(anonymous.machine).toBeNull();
  });
});
