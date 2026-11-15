import { describe, expect, test } from "bun:test";
import path from "node:path";
import { SecretEnv } from "akanjs/server/lifecycle/secretEnv";
import { ServerBundleSecrets } from "../mobile/serverBundleSecrets";
import {
  holdsSentinel,
  importedSecret,
  secretEnvFixtureNames,
  secretEnvPlain,
  secretEnvSentinels,
  writeImportedSecretFixture,
  writeSecretEnvFixture,
} from "../test/secretEnvFixture";
import { tempDirs, writeText } from "../test/testHelpers";
import { SecretEnvDeclaration } from "./secretEnvDeclaration";
import { createServerEnvPlugin } from "./serverEnvPlugin";
import { ServerEnvProfile } from "./serverEnvProfile";

const makeTempRoot = tempDirs("akan-devkit-server-env-secrets-");
const environments = ["local", "main"];
const secretEnvModule = Bun.resolveSync("akanjs/server/lifecycle/secretEnv", import.meta.dir);

interface Built {
  root: string;
  appDir: string;
  envDir: string;
  outDir: string;
  file: string;
  text: string;
}

const build = async (
  root: string,
  secrets?: "read" | "inline",
  { mainExtra = "", overSwitch = false, imported = false } = {},
): Promise<Built> => {
  const { appDir, envDir } = imported
    ? await writeImportedSecretFixture(root)
    : await writeSecretEnvFixture(root, { mainExtra });
  if (overSwitch)
    await writeText(path.join(envDir, "env.server.ts"), await Bun.file(path.join(envDir, "env.server.main.ts")).text());
  const entry = path.join(appDir, "server.ts");
  await writeText(
    entry,
    [
      `import { SecretEnv } from ${JSON.stringify(secretEnvModule)};`,
      'import { env } from "./env/env.server";',
      "SecretEnv.check({ warn: (message) => console.error(message) });",
      "console.info(JSON.stringify(env));",
      "",
    ].join("\n"),
  );
  const outDir = path.join(root, "dist/apps/demo");
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: outDir,
    target: "bun",
    plugins: [createServerEnvPlugin({ envDir, environment: "main", environments, secrets })],
  });
  const output = result.outputs.find((artifact) => artifact.kind === "entry-point");
  if (!output) throw new Error("no entry output");
  return { root, appDir, envDir, outDir, file: output.path, text: await output.text() };
};

const declare = async ({ envDir }: Built) => {
  const { variables } = await SecretEnvDeclaration.of(envDir, "main");
  return {
    list: SecretEnv.format(variables),
    values: Object.fromEntries(variables.map((each) => [each.name, each.value])),
  };
};

const boot = (file: string, env: { [name: string]: string }) => {
  const proc = Bun.spawnSync([process.execPath, file], {
    env: { PATH: process.env.PATH ?? "", AKAN_PUBLIC_ENV: "main", ...env },
  });
  const stdout = proc.stdout.toString();
  return {
    exitCode: proc.exitCode,
    env: stdout ? (JSON.parse(stdout) as { [key: string]: unknown }) : null,
    warnings: proc.stderr.toString().split("\n").filter(Boolean),
  };
};

const evaluated = ({ envDir, appDir }: Built) =>
  ServerEnvProfile.evaluate(path.join(envDir, "env.server.ts"), appDir, undefined, { environment: "main" });

describe("createServerEnvPlugin for an image", () => {
  test("the built server holds no secret of the workspace's env files, a lib's defaults included, and every plain value", async () => {
    const built = await build(await makeTempRoot(), "read");
    expect(holdsSentinel(built.text)).toBe(false);
    for (const plain of Object.values(secretEnvPlain)) expect(built.text).toContain(plain);
    expect(built.text).toContain("noreply@example.test");
    expect(await new ServerBundleSecrets(built.root, built.appDir).assertClean(built.outDir)).toEqual([]);
  });

  test("started with the variables its env file maps to, it runs on the env that file evaluates to, and warns of nothing", async () => {
    const built = await build(await makeTempRoot(), "read");
    const { list, values } = await declare(built);
    const booted = boot(built.file, { AKAN_SECRET_ENV: list, ...values });
    expect(booted.exitCode).toBe(0);
    expect(booted.warnings).toEqual([]);
    expect(booted.env).toEqual((await evaluated(built)) as { [key: string]: unknown });
    expect(booted.env).toMatchObject({
      security: { jwtSecret: secretEnvSentinels.jwt },
      mailer: { auth: { pass: secretEnvSentinels.libPass } },
      discord: { tokens: secretEnvSentinels.bots },
      pushNoti: { firebase: { private_key: secretEnvSentinels.pem } },
    });
  });

  test("the developer's own variable still outranks the one the build reads", async () => {
    const built = await build(await makeTempRoot(), "read");
    const { list, values } = await declare(built);
    const booted = boot(built.file, {
      AKAN_SECRET_ENV: list,
      ...values,
      DATABASE_URL: "postgres://own.example.test/app",
    });
    expect(booted.env).toMatchObject({ database: { postgres: { url: "postgres://own.example.test/app" } } });
  });

  test("started without its variables, it names each one in a single warning and runs without them", async () => {
    const built = await build(await makeTempRoot(), "read");
    const { list, values } = await declare(built);
    const { MAILER__AUTH__PASS: _pass, DISCORD__TOKENS: _tokens, ...set } = values;
    const booted = boot(built.file, { AKAN_SECRET_ENV: list, ...set });
    expect(booted.exitCode).toBe(0);
    expect(booted.warnings).toEqual([
      "2 secret env values this server declares are not set: MAILER__AUTH__PASS, DISCORD__TOKENS. It runs without them, and akanjs 3.5.0 will refuse to boot. Set them in the deployment's environment; `akan secret-env <app> --env main` lists every name.",
    ]);
    expect(booted.env).toMatchObject({ mailer: { address: "noreply@example.test", auth: { user: "mailer" } } });
    expect((booted.env?.mailer as { auth: object } | undefined)?.auth).not.toHaveProperty("pass");
    expect(booted.env?.discord).not.toHaveProperty("tokens");
  });

  test("after a key is renamed in the env file, a deployment still setting the old variable is told the new name", async () => {
    const before = await build(await makeTempRoot(), "read", {
      mainExtra: '\n  llm: { apiKey: "sentinel-llm-1c95" },',
    });
    const old = await declare(before);
    expect(old.values.LLM__API_KEY).toBe("sentinel-llm-1c95");
    const renamed = await build(await makeTempRoot(), "read", {
      mainExtra: '\n  llm: { accessKey: "sentinel-llm-1c95" },',
    });
    const { list } = await declare(renamed);
    const booted = boot(renamed.file, { AKAN_SECRET_ENV: list, ...old.values });
    expect(booted.warnings).toEqual([
      "1 secret env value this server declares is not set: LLM__ACCESS_KEY. It runs without it, and akanjs 3.5.0 will refuse to boot. Set it in the deployment's environment; `akan secret-env <app> --env main` lists every name.",
    ]);
    expect(booted.env?.llm).toEqual({});
  });

  test("an --inline-secrets build keeps the values as what an unset variable falls back to, and a set one wins", async () => {
    const built = await build(await makeTempRoot(), "inline");
    expect(built.text).toContain(secretEnvSentinels.jwt);
    const { list } = await declare(built);
    const fallback = boot(built.file, { AKAN_SECRET_ENV: list, AKAN_SECRET_ENV_FALLBACK: "image" });
    expect(fallback.env).toEqual((await evaluated(built)) as { [key: string]: unknown });
    expect(fallback.warnings).toHaveLength(1);
    expect(fallback.warnings[0]).toStartWith(
      "10 secret env values this server declares are not set, so it uses the values built into this image (akan build --inline-secrets): JWT_SECRET, ",
    );
    const overridden = boot(built.file, {
      AKAN_SECRET_ENV: list,
      AKAN_SECRET_ENV_FALLBACK: "image",
      JWT_SECRET: "set-by-the-deployment",
      DISCORD__TOKENS: '["set-by-the-deployment"]',
    });
    expect(overridden.env).toMatchObject({
      security: { jwtSecret: "set-by-the-deployment", sso: { google: { clientSecret: secretEnvSentinels.google } } },
      discord: { tokens: ["set-by-the-deployment"], webhook: secretEnvSentinels.webhook },
    });
  });

  test("the env file a pipeline copies over the switch is read the same way", async () => {
    const built = await build(await makeTempRoot(), "read", { overSwitch: true });
    expect(holdsSentinel(built.text)).toBe(false);
    const { list, values } = await declare(built);
    expect(Object.keys(values)).toEqual(secretEnvFixtureNames);
    const booted = boot(built.file, { AKAN_SECRET_ENV: list, ...values });
    expect(booted.warnings).toEqual([]);
    expect(booted.env).toEqual((await evaluated(built)) as { [key: string]: unknown });
  });

  test("a secret the env file imports stays in the built server, which the image check refuses by file and key alone", async () => {
    const built = await build(await makeTempRoot(), "read", { imported: true });
    expect(built.text).toContain(importedSecret);
    expect(built.text).not.toContain(secretEnvSentinels.jwt);
    const { held, unmoved } = await SecretEnvDeclaration.of(built.envDir, "main");
    expect(unmoved).toEqual(["llm.apiKey"]);
    const failure = await new ServerBundleSecrets(built.root, built.appDir)
      .assertImageClean(built.outDir, path.join(built.envDir, "env.server.ts"), held)
      .then(
        () => "",
        (error: Error) => error.message,
      );
    expect(failure).toBe(
      [
        "The build holds secret values of the server env (apps/demo/env/env.server.ts), so it stops here:",
        "  server.js holds llm.apiKey",
        "The env file computes or imports each of them, so the build could not turn it into a read from the process env. Write `process.env.<NAME>` there and set that variable where the server is deployed, or build with --inline-secrets, which akanjs 3.5.0 removes.",
      ].join("\n"),
    );
    expect(holdsSentinel(failure)).toBe(false);

    const clean = await build(await makeTempRoot(), "read");
    const declared = await SecretEnvDeclaration.of(clean.envDir, "main");
    await new ServerBundleSecrets(clean.root, clean.appDir).assertImageClean(
      clean.outDir,
      path.join(clean.envDir, "env.server.ts"),
      declared.held,
    );
  });

  test("without the setting, as for the server a desktop app carries, the env files are bundled as written", async () => {
    const built = await build(await makeTempRoot());
    expect(built.text).toContain(secretEnvSentinels.jwt);
    expect(built.text).toContain(secretEnvSentinels.libPass);
    expect(built.text).not.toContain("SecretEnv.read(");
    const booted = boot(built.file, {});
    expect(booted.warnings).toEqual([]);
    expect(booted.env).toEqual((await evaluated(built)) as { [key: string]: unknown });
  });
});
