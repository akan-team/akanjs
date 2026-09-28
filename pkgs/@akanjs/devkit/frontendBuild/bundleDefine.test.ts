import { describe, expect, test } from "bun:test";
import type { App } from "../commandDecorators";
import { bundleDefine } from "./bundleDefine";

describe("bundleDefine", () => {
  test("spells the public env in one order whatever order the process holds it in", () => {
    const appWith = (env: Record<string, string>) => ({ getPublicEnv: () => env }) as unknown as App;
    const builder = bundleDefine(appWith({ AKAN_PUBLIC_Z: "1", AKAN_PUBLIC_A: "2" }), "start", "ssr");
    const worker = bundleDefine(appWith({ AKAN_PUBLIC_A: "2", AKAN_PUBLIC_Z: "1" }), "start", "ssr");
    expect(JSON.stringify(builder)).toBe(JSON.stringify(worker));
  });
});
