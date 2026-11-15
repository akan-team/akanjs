import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { ClientReportId } from "./clientReportId";
import { GatewayConfig } from "./gateway/gatewayConfig";

const pageId = "0af7651916cd43dd8448eb211c80319c";
const envKeys = ["AKAN_LOG_DEBUG_HEADER", "AKAN_CLIENT_REPORT_KEY", "AKAN_PUBLIC_APP_NAME", "AKAN_PUBLIC_ENV"] as const;
type EnvKey = (typeof envKeys)[number];
const saved = envKeys.map((key) => [key, process.env[key]] as const);
const setEnv = (values: Partial<Record<EnvKey, string>>) => {
  for (const key of envKeys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
};
afterEach(() => setEnv(Object.fromEntries(saved.filter(([, value]) => value !== undefined))));

//? Another process, as a second replica is: it shares only what its environment holds.
const signedElsewhere = (env: Partial<Record<EnvKey, string>>): string => {
  const source = JSON.stringify(path.join(import.meta.dir, "clientReportId.ts"));
  const script = `import { ClientReportId } from ${source}; process.stdout.write(ClientReportId.sign("${pageId}"));`;
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !envKeys.includes(key as EnvKey)));
  const { stdout } = Bun.spawnSync([process.execPath, "-e", script], { env: { ...inherited, ...env } });
  return stdout.toString();
};

describe("ClientReportId", () => {
  test("signs a page view's id into a value short enough for a header and takes back only what it signed", () => {
    const signed = ClientReportId.sign(pageId);
    expect(signed).toMatch(/^0af7651916cd43dd8448eb211c80319c\.[\w-]{22}$/);
    expect(ClientReportId.verify(signed)).toBe(pageId);

    const [, mac = ""] = signed.split(".");
    const otherMac = `${mac.startsWith("A") ? "B" : "A"}${mac.slice(1)}`;
    const refused = [
      pageId,
      `${pageId}.`,
      `${pageId}.${otherMac}`,
      `${pageId}.${mac}x`,
      `1${pageId.slice(1)}.${mac}`,
      `${signed}.${mac}`,
      "",
      null,
      { toString: () => signed },
    ];
    expect(refused.map((value) => ClientReportId.verify(value))).toEqual(refused.map(() => null));
  });

  test("takes an id for the half hour it was signed in and the next one, and no longer", () => {
    const signedAt = 40 * ClientReportId.bucketMs + 1_000;
    const signed = ClientReportId.sign(pageId, signedAt);
    expect(ClientReportId.bucketMs).toBe(30 * 60_000);
    expect(ClientReportId.verify(signed, signedAt + ClientReportId.bucketMs - 2_000)).toBe(pageId);
    expect(ClientReportId.verify(signed, signedAt + 2 * ClientReportId.bucketMs - 2_000)).toBe(pageId);
    expect(ClientReportId.verify(signed, signedAt + 2 * ClientReportId.bucketMs)).toBeNull();
    expect(ClientReportId.verify(signed, signedAt - ClientReportId.bucketMs)).toBeNull();
  });

  test("takes an id another server process signed when both hold the deployment's secret", () => {
    const shared = { AKAN_LOG_DEBUG_HEADER: "s".repeat(32), AKAN_PUBLIC_APP_NAME: "shop", AKAN_PUBLIC_ENV: "main" };
    setEnv(shared);
    expect(ClientReportId.verify(signedElsewhere(shared))).toBe(pageId);
    expect(ClientReportId.verify(signedElsewhere({ ...shared, AKAN_CLIENT_REPORT_KEY: "another-gateway" }))).toBe(
      pageId,
    );
    expect(ClientReportId.verify(signedElsewhere({ ...shared, AKAN_PUBLIC_APP_NAME: "admin" }))).toBeNull();
    expect(ClientReportId.verify(signedElsewhere({ ...shared, AKAN_PUBLIC_ENV: "develop" }))).toBeNull();
    expect(ClientReportId.verify(signedElsewhere({ ...shared, AKAN_LOG_DEBUG_HEADER: "t".repeat(32) }))).toBeNull();
  });

  test("without that secret, takes an id from a replica of its own gateway and from no other process", () => {
    const replica = { AKAN_CLIENT_REPORT_KEY: "made-by-the-gateway", AKAN_PUBLIC_APP_NAME: "shop" };
    setEnv({ ...replica, AKAN_LOG_DEBUG_HEADER: "too-short" });
    expect(ClientReportId.verify(signedElsewhere(replica))).toBe(pageId);
    expect(
      ClientReportId.verify(signedElsewhere({ ...replica, AKAN_CLIENT_REPORT_KEY: "another-gateway" })),
    ).toBeNull();

    setEnv({ AKAN_PUBLIC_APP_NAME: "shop" });
    expect(ClientReportId.verify(ClientReportId.sign(pageId))).toBe(pageId);
    expect(ClientReportId.verify(signedElsewhere({ AKAN_PUBLIC_APP_NAME: "shop" }))).toBeNull();
  });

  test("a gateway hands every replica it starts one key, its own", () => {
    const gateway = () =>
      new GatewayConfig(path.join("/tmp", "server.ts"), { replica: 2, runtimeDir: "/tmp", port: 0 });
    const first = gateway();
    const keys = [0, 1].map((idx) => first.childEnv(idx, "all").AKAN_CLIENT_REPORT_KEY);
    expect(keys[0]).toMatch(/^[\w-]{43}$/);
    expect(keys[1]).toBe(keys[0] ?? "");
    expect(gateway().childEnv(0, "all").AKAN_CLIENT_REPORT_KEY).not.toBe(keys[0] ?? "");
  });
});
