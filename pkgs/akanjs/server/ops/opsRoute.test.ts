import { afterAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AppDetailInfo } from "./appInfo";
import { OpsRoute } from "./opsRoute";
import { OpsTokenVerifier } from "./opsToken";
import { SnapshotJobs } from "./snapshotJobs";
import type { SnapshotManifest } from "./snapshotTypes";
import type { SnapshotCapture } from "./sqliteSnapshot";

const root = mkdtempSync(path.join(tmpdir(), "akan-ops-route-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const audience = "opsapp/main/edge-1";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = () => {
  const iat = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "EdDSA" })}.${b64({ aud: audience, iat, exp: iat + 60, jti: crypto.randomUUID() })}`;
  return `${head}.${sign(null, Buffer.from(head), privateKey).toString("base64url")}`;
};

const detail = (): AppDetailInfo => ({
  appName: "opsapp",
  repoName: "akan",
  environment: "main",
  operationMode: "edge",
  akanVersion: "3.0.0",
  buildId: "abc123",
  serverMode: "all",
  databaseMode: "single",
  solo: true,
  startedAt: new Date(0).toISOString(),
  replicaIdx: 0,
});

const fakeCapture = (id: string, withSolid: boolean): SnapshotCapture => {
  const dir = path.join(root, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = (withSolid ? (["main", "solid"] as const) : (["main"] as const)).map((role) => {
    writeFileSync(path.join(dir, `${role}.db.gz`), role);
    return {
      role,
      name: `${role}.db.gz`,
      sizeBytes: 1,
      sha256: "x",
      encoding: "gzip" as const,
      uploadBytes: 4,
      uploadSha256: "y",
    };
  });
  const manifest = { id, files } as unknown as SnapshotManifest;
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return {
    dir,
    manifest,
    manifestPath: path.join(dir, "manifest.json"),
    paths: Object.fromEntries(files.map((file) => [file.role, path.join(dir, file.name)])),
  };
};

const setup = ({ status = 200, rateLimitPerMinute = 30 }: { status?: number; rateLimitPerMinute?: number } = {}) => {
  const puts: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    puts.push(String(url));
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  const jobs = new SnapshotJobs({
    snapshotDir: root,
    capture: async (request) => fakeCapture(request.id, request.includeSolid),
    fetcher,
    retryDelayMs: 1,
  });
  const route = new OpsRoute({ verifier: new OpsTokenVerifier(publicKey, audience), detail, jobs, rateLimitPerMinute });
  return { route, jobs, puts };
};

const call = (route: OpsRoute, pathname: string, init: RequestInit & { auth?: boolean } = {}) => {
  const { auth = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (auth) headers.set("authorization", `Bearer ${token()}`);
  return route.handle(new Request(`http://edge.local${pathname}`, { ...rest, headers }));
};

const snapshotBody = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    id,
    uploadUrls: {
      main: "https://r2.example/main",
      solid: "https://r2.example/solid",
      manifest: "https://r2.example/m",
    },
    ...extra,
  });

describe("OpsRoute", () => {
  test("answers 401 without a token and the detail with one", async () => {
    const { route } = setup();
    expect((await call(route, "/_akan/ops/info", { auth: false })).status).toBe(401);
    const res = await call(route, "/_akan/ops/info");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ buildId: "abc123", akanVersion: "3.0.0" });
  });

  test("uploads every file, then the manifest last, and reports done", async () => {
    const { route, jobs, puts } = setup();
    const res = await call(route, "/_akan/ops/snapshot", {
      method: "POST",
      body: snapshotBody("a1", { includeSolid: true }),
    });
    expect(res.status).toBe(202);
    await jobs.idle();
    expect(puts).toEqual(["https://r2.example/main", "https://r2.example/solid", "https://r2.example/m"]);
    const state = await (await call(route, "/_akan/ops/snapshot/a1")).json();
    expect(state).toMatchObject({ id: "a1", status: "done" });
    expect((await call(route, "/_akan/ops/snapshot", { method: "POST", body: snapshotBody("a1") })).status).toBe(409);
  });

  test("a refused upload fails the job without retrying and never publishes the manifest", async () => {
    const { route, jobs, puts } = setup({ status: 403 });
    await call(route, "/_akan/ops/snapshot", { method: "POST", body: snapshotBody("b1") });
    await jobs.idle();
    expect(puts).toEqual(["https://r2.example/main"]);
    expect(await (await call(route, "/_akan/ops/snapshot/b1")).json()).toMatchObject({ status: "failed" });
  });

  test("refuses cleartext upload URLs off loopback and a malformed id", async () => {
    const { route } = setup();
    const plain = JSON.stringify({
      id: "c1",
      uploadUrls: { main: "http://r2.example/x", manifest: "https://r2.example/m" },
    });
    expect((await call(route, "/_akan/ops/snapshot", { method: "POST", body: plain })).status).toBe(400);
    expect((await call(route, "/_akan/ops/snapshot", { method: "POST", body: snapshotBody("../c") })).status).toBe(400);
  });

  test("rate limits before verifying anything", async () => {
    const { route } = setup({ rateLimitPerMinute: 2 });
    await call(route, "/_akan/ops/info", { auth: false });
    await call(route, "/_akan/ops/info", { auth: false });
    expect((await call(route, "/_akan/ops/info")).status).toBe(429);
  });
});
