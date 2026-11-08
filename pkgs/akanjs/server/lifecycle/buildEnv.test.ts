import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyBuildEnv, BUILD_ENV_FILE } from "./buildEnv";

const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

const makeBuild = (env: Record<string, string>) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "akan-build-env-"));
  tempRoots.push(dir);
  writeFileSync(path.join(dir, BUILD_ENV_FILE), JSON.stringify(env));
  return dir;
};

describe("applyBuildEnv", () => {
  test("fills in what the process lacks and keeps every variable it was started with, an empty one included", () => {
    const dir = makeBuild({
      PORT: "8282",
      AKAN_PUBLIC_APP_NAME: "portal",
      AKAN_LOG_TO_FILE: "0",
      NODE_ENV: "production",
    });
    const env: NodeJS.ProcessEnv = { PORT: "3100", AKAN_LOG_TO_FILE: "" };
    applyBuildEnv(dir, env);
    expect(env).toEqual({ PORT: "3100", AKAN_LOG_TO_FILE: "", AKAN_PUBLIC_APP_NAME: "portal", NODE_ENV: "production" });
  });

  test("leaves the env alone beside an entry no build wrote", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "akan-build-env-"));
    tempRoots.push(dir);
    const env: NodeJS.ProcessEnv = { PORT: "3100" };
    applyBuildEnv(dir, env);
    expect(env).toEqual({ PORT: "3100" });
  });
});

describe("AkanApp", () => {
  test("a built main.js run from another folder boots with its build's env, under what the host set", async () => {
    const dir = makeBuild({ PORT: "8282", AKAN_PUBLIC_APP_NAME: "portal", AKAN_PUBLIC_ENV: "main" });
    const entry = path.join(dir, "main.ts");
    writeFileSync(
      entry,
      `import { AkanApp } from ${JSON.stringify(path.resolve(import.meta.dir, "../akanApp.ts"))};
const { PORT, AKAN_PUBLIC_APP_NAME, AKAN_PUBLIC_ENV } = process.env;
console.info(JSON.stringify({ gateway: typeof AkanApp, PORT, AKAN_PUBLIC_APP_NAME, AKAN_PUBLIC_ENV }));
`,
    );
    const proc = Bun.spawn([process.execPath, "--no-env-file", entry], {
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "3100" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(JSON.parse(stdout.trim().split("\n").at(-1) ?? "null")).toEqual({
      gateway: "function",
      PORT: "3100",
      AKAN_PUBLIC_APP_NAME: "portal",
      AKAN_PUBLIC_ENV: "main",
    });
  });
});
