import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Logger, type LoggerSinkEntry } from "akanjs/common";
import type { BaseBuildArtifact } from "../types";
import { HostBasePathWebProxy } from "./hostBasePathWebProxy";
import { WEB_PROXY_RESULT, type WebProxyResult } from "./types";

const artifact = {
  subRoutes: { soft: ["soft.akanjs.com"] },
  basePaths: ["soft", "office"],
} satisfies Pick<BaseBuildArtifact, "subRoutes" | "basePaths">;

let cwd: string;
let workspace: string;
let subRouteHostsEnv: string | undefined;

beforeEach(() => {
  cwd = process.cwd();
  subRouteHostsEnv = process.env.AKAN_SUB_ROUTE_HOSTS;
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "akan-host-base-path-"));
  const artifactDir = path.join(workspace, ".akan", "artifact");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "base-artifact.json"), JSON.stringify(artifact));
  process.chdir(workspace);
});

afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(workspace, { recursive: true, force: true });
  if (subRouteHostsEnv === undefined) delete process.env.AKAN_SUB_ROUTE_HOSTS;
  else process.env.AKAN_SUB_ROUTE_HOSTS = subRouteHostsEnv;
});

const request = (url: string, host: string) => new Request(url, { headers: { host } }) as unknown as Bun.BunRequest;

const isProxyResult = (value: unknown): value is WebProxyResult =>
  Boolean(value && typeof value === "object" && WEB_PROXY_RESULT in value);

const rewriteOf = (value: unknown) => {
  if (!isProxyResult(value) || value.type !== "rewrite") throw new Error(`expected a rewrite, got ${String(value)}`);
  return { pathname: new URL(value.url).pathname, headers: new Headers(value.request?.headers) };
};

describe("HostBasePathWebProxy", () => {
  test("routes a host injected through AKAN_SUB_ROUTE_HOSTS", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "soft=soft-angelo-develop-soft-s2-ab12cd.try.akanjs.com";

    const result = new HostBasePathWebProxy().use(
      request("http://internal/en/home", "soft-angelo-develop-soft-s2-ab12cd.try.akanjs.com"),
    );

    const { pathname, headers } = rewriteOf(result);
    expect(pathname).toBe("/en/soft/home");
    expect(headers.get("x-base-path")).toBe("soft");
  });

  test("keeps the hosts baked into the artifact when the env adds more", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "soft=soft-angelo-develop-soft-s2-ab12cd.try.akanjs.com";

    const result = new HostBasePathWebProxy().use(request("http://internal/en/home", "soft.akanjs.com"));

    expect(rewriteOf(result).pathname).toBe("/en/soft/home");
  });

  test("matches an env host regardless of case and port", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "soft=SOFT-ANGELO.try.akanjs.com:443";

    const result = new HostBasePathWebProxy().use(
      request("http://internal/en/home", "soft-angelo.TRY.akanjs.com:8080"),
    );

    expect(rewriteOf(result).pathname).toBe("/en/soft/home");
  });

  test("ignores an env basePath this build does not serve and warns", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "nope=nope.try.akanjs.com;soft=soft-angelo.try.akanjs.com";
    const entries: LoggerSinkEntry[] = [];
    const sink = (entry: LoggerSinkEntry) => void entries.push(entry);
    Logger.addSink(sink);

    try {
      const proxy = new HostBasePathWebProxy();
      expect(proxy.use(request("http://internal/en/home", "nope.try.akanjs.com"))).toBeUndefined();
      expect(rewriteOf(proxy.use(request("http://internal/en/home", "soft-angelo.try.akanjs.com")))).toMatchObject({
        pathname: "/en/soft/home",
      });
    } finally {
      Logger.removeSink(sink);
    }

    expect(entries.some((entry) => entry.plainMessage.includes("nope"))).toBe(true);
  });

  test("warns about an ignored basePath once per process, whichever reader resolves the env first", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "gone=gone.try.akanjs.com";
    const entries: LoggerSinkEntry[] = [];
    const sink = (entry: LoggerSinkEntry) => void entries.push(entry);
    Logger.addSink(sink);

    try {
      new HostBasePathWebProxy().use(request("http://internal/en/home", "gone.try.akanjs.com"));
      new HostBasePathWebProxy().use(request("http://internal/en/home", "gone.try.akanjs.com"));
    } finally {
      Logger.removeSink(sink);
    }

    expect(entries.filter((entry) => entry.plainMessage.includes("gone")).length).toBe(1);
  });

  test("leaves an unmapped host to the root app", () => {
    expect(new HostBasePathWebProxy().use(request("http://internal/en/home", "akanjs.com"))).toBeUndefined();
  });

  test("redirects a public url that already carries the basePath segment", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "soft=soft-angelo.try.akanjs.com";

    const result = new HostBasePathWebProxy().use(
      request("http://internal/en/soft/home", "soft-angelo.try.akanjs.com"),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(308);
    expect((result as Response).headers.get("location")).toBe("http://soft-angelo.try.akanjs.com/en/home");
  });

  test('redirects to the unprefixed public url of the default locale under localePrefix "as-needed"', () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "soft=soft-angelo.try.akanjs.com";
    const localePrefix = process.env.AKAN_PUBLIC_LOCALE_PREFIX;
    process.env.AKAN_PUBLIC_LOCALE_PREFIX = "as-needed";
    try {
      const redirect = (url: string) =>
        (new HostBasePathWebProxy().use(request(url, "soft-angelo.try.akanjs.com")) as Response).headers.get(
          "location",
        );
      expect(redirect("http://internal/en/soft/home")).toBe("http://soft-angelo.try.akanjs.com/home");
      expect(redirect("http://internal/en/soft")).toBe("http://soft-angelo.try.akanjs.com/");
      expect(redirect("http://internal/ko/soft/home")).toBe("http://soft-angelo.try.akanjs.com/ko/home");
    } finally {
      if (localePrefix === undefined) delete process.env.AKAN_PUBLIC_LOCALE_PREFIX;
      else process.env.AKAN_PUBLIC_LOCALE_PREFIX = localePrefix;
    }
  });

  test("routes and redirects on the first host and proto of a multi-hop forwarded chain", () => {
    process.env.AKAN_SUB_ROUTE_HOSTS = "soft=soft-angelo.try.akanjs.com";
    const forwarded = (url: string) =>
      new Request(url, {
        headers: {
          host: "internal",
          "x-forwarded-host": "soft-angelo.try.akanjs.com, lb.internal:8080",
          "x-forwarded-proto": "https, http",
        },
      }) as unknown as Bun.BunRequest;

    expect(rewriteOf(new HostBasePathWebProxy().use(forwarded("http://internal/en/home"))).pathname).toBe(
      "/en/soft/home",
    );
    const redirect = new HostBasePathWebProxy().use(forwarded("http://internal/en/soft/home"));
    expect((redirect as Response).headers.get("location")).toBe("https://soft-angelo.try.akanjs.com/en/home");
  });
});
