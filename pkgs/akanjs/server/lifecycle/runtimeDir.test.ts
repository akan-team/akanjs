import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveRuntimeDir } from "./runtimeDir";

const saved = { ...process.env };

afterEach(() => {
  process.env.AKAN_RUNTIME_DIR = saved.AKAN_RUNTIME_DIR;
  process.env.NODE_ENV = saved.NODE_ENV;
  process.env.AKAN_PUBLIC_APP_NAME = saved.AKAN_PUBLIC_APP_NAME;
  if (saved.AKAN_RUNTIME_DIR === undefined) delete process.env.AKAN_RUNTIME_DIR;
});

describe("runtime dir", () => {
  test("prefers the caller's own path over everything else", () => {
    process.env.AKAN_RUNTIME_DIR = "/tmp/ignored";
    expect(resolveRuntimeDir("/tmp/explicit")).toBe("/tmp/explicit");
  });

  test("takes AKAN_RUNTIME_DIR next, absolute", () => {
    process.env.AKAN_RUNTIME_DIR = "relative/runtime";
    expect(resolveRuntimeDir()).toBe(path.resolve(process.cwd(), "relative/runtime"));
  });

  test("lands beside the app in production and under local/ in dev", () => {
    delete process.env.AKAN_RUNTIME_DIR;
    process.env.AKAN_PUBLIC_APP_NAME = "minimal";
    process.env.NODE_ENV = "production";
    expect(resolveRuntimeDir()).toBe(path.resolve(process.cwd(), "runtime"));
    process.env.NODE_ENV = "development";
    expect(resolveRuntimeDir()).toBe(path.resolve(process.cwd(), "local", "apps", "minimal", "runtime"));
  });

  // The gateway writes child sockets here and a solo server writes the rotating log; switching between the
  // two modes must not move either, which is the only reason this resolution is shared rather than inlined.
  test("answers the same for the gateway and for a solo server", () => {
    delete process.env.AKAN_RUNTIME_DIR;
    process.env.NODE_ENV = "production";
    expect(resolveRuntimeDir(undefined)).toBe(resolveRuntimeDir());
  });
});
