import { afterEach, describe, expect, test } from "bun:test";
import { Logger } from "akanjs/common";
import { StatusAccess } from "./statusAccess";

const requestWith = (authorization?: string) =>
  new Request("http://app.example/_akan/app/health", { headers: authorization ? { authorization } : {} });

const detail = () => ({ status: "running", pid: 42, children: [{ lastErrorMessage: "db down" }] });

describe("StatusAccess", () => {
  const keys = ["AKAN_STATUS_TOKEN", "AKAN_LOG_STREAM_TOKEN", "AKAN_PUBLIC_ENV"] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("admits only the exact bearer token", () => {
    const access = new StatusAccess({ tokens: ["s3cret"] });
    expect(access.allows(requestWith("Bearer s3cret"))).toBe(true);
    for (const header of [undefined, "Bearer s3cre", "Bearer s3cret2", "Basic s3cret", "s3cret"])
      expect(access.allows(requestWith(header))).toBe(false);
  });

  test("admits nobody when no token is configured, unless the server is open", () => {
    expect(new StatusAccess({ tokens: [null, undefined, ""] }).allows(requestWith("Bearer anything"))).toBe(false);
    expect(new StatusAccess({ tokens: [], open: true }).allows(requestWith())).toBe(true);
  });

  test("answers health with the status alone to a stranger, and in full to the token holder", async () => {
    const access = new StatusAccess({ tokens: ["s3cret"] });
    const brief = access.health(requestWith(), detail);
    expect(brief.status).toBe(200);
    expect(brief.headers.get("cache-control")).toBe("no-store");
    expect(await brief.json()).toEqual({ status: "running" });
    expect(await access.health(requestWith("Bearer s3cret"), detail).json()).toEqual(detail());
  });

  test("refuses metrics with a bearer challenge, and serves them to the token holder", async () => {
    const access = new StatusAccess({ tokens: ["s3cret"] });
    const refused = access.metrics(requestWith("Bearer wrong"), detail);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe("Bearer");
    expect(await refused.text()).not.toContain("db down");
    const served = access.metrics(requestWith("Bearer s3cret"), detail);
    expect(served.status).toBe(200);
    expect(await served.json()).toEqual(detail());
  });

  test("admits either the status token or the log stream token", () => {
    process.env.AKAN_STATUS_TOKEN = " scrape-only ";
    process.env.AKAN_LOG_STREAM_TOKEN = "log-reader";
    process.env.AKAN_PUBLIC_ENV = "main";
    const access = StatusAccess.fromEnv();
    expect(access.allows(requestWith("Bearer scrape-only"))).toBe(true);
    expect(access.allows(requestWith("Bearer log-reader"))).toBe(true);
    expect(access.allows(requestWith("Bearer scrape-onl"))).toBe(false);
    expect(access.allows(requestWith())).toBe(false);
    delete process.env.AKAN_STATUS_TOKEN;
    expect(StatusAccess.fromEnv().allows(requestWith("Bearer log-reader"))).toBe(true);
    delete process.env.AKAN_LOG_STREAM_TOKEN;
    process.env.AKAN_STATUS_TOKEN = "scrape-only";
    expect(StatusAccess.fromEnv().allows(requestWith("Bearer scrape-only"))).toBe(true);
  });

  test("stays open only in local", () => {
    process.env.AKAN_PUBLIC_ENV = "main";
    expect(StatusAccess.fromEnv().allows(requestWith())).toBe(false);
    process.env.AKAN_PUBLIC_ENV = "local";
    expect(StatusAccess.fromEnv().allows(requestWith())).toBe(true);
  });

  test("ignores a token no bearer header could carry, and says so once per variable without its value", () => {
    const warnings: string[] = [];
    const stop = Logger.addSink(({ level, plainMessage }) => {
      if (level === "warn" && plainMessage.includes("TOKEN")) warnings.push(plainMessage);
    });
    try {
      process.env.AKAN_STATUS_TOKEN = "two words";
      process.env.AKAN_LOG_STREAM_TOKEN = "";
      process.env.AKAN_PUBLIC_ENV = "main";
      expect(StatusAccess.fromEnv().allows(requestWith("Bearer two words"))).toBe(false);
      expect(StatusAccess.fromEnv().allows(requestWith("Bearer "))).toBe(false);
      process.env.AKAN_LOG_STREAM_TOKEN = "log\treader";
      expect(StatusAccess.fromEnv().allows(requestWith("Bearer log"))).toBe(false);
      StatusAccess.fromEnv();
    } finally {
      stop();
    }
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("AKAN_STATUS_TOKEN");
    expect(warnings[1]).toContain("AKAN_LOG_STREAM_TOKEN");
    expect(warnings.join("\n")).not.toContain("words");
    expect(warnings.join("\n")).not.toContain("reader");
  });
});
