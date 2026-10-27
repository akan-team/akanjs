import { afterEach, describe, expect, test } from "bun:test";
import { resetEnvCache } from "akanjs/base";
import { cookies as clientCookies, getAuthToken } from "../client/cookie";
import { requestStorage, cookies as serverCookies } from "../fetch/requestStorage";
import { AppWsData } from "../server/routing/appWsData";
import { EndpointIdempotency } from "../signal/endpointIdempotency";
import type { SignalContext } from "../signal/signalContext";
import { authTokenKey, readSessionToken } from "./authToken";
import { CookieJar } from "./cookieJar";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "parity",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "debug",
  AKAN_PUBLIC_RENDER_ENV: "ssr",
});
resetEnvCache();

const key = authTokenKey();
const rows: [label: string, cookie: string | null, token: string | undefined][] = [
  ["none", null, undefined],
  ["one", `${key}=tokA`, "tokA"],
  ["duplicated", `${key}=tokA; ${key}=tokB`, undefined],
  ["duplicated, other order", `${key}=tokB; ${key}=tokA`, undefined],
  ["duplicated with one value", `${key}=tokA; ${key}=tokA`, undefined],
  ["scoped beside the bare name", `jwt=tokBare; ${key}=tokA`, "tokA"],
  ["bare name only", "jwt=tokBare", undefined],
  ["%-encoded", `${key}=tok%3DA%25`, "tok=A%"],
  ["quoted", `${key}="tokA"`, "tokA"],
  ["`=` in the value", `${key}=a.b=c==`, "a.b=c=="],
];

const headersOf = (cookie: string | null, extra: Record<string, string> = {}) =>
  new Headers({ ...(cookie === null ? {} : { cookie }), ...extra });

const serverRead = (cookie: string | null) =>
  requestStorage?.run(
    new Request("https://app.example.com/", { headers: headersOf(cookie) }),
    () => serverCookies().get(key)?.value,
  );

const asBrowser = <T>(cookie: string | null, read: () => T): T => {
  const location = { protocol: "https:", host: "app.example.com", hostname: "app.example.com", pathname: "/" };
  Object.assign(globalThis, { window: { location }, location, document: { cookie: cookie ?? "" } });
  resetEnvCache();
  try {
    return read();
  } finally {
    for (const name of ["window", "location", "document"]) Reflect.deleteProperty(globalThis, name);
    resetEnvCache();
  }
};

// The caller segment of the key a mutation's `Idempotency-Key` is kept under, or null when it keys on no caller.
const idempotencyCallerOf = async (headers: Headers): Promise<string | null> => {
  const keys: string[] = [];
  const cache = {
    acquireLease: async (_topic: string, leaseKey: string) => {
      keys.push(leaseKey);
      return true;
    },
    renewLease: async () => true,
    releaseLease: async () => true,
    set: async () => undefined,
  };
  headers.set(EndpointIdempotency.header, "parity-key");
  const req = new Request("https://app.example.com/api/parity", { method: "POST", headers });
  const context = {
    endpointInfo: { type: "mutation" },
    transport: "http",
    origin: "http",
    key: "parityMutation",
    args: [],
    get: () => null,
    getHttpContext: () => ({ req, res: { json: (body: unknown) => Response.json(body) } }),
    getAdaptor: () => cache,
    adaptor: { logger: { warn: () => undefined } },
  } as unknown as SignalContext;
  await EndpointIdempotency.through(
    context,
    async () => "ran",
    async (result) => result,
  );
  return keys[0]?.split(":")[1] ?? null;
};

afterEach(() => {
  for (const name of ["window", "location", "document"]) Reflect.deleteProperty(globalThis, name);
  resetEnvCache();
});

describe("every reader of the session cookie agrees", () => {
  for (const [label, cookie, token] of rows)
    test(label, async () => {
      const expectedCaller = token
        ? await idempotencyCallerOf(new Headers({ authorization: `Bearer ${token}` }))
        : null;

      expect({
        jar: CookieJar.parse(cookie).read(key).value,
        session: readSessionToken(CookieJar.parse(cookie)).token,
        server: serverRead(cookie),
        client: asBrowser(cookie, () => clientCookies().get(key)?.value),
        clientAuthToken: asBrowser(cookie, () => getAuthToken()),
        socket: readSessionToken(
          AppWsData.fromRequest(new Request("http://app/ws", { headers: headersOf(cookie) })).jar,
        ).token,
        idempotencyCaller: await idempotencyCallerOf(headersOf(cookie)),
      }).toEqual({
        jar: token,
        session: token,
        server: token,
        client: token,
        clientAuthToken: token,
        socket: token,
        idempotencyCaller: expectedCaller,
      });
      if (token) expect(expectedCaller).toBeTruthy();
    });
});
