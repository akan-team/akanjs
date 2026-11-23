import { describe, expect, test } from "bun:test";
import path from "node:path";
import { SecretEnv } from "akanjs/server/lifecycle/secretEnv";
import { ServerBundleSecrets } from "../mobile/serverBundleSecrets";
import {
  computedSecretKeys,
  computedSecrets,
  holdsSentinel,
  secretEnvFixtureNames,
  secretEnvPlain,
  secretEnvSentinels,
  twinSecretEnv,
  twinSecrets,
  writeComputedSecretFixture,
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

const build = async (root: string, secrets?: "read", { mainExtra = "", overSwitch = false } = {}): Promise<Built> => {
  const { appDir, envDir } = await writeSecretEnvFixture(root, { mainExtra });
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
    const booted = boot(built.file, { AKAN_ENV_NAMES: list, ...values });
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

  test("the developer's own variable still outranks the one the build reads, and stands in for it at boot", async () => {
    const built = await build(await makeTempRoot(), "read");
    const { list, values } = await declare(built);
    expect(list).toContain(",POSTGRES_URL|DATABASE_URL");
    const own = { DATABASE_URL: "postgres://own.example.test/app" };
    const booted = boot(built.file, { AKAN_ENV_NAMES: list, ...values, ...own });
    expect(booted.env).toMatchObject({ database: { postgres: { url: "postgres://own.example.test/app" } } });
    const { POSTGRES_URL: _url, ...set } = values;
    const instead = boot(built.file, { AKAN_ENV_NAMES: list, ...set, ...own });
    expect({ exitCode: instead.exitCode, warnings: instead.warnings }).toEqual({ exitCode: 0, warnings: [] });
    expect(instead.env).toMatchObject({ database: { postgres: { url: "postgres://own.example.test/app" } } });
  });

  test("started without its variables, it exits non-zero, naming each one and no value", async () => {
    const built = await build(await makeTempRoot(), "read");
    const { list, values } = await declare(built);
    const { MAILER__AUTH__PASS: _pass, DISCORD__TOKENS: _tokens, ...set } = values;
    const booted = boot(built.file, { AKAN_ENV_NAMES: list, ...set });
    expect(booted.exitCode).not.toBe(0);
    expect(booted.env).toBeNull();
    expect(booted.warnings.join("\n")).toContain(
      "2 secret env values this server reads from its process env are not set, so it does not start: MAILER__AUTH__PASS, DISCORD__TOKENS. Its build left the values out of the image. Set them in the deployment's environment; `akan secret-env <app> --env main` lists every name and writes the values from the env file.",
    );
    expect(holdsSentinel(booted.warnings.join("\n"))).toBe(false);
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
    const booted = boot(renamed.file, { AKAN_ENV_NAMES: list, ...old.values });
    expect(booted.exitCode).not.toBe(0);
    expect(booted.warnings.join("\n")).toContain(
      "1 secret env value this server reads from its process env is not set, so it does not start: LLM__ACCESS_KEY.",
    );
    expect(holdsSentinel(booted.warnings.join("\n"))).toBe(false);
  });

  test("the env file a pipeline copies over the switch is read the same way", async () => {
    const built = await build(await makeTempRoot(), "read", { overSwitch: true });
    expect(holdsSentinel(built.text)).toBe(false);
    const { list, values } = await declare(built);
    expect(Object.keys(values)).toEqual(secretEnvFixtureNames);
    const booted = boot(built.file, { AKAN_ENV_NAMES: list, ...values });
    expect(booted.warnings).toEqual([]);
    expect(booted.env).toEqual((await evaluated(built)) as { [key: string]: unknown });
  });

  test("a secret the env file imports or computes stays in the built server, and the declaration names its key whatever the value's length", async () => {
    const root = await makeTempRoot();
    const { appDir, envDir } = await writeComputedSecretFixture(root);
    const entry = path.join(appDir, "server.ts");
    await writeText(entry, 'import { env } from "./env/env.server";\nconsole.info(JSON.stringify(env));\n');
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: path.join(root, "dist/apps/demo"),
      target: "bun",
      plugins: [createServerEnvPlugin({ envDir, environment: "main", environments, secrets: "read" })],
    });
    const text = (await result.outputs.find((artifact) => artifact.kind === "entry-point")?.text()) ?? "";
    expect(text).toContain(computedSecrets.password);
    expect(text).toContain(computedSecrets.passphrase);
    expect(text).toContain(computedSecrets.user);
    expect(text).not.toContain(secretEnvSentinels.jwt);
    const declared = await SecretEnvDeclaration.of(envDir, "main");
    expect(declared.unmoved).toEqual(computedSecretKeys);
    expect(declared.variables.map(({ name }) => name)).toEqual(secretEnvFixtureNames);
  });

  test("a secret string a plain key holds as well stays in the built server: a long mixed one stops the image check by both keys, a short one is a warning, and neither names the value", async () => {
    const built = await build(await makeTempRoot(), "read", { mainExtra: twinSecretEnv });
    for (const value of Object.values(twinSecrets)) expect(built.text).toContain(value);
    const { moved } = await SecretEnvDeclaration.of(built.envDir, "main");
    expect(moved.filter(({ twins }) => twins.length).map(({ path: at, name, twins }) => ({ at, name, twins }))).toEqual(
      [
        { at: "audit.password", name: "AUDIT__PASSWORD", twins: ["audit.label"] },
        { at: "cache.password", name: "CACHE__PASSWORD", twins: ["cache.name"] },
        { at: "door.secret", name: "DOOR__SECRET", twins: ["door.hint"] },
      ],
    );
    const secrets = new ServerBundleSecrets(built.root, built.appDir);
    const failure = await secrets.assertImageClean(built.outDir, moved).then(
      () => "",
      (error: Error) => error.message,
    );
    expect(failure).toStartWith(
      "The build holds secret values the server reads from its process env, so it stops here:\n  server.js holds the value of audit.password (AUDIT__PASSWORD), which the env's audit.label holds as well\nThe build left each out",
    );
    expect(holdsSentinel(failure)).toBe(false);
    const note = await secrets.assertImageClean(
      built.outDir,
      moved.filter(({ path: at }) => at !== "audit.password"),
    );
    expect(note).toBe(
      [
        "2 secret values the server reads from its process env are also in what this build wrote, short or plain enough to be there for another reason, so the build goes on:",
        "  cache.password (CACHE__PASSWORD): server.js; the env's cache.name holds the same string",
        "  door.secret (DOOR__SECRET): the env's door.hint holds the same string",
        "Where another key of the env or the app's code holds a secret's own string, the image holds it too: change one of the two.",
      ].join("\n"),
    );

    const clean = await build(await makeTempRoot(), "read");
    const declared = await SecretEnvDeclaration.of(clean.envDir, "main");
    expect(declared.moved.map(({ name }) => name)).toEqual([
      "JWT_SECRET",
      "SECURITY__SSO__GOOGLE__CLIENT_SECRET",
      "MAILER__AUTH__PASS",
      "OBJECT_STORAGE__ENDPOINT",
      "OBJECT_STORAGE__ENDPOINT",
      "DISCORD__TOKENS",
      "DISCORD__TOKENS",
      "DISCORD__WEBHOOK",
      "PUSH_NOTI__FIREBASE__PRIVATE_KEY",
      "MESSAGE__API_SECRET",
      "MESSAGE__SENDER_PASSWORD",
      "POSTGRES_URL",
      "POSTGRES_URL",
    ]);
    expect(await new ServerBundleSecrets(clean.root, clean.appDir).assertImageClean(clean.outDir, declared.moved)).toBe(
      null,
    );
  });

  test("a secret the env file reads from the process env itself stays that read in the built server, which holds no value the build's shell gave it", async () => {
    const shell = process.env.ZQ_API_KEY;
    process.env.ZQ_API_KEY = "shell-api-key-1d20";
    try {
      const built = await build(await makeTempRoot(), "read", {
        mainExtra: '\n  own: { apiKey: process.env.ZQ_API_KEY, hosts: process.env.ZQ_API_KEY!.split("-") },',
      });
      expect(built.text).toContain("apiKey: process.env.ZQ_API_KEY");
      expect(built.text).not.toContain("shell-api-key-1d20");
      const { list, values } = await declare(built);
      expect(list).not.toContain("OWN__");
      const booted = boot(built.file, { AKAN_ENV_NAMES: list, ...values, ZQ_API_KEY: "deployed-api-key" });
      expect(booted.warnings).toEqual([]);
      expect(booted.env?.own).toEqual({ apiKey: "deployed-api-key", hosts: ["deployed", "api", "key"] });
    } finally {
      if (shell === undefined) delete process.env.ZQ_API_KEY;
      else process.env.ZQ_API_KEY = shell;
    }
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
