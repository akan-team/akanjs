import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { ServerBundleSecrets } from "./serverBundleSecrets";

const makeTempRoot = tempDirs("akan-devkit-server-bundle-secrets-");

const workspace = async () => {
  const root = await makeTempRoot();
  await write(
    path.join(root, "libs/util/env/env.server.testing.ts"),
    `export const env = { hostname: "lib-host", security: { jwtSecret: "lib-jwt-0123456789" }, iapVerify: { apple: "0f9e8d7c6b5a49382716abcdef012345", google: { type: "service_account", private_key: "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\\n-----END PRIVATE KEY-----\\n" } } };\n`,
  );
  await write(path.join(root, "libs/util/env/env.server.type.ts"), "export type Env = object;\n");
  await write(
    path.join(root, "apps/demo/env/env.server.main.ts"),
    'export const env = { mailer: { auth: { user: "ops", pass: "main-mail-pass" } } };\n',
  );
  const bundle = path.join(root, "bundle");
  return { root, appDir: path.join(root, "apps/demo"), bundle };
};

describe("ServerBundleSecrets", () => {
  test("passes a bundle that holds none of the workspace's secret values, constants of a credential block aside", async () => {
    const { root, appDir, bundle } = await workspace();
    await write(path.join(bundle, "server.js"), 'const t = "service_account"; const host = "lib-host";\n');
    await write(path.join(bundle, "node_modules/leaky/index.js"), 'const k = "lib-jwt-0123456789";\n');
    expect(await new ServerBundleSecrets(root, appDir).assertClean(bundle)).toEqual([]);
  });

  test("refuses one that does, naming the file, the env file and the key path and never the value", async () => {
    const { root, appDir, bundle } = await workspace();
    await write(
      path.join(bundle, "chunk-a.js"),
      'const e = { pass: "main-mail-pass", apple: "0f9e8d7c6b5a49382716abcdef012345" };\n',
    );
    await write(
      path.join(bundle, "chunk-b.js"),
      'const pem = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7";\n',
    );
    const error = await new ServerBundleSecrets(root, appDir).assertClean(bundle).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("chunk-a.js holds apps/demo/env/env.server.main.ts mailer.auth.pass");
    expect(message).toContain("chunk-a.js holds libs/util/env/env.server.testing.ts iapVerify.apple");
    expect(message).toContain("chunk-b.js holds libs/util/env/env.server.testing.ts iapVerify.google.private_key");
    for (const secret of ["main-mail-pass", "0f9e8d7c", "MIIEvQ"]) expect(message).not.toContain(secret);
  });

  test("passes a server whose vendor and lib code hold a token endpoint and a default password the env files hold too", async () => {
    const { root, appDir, bundle } = await workspace();
    await write(
      path.join(root, "libs/shared/env/env.server.testing.ts"),
      'export const env = { rootAdminInfo: { accountId: "admin@example.com", password: "admin1234" }, iapVerify: { google: { token_uri: "https://oauth2.googleapis.com/token" } } };\n',
    );
    await write(
      path.join(root, "libs/shared/lib/option.ts"),
      'export const rootAdmin = { accountId: "admin@mydomain.com", password: "admin1234" };\n',
    );
    await write(
      path.join(root, "libs/shared/env/env.server.example.ts"),
      'export const env = { pass: "main-mail-pass" };\n',
    );
    await write(path.join(bundle, "chunk-vendor.js"), 'const tokenUrl = "https://oauth2.googleapis.com/token";\n');
    await write(path.join(bundle, "chunk-shared.js"), 'const fallback = { password: "admin1234" };\n');
    expect(await new ServerBundleSecrets(root, appDir).assertClean(bundle)).toEqual([]);

    await write(path.join(bundle, "chunk-mail.js"), 'const pass = "main-mail-pass";\n');
    await expect(new ServerBundleSecrets(root, appDir).assertClean(bundle)).rejects.toThrow(
      "chunk-mail.js holds apps/demo/env/env.server.main.ts mailer.auth.pass",
    );
  });

  test("still refuses a long secret the code holds as well, a webhook and a URL's password", async () => {
    const { root, appDir, bundle } = await workspace();
    const hook = "https://hooks.slack.com/services/T0/B0/AbCdEf0123456789XyZ";
    await write(
      path.join(appDir, "env/env.server.develop.ts"),
      `export const env = { slack: { webhookUrl: "${hook}" }, database: { postgres: { url: "postgres://app:pg-pass-0123@db/app" } } };\n`,
    );
    await write(
      path.join(root, "libs/util/srvkit/fallback.ts"),
      `export const jwt = "lib-jwt-0123456789";\nexport const hook = "${hook}";\n`,
    );
    await write(
      path.join(bundle, "server.js"),
      `const jwt = "lib-jwt-0123456789"; const hook = "${hook}"; const pg = "postgres://app:" + (process.env.PG ?? "pg-pass-0123") + "@db/app";\n`,
    );
    const message = await new ServerBundleSecrets(root, appDir)
      .assertClean(bundle)
      .then(() => "")
      .catch((error: Error) => error.message);
    expect(message).toContain("server.js holds libs/util/env/env.server.testing.ts security.jwtSecret");
    expect(message).toContain("server.js holds apps/demo/env/env.server.develop.ts slack.webhookUrl");
    expect(message).toContain("server.js holds apps/demo/env/env.server.develop.ts database.postgres.url");
    expect(message).toContain(
      "A value a profile build still holds sits in code or a file the server carries: take it out there.",
    );
    for (const secret of ["lib-jwt-0123456789", "hooks.slack.com", "pg-pass-0123"])
      expect(message).not.toContain(secret);
  });

  test("finds a secret with non-ASCII characters in the bundle Bun printed, and in a file copied as UTF-8", async () => {
    const { root, appDir, bundle } = await workspace();
    const secrets = { pass: "pässwörd-ünïcode-1234", apiKey: `비밀 "it's" ${"😀"}-5678` };
    await write(
      path.join(appDir, "env/env.server.debug.ts"),
      `export const env = { mailer: ${JSON.stringify(secrets)} };\n`,
    );
    const source = path.join(root, "carried.ts");
    await write(source, `export const mailer = ${JSON.stringify(secrets)};\n`);
    const built = await Bun.build({ entrypoints: [source], outdir: bundle, target: "bun", minify: true });
    expect(built.success).toBe(true);
    expect(await Bun.file(path.join(bundle, "carried.js")).text()).not.toContain("ä");
    const message = await new ServerBundleSecrets(root, appDir)
      .assertClean(bundle)
      .then(() => "")
      .catch((error: Error) => error.message);
    expect(message).toContain("carried.js holds apps/demo/env/env.server.debug.ts mailer.pass");
    expect(message).toContain("carried.js holds apps/demo/env/env.server.debug.ts mailer.apiKey");

    await Bun.write(path.join(bundle, "carried.js"), "\n");
    await Bun.write(path.join(bundle, "settings.json"), JSON.stringify({ pass: secrets.pass }));
    await expect(new ServerBundleSecrets(root, appDir).assertClean(bundle)).rejects.toThrow(
      "settings.json holds apps/demo/env/env.server.debug.ts mailer.pass",
    );
  });

  test("names an env file it could not evaluate instead of passing it silently", async () => {
    const { root, appDir, bundle } = await workspace();
    await write(
      path.join(appDir, "env/env.server.develop.ts"),
      'import { gone } from "./missing";\nexport const env = gone;\n',
    );
    await write(path.join(bundle, "server.js"), "\n");
    expect(await new ServerBundleSecrets(root, appDir).assertClean(bundle)).toEqual([
      "apps/demo/env/env.server.develop.ts",
    ]);
  });
});
