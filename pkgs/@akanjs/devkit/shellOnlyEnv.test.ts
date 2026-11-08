import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ShellOnlyEnv } from "./shellOnlyEnv";

const key = "AKAN_SHELL_ONLY_TEST_KEY";
const shellValue = "from-shell";

const inRepo = (files: Record<string, string>, run: (env: ShellOnlyEnv<typeof key>) => void) => {
  const repo = mkdtempSync(path.join(tmpdir(), "akan-shell-only-env-"));
  const cwd = process.cwd();
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(path.join(repo, name), content);
    process.chdir(repo);
    process.env[key] = shellValue;
    run(new ShellOnlyEnv([key]));
  } finally {
    process.chdir(cwd);
    delete process.env[key];
    rmSync(repo, { recursive: true, force: true });
  }
};

describe("ShellOnlyEnv", () => {
  test.each([
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
    ".env.test",
    ".env.test.local",
  ])("ignores a key that %s names", (file) => {
    inRepo({ [file]: `${key}=placeholder\n` }, (env) => {
      expect(env.get(key)).toBeUndefined();
      expect(env.ignored()).toEqual([
        `${key} is set in ${file}, which the repository controls, so it is ignored. Export it in your shell instead.`,
      ]);
    });
  });

  test.each([
    `${key}=placeholder`,
    `export ${key}=placeholder`,
    `  ${key} = placeholder`,
    `${key}: placeholder`,
    `export ${key}: placeholder`,
    `${key}\t:\tplaceholder`,
    `${key}:`,
    `${key}=placeholder\r`,
  ])("ignores a key set as %j", (line) => {
    inRepo({ ".env": `OTHER_KEY=placeholder\n${line}\n` }, (env) => {
      expect(env.get(key)).toBeUndefined();
    });
  });

  test("reads the shell value when no dotenv file names the key", () => {
    inRepo({ ".env": `OTHER_KEY=placeholder\n# ${key}=placeholder\n${key}_SUFFIX=placeholder\n` }, (env) => {
      expect(env.get(key)).toBe(shellValue);
      expect(env.ignored()).toEqual([]);
    });
  });
});
