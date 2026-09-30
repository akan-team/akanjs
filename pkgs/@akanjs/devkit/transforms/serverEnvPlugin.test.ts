import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { createServerEnvPlugin } from "./serverEnvPlugin";

const makeTempRoot = tempDirs("akan-devkit-server-env-");
const environments = ["local", "testing", "debug", "develop", "main", "qa"];

const writeApp = async (root: string) => {
  const envDir = path.join(root, "apps/demo/env");
  await write(
    path.join(envDir, "env.server.ts"),
    [
      ...environments.map((name) => `import { env as ${name} } from "./env.server.${name}";`),
      `const envConfigs = { ${environments.join(", ")} };`,
      'const currentEnv = process.env.AKAN_PUBLIC_ENV ?? "local";',
      "export const env = envConfigs[currentEnv as keyof typeof envConfigs];",
      "",
    ].join("\n"),
  );
  await write(path.join(envDir, "env.server.type.ts"), 'export const libEnv = { shared: "shared-value" };\n');
  for (const name of environments)
    await write(
      path.join(envDir, `env.server.${name}.ts`),
      [
        'import { libEnv } from "./env.server.type";',
        `export const env = { ...libEnv, secret: "${name}-secret" };`,
        `export default "${name}-default";`,
        "",
      ].join("\n"),
    );
  const entry = path.join(root, "apps/demo/server.ts");
  await write(entry, 'import { env } from "./env/env.server";\nconsole.info(JSON.stringify({ ...env }));\n');
  return { envDir, entry };
};

const build = async (root: string, environment: string) => {
  const { envDir, entry } = await writeApp(root);
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: path.join(root, "out"),
    target: "bun",
    plugins: [createServerEnvPlugin({ envDir, environment, environments })],
  });
  expect(result.success).toBe(true);
  const output = result.outputs.find((artifact) => artifact.kind === "entry-point");
  if (!output) throw new Error("no entry output");
  return { file: output.path, text: await output.text() };
};

const run = (file: string, environment: string) =>
  Bun.spawnSync([process.execPath, file], { env: { ...process.env, AKAN_PUBLIC_ENV: environment } });

describe("createServerEnvPlugin", () => {
  test("bundles only the environment the image runs", async () => {
    const { text } = await build(await makeTempRoot(), "main");
    expect(text).toContain("main-secret");
    expect(text).toContain("shared-value");
    for (const name of environments.filter((name) => name !== "main")) {
      expect(text).not.toContain(`${name}-secret`);
      expect(text).not.toContain(`${name}-default`);
    }
  });

  test("the built environment boots with its own values", async () => {
    const { file } = await build(await makeTempRoot(), "main");
    const proc = run(file, "main");
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(proc.stdout.toString())).toEqual({ shared: "shared-value", secret: "main-secret" });
  });

  test("another environment refuses to boot and names the build to make", async () => {
    const { file } = await build(await makeTempRoot(), "main");
    const proc = run(file, "develop");
    expect(proc.exitCode).not.toBe(0);
    expect(proc.stderr.toString()).toContain(
      "env/env.server.develop.ts is not in this build: `akan build` bundles the server env of AKAN_PUBLIC_ENV=main alone",
    );
    expect(proc.stderr.toString()).toContain(
      "To run develop, build for it: AKAN_PUBLIC_ENV=develop in the workspace's .env, which outranks the shell, or --env develop on a desktop or mobile build.",
    );
  });

  test("a custom branch is its own environment", async () => {
    const { text } = await build(await makeTempRoot(), "qa");
    expect(text).toContain("qa-secret");
    expect(text).not.toContain("main-secret");
  });

  test("leaves env files outside the app's env directory alone", async () => {
    const root = await makeTempRoot();
    const other = path.join(root, "libs/shared/env/env.server.testing.ts");
    await write(other, 'export const env = { secret: "lib-testing-secret" };\n');
    const { envDir, entry } = await writeApp(root);
    await write(entry, `import { env } from ${JSON.stringify(other)};\nconsole.info(env.secret);\n`);
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      plugins: [createServerEnvPlugin({ envDir, environment: "main", environments })],
    });
    expect(await result.outputs[0]?.text()).toContain("lib-testing-secret");
  });
});
