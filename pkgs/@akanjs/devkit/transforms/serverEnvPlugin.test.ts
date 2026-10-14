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

const build = async (root: string, environment: string, profile?: string) => {
  const { envDir, entry } = await writeApp(root);
  if (profile)
    await write(
      path.join(envDir, `env.server.${environment}.${profile}.ts`),
      [
        'import { libEnv } from "./env.server.type";',
        `export const env = { ...libEnv, origin: "${environment}-${profile}-origin" };`,
        "",
      ].join("\n"),
    );
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: path.join(root, "out"),
    target: "bun",
    plugins: [createServerEnvPlugin({ envDir, environment, environments, profile })],
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

  test("a profile bundles its own file in place of the environment's, which never enters the bundle", async () => {
    const { file, text } = await build(await makeTempRoot(), "main", "edge");
    expect(text).toContain("main-edge-origin");
    expect(text).not.toContain("main-secret");
    const proc = run(file, "main");
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(proc.stdout.toString())).toEqual({ shared: "shared-value", origin: "main-edge-origin" });
  });

  test("a profile carries a lib's env defaults without their secrets, and still stubs the app's other environments", async () => {
    const root = await makeTempRoot();
    const libEnv = path.join(root, "libs/shared/env/env.server.testing.ts");
    await write(
      libEnv,
      'export const env = { hostname: "lib-host", ttl: 30, security: { jwtSecret: "lib-jwt", accessTokenSeconds: 900 }, mailer: { auth: { user: "mailer-user", pass: "lib-pass" } }, cloudflare: { authKey: "lib-cf" } };\n',
    );
    const { envDir, entry } = await writeApp(root);
    await write(path.join(envDir, "env.server.main.edge.ts"), 'export const env = { origin: "edge" };\n');
    await write(
      entry,
      `import { env as app } from "./env/env.server";\nimport { env as lib } from ${JSON.stringify(libEnv)};\nconsole.info(JSON.stringify({ app, lib }));\n`,
    );
    const reports: unknown[] = [];
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: path.join(root, "out"),
      target: "bun",
      plugins: [
        createServerEnvPlugin({
          envDir,
          environment: "main",
          environments,
          profile: "edge",
          onLibEnv: (file, report) => reports.push({ file: path.basename(file), ...report }),
        }),
      ],
    });
    expect(result.success).toBe(true);
    const output = result.outputs.find((artifact) => artifact.kind === "entry-point");
    const text = (await output?.text()) ?? "";
    for (const secret of ["lib-jwt", "lib-pass", "lib-cf", "develop-secret", "main-secret"])
      expect(text).not.toContain(secret);
    expect(reports).toEqual([
      {
        file: "env.server.testing.ts",
        profileFile: false,
        stripped: ["security.jwtSecret", "mailer.auth.pass", "cloudflare.authKey"],
      },
    ]);
    const proc = run(output?.path ?? "", "main");
    expect(JSON.parse(proc.stdout.toString()).lib).toEqual({
      hostname: "lib-host",
      ttl: 30,
      security: { accessTokenSeconds: 900 },
      mailer: { auth: { user: "mailer-user" } },
      cloudflare: {},
    });
  });

  test("a lib's own profile file is bundled in place of its defaults, and refused when it holds a secret", async () => {
    const root = await makeTempRoot();
    const libEnv = path.join(root, "libs/util/env/env.server.testing.ts");
    await write(libEnv, 'export const env = { hostname: "lib-host", security: { jwtSecret: "lib-jwt" } };\n');
    const edgeEnv = path.join(root, "libs/util/env/env.server.testing.edge.ts");
    await write(edgeEnv, 'export const env = { hostname: "lib-edge-host" };\n');
    const { envDir, entry } = await writeApp(root);
    await write(path.join(envDir, "env.server.main.edge.ts"), "export const env = {};\n");
    await write(entry, `import { env } from ${JSON.stringify(libEnv)};\nconsole.info(JSON.stringify(env));\n`);
    const plugin = () => createServerEnvPlugin({ envDir, environment: "main", environments, profile: "edge" });
    const ok = await Bun.build({ entrypoints: [entry], target: "bun", plugins: [plugin()] });
    expect(ok.success).toBe(true);
    const text = (await ok.outputs[0]?.text()) ?? "";
    expect(text).toContain("lib-edge-host");
    expect(text).not.toContain("lib-jwt");

    await write(edgeEnv, 'export const env = { mailer: { pass: "edge-pass" } };\n');
    const refused = await Bun.build({ entrypoints: [entry], target: "bun", plugins: [plugin()], throw: false });
    expect(refused.success).toBe(false);
    expect(refused.logs.map((log) => log.message).join("\n")).toContain("holds secret-named values");
    expect(refused.logs.map((log) => log.message).join("\n")).toContain("mailer.pass");
  });

  test("refuses a profile, the app's or a lib's, that imports the file it is bundled in place of", async () => {
    const root = await makeTempRoot();
    const { envDir, entry } = await writeApp(root);
    const profileFile = path.join(envDir, "env.server.main.edge.ts");
    await write(
      profileFile,
      'import { env as main } from "./env.server.main";\nexport const env = { hostname: main.secret };\n',
    );
    const plugin = () => createServerEnvPlugin({ envDir, environment: "main", environments, profile: "edge" });
    const refused = await Bun.build({ entrypoints: [entry], target: "bun", plugins: [plugin()], throw: false });
    expect(refused.success).toBe(false);
    expect(refused.logs.map((log) => log.message).join("\n")).toContain(
      'env.server.main.edge.ts imports ./env.server.main, the file a "edge" build bundles it in place of, so it would import itself.',
    );

    await write(profileFile, 'export const env = { origin: "edge" };\n');
    const libEnv = path.join(root, "libs/util/env/env.server.testing.ts");
    await write(libEnv, 'export const env = { hostname: "lib-host" };\n');
    await write(
      path.join(root, "libs/util/env/env.server.testing.edge.ts"),
      'import { env as base } from "./env.server.testing";\nexport const env = { hostname: base.hostname };\n',
    );
    await write(entry, `import { env } from ${JSON.stringify(libEnv)};\nconsole.info(JSON.stringify(env));\n`);
    const lib = await Bun.build({ entrypoints: [entry], target: "bun", plugins: [plugin()], throw: false });
    expect(lib.success).toBe(false);
    expect(lib.logs.map((log) => log.message).join("\n")).toContain(
      "env.server.testing.edge.ts imports ./env.server.testing, the file",
    );
  });

  test("refuses to carry as JSON a lib's env defaults that JSON would change, naming them and the file to give", async () => {
    const root = await makeTempRoot();
    const libEnv = path.join(root, "libs/util/env/env.server.testing.ts");
    await write(
      libEnv,
      'export const env = { hostname: "lib-host", startedAt: new Date(0), hosts: new Set(["a"]), onCleanup: async () => undefined, nested: { at: new Map() } };\n',
    );
    const { envDir, entry } = await writeApp(root);
    await write(path.join(envDir, "env.server.main.edge.ts"), "export const env = {};\n");
    await write(entry, `import { env } from ${JSON.stringify(libEnv)};\nconsole.info(JSON.stringify(env));\n`);
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      plugins: [createServerEnvPlugin({ envDir, environment: "main", environments, profile: "edge" })],
      throw: false,
    });
    expect(result.success).toBe(false);
    const message = result.logs.map((log) => log.message).join("\n");
    expect(message).toContain(
      `${libEnv} holds startedAt, hosts, onCleanup, nested.at, which a "edge" build cannot carry`,
    );
    expect(message).toContain("Give the lib env.server.testing.edge.ts.");
  });

  test("a lib env that cannot be evaluated stops a profile build, which prints no line of it", async () => {
    const root = await makeTempRoot();
    const libEnv = path.join(root, "libs/util/env/env.server.testing.ts");
    await write(
      libEnv,
      'export const env = {\n  security: { jwtSecret: "lib-jwt-dummy-0123" },\n  x: undefinedVar.y,\n};\n',
    );
    const { envDir, entry } = await writeApp(root);
    await write(path.join(envDir, "env.server.main.edge.ts"), "export const env = {};\n");
    await write(entry, `import { env } from ${JSON.stringify(libEnv)};\nconsole.info(JSON.stringify(env));\n`);
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      plugins: [createServerEnvPlugin({ envDir, environment: "main", environments, profile: "edge" })],
      throw: false,
    });
    expect(result.success).toBe(false);
    const printed = result.logs.map((log) => `${log.message}\n${log.position?.lineText ?? ""}`).join("\n");
    expect(printed).toContain("ReferenceError: undefinedVar is not defined");
    expect(printed).not.toContain("lib-jwt-dummy-0123");
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
