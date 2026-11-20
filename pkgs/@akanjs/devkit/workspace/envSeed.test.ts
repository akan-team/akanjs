import { describe, expect, test } from "bun:test";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { EnvSeed } from "./envSeed";

const makeEnvDir = tempDirs("akan-env-seed-");
const templates = path.resolve(import.meta.dir, "../../cli/templates");
const template = async (file: string) => await readFile(path.join(templates, file), "utf8");

const selector = (side: "server" | "client", names: string[]) =>
  `${names.map((name) => `import { env as ${name} } from "./env.${side}.${name}";`).join("\n")}\n\nexport const env = { ${names.join(", ")} };\n`;

const seededIn = async (envDir: string) =>
  Object.fromEntries((await new EnvSeed(envDir).missing()).map(({ fileName, content }) => [fileName, content]));

describe("EnvSeed", () => {
  test("names each environment file the selectors import and the testing one, of those missing", async () => {
    const envDir = await makeEnvDir();
    await writeText(path.join(envDir, "env.server.ts"), selector("server", ["debug", "local"]));
    await writeText(path.join(envDir, "env.client.ts"), selector("client", ["local", "staging"]));
    await writeText(path.join(envDir, "env.server.debug.ts"), "export const env = { kept: true };\n");

    expect(Object.keys(await seededIn(envDir))).toEqual([
      "env.client.local.ts",
      "env.client.staging.ts",
      "env.server.local.ts",
      "env.server.testing.ts",
    ]);
  });

  test("passes over the generated type, the tracked example and a build profile", async () => {
    const envDir = await makeEnvDir();
    await writeText(
      path.join(envDir, "env.server.ts"),
      [
        'import { libEnv } from "./env.server.type";',
        'import { env as example } from "./env.server.example";',
        'import { env as desktop } from "./env.server.debug.desktop";',
        "",
        "export const env = { ...libEnv, ...example, ...desktop };",
        "",
      ].join("\n"),
    );

    expect(Object.keys(await seededIn(envDir))).toEqual(["env.server.testing.ts"]);
  });

  test("writes what the app scaffold writes when the folder has no example", async () => {
    const envDir = await makeEnvDir();
    await writeText(path.join(envDir, "env.server.ts"), selector("server", ["local", "testing"]));
    await writeText(path.join(envDir, "env.client.ts"), selector("client", ["local"]));
    await writeText(path.join(envDir, "env.client.type.ts"), "export type AppClientEnv = Record<never, never>;\n");

    expect(await seededIn(envDir)).toEqual({
      "env.client.local.ts": await template("app/env/env.client.local.ts.template"),
      "env.server.local.ts": await template("app/env/env.server.local.ts.template"),
      "env.server.testing.ts": await template("app/env/env.server.testing.ts.template"),
    });
  });

  test("copies the side's tracked example into each of its files", async () => {
    const envDir = await makeEnvDir();
    const example =
      'import type { ModulesOptions } from "../lib/option";\n\nexport const env: ModulesOptions = { port: 1 };\n';
    await writeText(path.join(envDir, "env.server.ts"), selector("server", ["local"]));
    await writeText(path.join(envDir, "env.server.example.ts"), example);

    expect(await seededIn(envDir)).toEqual({ "env.server.local.ts": example, "env.server.testing.ts": example });
  });

  test("in a linked worktree, copies the main checkout's file of the same path and seeds only what that lacks", async () => {
    const root = await realpath(await makeEnvDir());
    const main = path.join(root, "main");
    const worktree = path.join(root, "linked");
    const gitDir = path.join(main, ".git/worktrees/linked");
    await writeText(path.join(gitDir, "commondir"), "../..\n");
    await writeText(path.join(worktree, ".git"), `gitdir: ${gitDir}\n`);
    const held =
      'import type { ModulesOptions } from "../lib/option";\n\nexport const env: ModulesOptions = { port: 7 };\n';
    await writeText(path.join(main, "apps/portal/env/env.server.local.ts"), held);
    const envDir = path.join(worktree, "apps/portal/env");
    await writeText(path.join(envDir, "env.server.ts"), selector("server", ["local"]));

    const seeded = await new EnvSeed(envDir).missing();

    expect(seeded).toEqual([
      {
        fileName: "env.server.local.ts",
        content: held,
        copiedFrom: path.join(main, "apps/portal/env/env.server.local.ts"),
      },
      { fileName: "env.server.testing.ts", content: await template("app/env/env.server.testing.ts.template") },
    ]);
    expect(EnvSeed.notices(seeded)).toEqual([
      `env/env.server.local.ts were missing in this worktree (gitignored, so a worktree has none) and now hold a copy of the main checkout's, from ${path.join(main, "apps/portal/env")}: a later change there does not reach the copy.`,
      "env/env.server.testing.ts were missing (gitignored, so a clone has none) and now hold local defaults: put this machine's values in them, or fetch the team's with `akan download-env`.",
    ]);
  });

  test("leaves a client env untyped when the folder has no env.client.type.ts to type it", async () => {
    const envDir = await makeEnvDir();
    await writeText(path.join(envDir, "env.client.ts"), selector("client", ["local"]));

    expect((await seededIn(envDir))["env.client.local.ts"]).toBe("export const env = {};\n");
  });

  test("gives a lib its testing env from the example the lib scaffold tracks", async () => {
    const envDir = await makeEnvDir();
    await writeText(
      path.join(envDir, "env.server.example.ts"),
      await template("libRoot/env/env.server.example.ts.template"),
    );

    expect(await seededIn(envDir)).toEqual({
      "env.server.testing.ts": await template("libRoot/env/env.server.testing.ts.template"),
    });
  });
});
