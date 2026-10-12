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
