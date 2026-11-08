import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger } from "akanjs/common";
import { LocalRegistryRunner } from "./localRegistry/localRegistry.runner";
import { getNpmRegistryUrl, npmRegistryFromEnv, warnIgnoredNpmRegistry } from "./npmRegistry";

const shellRegistry = "http://127.0.0.1:4900";

const inRepo = (dotenv: Record<string, string>, run: () => void) => {
  const repo = mkdtempSync(path.join(tmpdir(), "akan-npm-registry-"));
  const cwd = process.cwd();
  const had = process.env.AKAN_NPM_REGISTRY;
  try {
    for (const [name, content] of Object.entries(dotenv)) writeFileSync(path.join(repo, name), content);
    process.chdir(repo);
    process.env.AKAN_NPM_REGISTRY = shellRegistry;
    run();
  } finally {
    process.chdir(cwd);
    if (had === undefined) delete process.env.AKAN_NPM_REGISTRY;
    else process.env.AKAN_NPM_REGISTRY = had;
    rmSync(repo, { recursive: true, force: true });
  }
};

afterEach(() => {
  mock.restore();
});

describe("AKAN_NPM_REGISTRY", () => {
  test("a registry the repo's own dotenv file names is ignored, and the commands say so", () => {
    inRepo({ ".env.local": "AKAN_NPM_REGISTRY=http://127.0.0.1:4999\n" }, () => {
      const warn = spyOn(Logger, "warn").mockImplementation(() => undefined);
      expect(npmRegistryFromEnv()).toBeUndefined();
      expect(getNpmRegistryUrl()).toBe("https://registry.npmjs.org");
      expect(new LocalRegistryRunner().getRegistryUrl()).toBe("http://127.0.0.1:4873");
      warnIgnoredNpmRegistry();
      expect(warn.mock.calls.map(([line]) => line)).toEqual([
        "AKAN_NPM_REGISTRY is set in .env.local, which the repository controls, so it is ignored. Export it in your shell instead.",
      ]);
    });
  });

  test("a registry exported in the shell is used when no dotenv file names it", () => {
    inRepo({ ".env": "OTHER_KEY=placeholder\n" }, () => {
      const warn = spyOn(Logger, "warn").mockImplementation(() => undefined);
      expect(npmRegistryFromEnv()).toBe(shellRegistry);
      expect(getNpmRegistryUrl()).toBe(shellRegistry);
      expect(new LocalRegistryRunner().getRegistryUrl()).toBe(shellRegistry);
      warnIgnoredNpmRegistry();
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
