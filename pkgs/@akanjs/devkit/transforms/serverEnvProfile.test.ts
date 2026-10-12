import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { ServerEnvProfile } from "./serverEnvProfile";

const makeTempRoot = tempDirs("akan-devkit-server-env-profile-");

const writeProfile = async (body: string) => {
  const envDir = path.join(await makeTempRoot(), "apps/demo/env");
  await write(path.join(envDir, "env.server.main.edge.ts"), body);
  return envDir;
};

describe("ServerEnvProfile.secretPaths", () => {
  test("names every secret-named key holding a string, and every string beneath one", () => {
    expect(
      ServerEnvProfile.secretPaths({
        hostname: "edge.example.com",
        security: { jwtSecret: "s", sso: { google: { clientID: "id", clientSecret: "cs" } } },
        llm: { model: "m", apiKey: "k" },
        slack: { webhookUrl: "https://hooks" },
        privateKey: { pem: "-----BEGIN" },
        nvrAuth: { id: "admin", password: "" },
        enrollKey: "fleet",
        security2: { verifies: [["password", "phone"]] },
        mailer: { auth: { user: "u", pass: "p" } },
        cloudflare: { authEmail: "e", authKey: "k" },
        iapVerify: { apple: "shared", google: { client_email: "c" } },
      }),
    ).toEqual([
      "security.jwtSecret",
      "security.sso.google.clientSecret",
      "llm.apiKey",
      "slack.webhookUrl",
      "privateKey.pem",
      "mailer.auth.pass",
      "cloudflare.authKey",
      "iapVerify.apple",
      "iapVerify.google.client_email",
    ]);
  });
});

describe("ServerEnvProfile.assertShippable", () => {
  test("passes a profile with no secret in it", async () => {
    const envDir = await writeProfile('export const env = { hostname: "edge", cloudOrigin: "https://cloud" };\n');
    await expect(ServerEnvProfile.assertShippable({ envDir, environment: "main", profile: "edge" })).resolves.toBe(
      undefined,
    );
  });

  test("refuses a literal fallback the bundle would carry, even when the build's shell sets the variable", async () => {
    const envDir = await writeProfile(
      'export const env = { security: { jwtSecret: process.env.EDGE_JWT_SECRET ?? "fallback" } };\n',
    );
    process.env.EDGE_JWT_SECRET = "from-the-shell";
    try {
      await expect(ServerEnvProfile.assertShippable({ envDir, environment: "main", profile: "edge" })).rejects.toThrow(
        "env/env.server.main.edge.ts holds secret-named values, which a profile's bundle carries to every computer it runs on: security.jwtSecret.",
      );
    } finally {
      delete process.env.EDGE_JWT_SECRET;
    }
  });

  test("passes a secret read from the server's own process env with no fallback", async () => {
    const envDir = await writeProfile("export const env = { security: { jwtSecret: process.env.EDGE_JWT_SECRET } };\n");
    await expect(ServerEnvProfile.assertShippable({ envDir, environment: "main", profile: "edge" })).resolves.toBe(
      undefined,
    );
  });

  test("refuses a missing profile file and a malformed name", async () => {
    const envDir = await writeProfile("export const env = {};\n");
    await expect(ServerEnvProfile.assertShippable({ envDir, environment: "develop", profile: "edge" })).rejects.toThrow(
      'The server env profile "edge" bundles env/env.server.develop.edge.ts in place of env/env.server.develop.ts, and there is no such file.',
    );
    await expect(ServerEnvProfile.assertShippable({ envDir, environment: "main", profile: "../x" })).rejects.toThrow(
      "must be a lowercase-first name",
    );
  });
});
