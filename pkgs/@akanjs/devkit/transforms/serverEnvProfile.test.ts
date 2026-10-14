import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Logger } from "akanjs/common";
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

  test("names a URL that carries a credential under any key, and the keys a credential goes by elsewhere", () => {
    expect(
      ServerEnvProfile.secretPaths({
        database: {
          postgres: { url: "postgres://app:pg-pass@db/app", insightUrl: "postgres://ro:ro-pass@db/app", host: "db" },
        },
        cache: { url: "redis://cache:6379" },
        search: { endpoint: "https://search.example/v1?api_key=k" },
        cloudOrigin: "https://cloud.example",
        signing: { signingKey: "s", encryptionKey: "e", MASTER_KEY: "m", sessionKey: "k" },
        sentry: { dsn: "d" },
        SENTRY_DSN: "d",
        db: { pwd: "p", connectionString: "c" },
        enrollKey: "fleet",
        publicKey: "pub",
        adsNetwork: "n",
      }),
    ).toEqual([
      "database.postgres.url",
      "database.postgres.insightUrl",
      "search.endpoint",
      "signing.signingKey",
      "signing.encryptionKey",
      "signing.MASTER_KEY",
      "signing.sessionKey",
      "sentry.dsn",
      "SENTRY_DSN",
      "db.pwd",
      "db.connectionString",
    ]);
  });
});

describe("the secret names a profile may not carry", () => {
  test("are the names the logger masks, so the two cannot drift apart", () => {
    for (const name of ["apiKey", "sentryDsn", "slackWebhook", "dbPassword", "serviceAccount", "enrollKey", "host"]) {
      const named = ServerEnvProfile.secretPaths({ [name]: "a value" }).length > 0;
      expect(named).toBe(Logger.isSecretKey(name));
      expect(Logger.redactAttrs({ [name]: "a value" })[name] === "[redacted]").toBe(named);
    }
  });
});

describe("ServerEnvProfile.secretValues", () => {
  test("looks for a secret, not for a token endpoint or a plain constant a credential block holds as library code does", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n";
    expect(
      ServerEnvProfile.secretValues({
        iapVerify: {
          google: { type: "service_account", token_uri: "https://oauth2.googleapis.com/token", private_key: pem },
        },
        security: { jwtSecret: "correct-horse-battery", tokenEndpoint: "https://auth.example.com/oauth2/token" },
        calendar: { secretIcalUrl: "https://calendar.example.com/ical/team/private-0123456789abcdef0123/basic.ics" },
        discord: { webhook: "https://discord.com/api/webhooks/123/abcdefgh" },
        database: { postgres: { url: "postgres://app:pg-password-1@db/app", host: "db.internal.example" } },
        mailer: { auth: { pass: "short" } },
      }),
    ).toEqual([
      { path: "iapVerify.google.private_key", value: pem },
      { path: "security.jwtSecret", value: "correct-horse-battery" },
      {
        path: "calendar.secretIcalUrl",
        value: "https://calendar.example.com/ical/team/private-0123456789abcdef0123/basic.ics",
      },
      { path: "discord.webhook", value: "https://discord.com/api/webhooks/123/abcdefgh" },
      { path: "database.postgres.url", value: "postgres://app:pg-password-1@db/app" },
      { path: "database.postgres.url", value: "pg-password-1" },
    ]);
  });
});

describe("ServerEnvProfile.strip", () => {
  test("leaves a stripped element out of an array whole, with no null or emptied object in its place", () => {
    expect(
      ServerEnvProfile.strip({
        tokens: ["a", "b"],
        clients: [{ secret: "x" }, { name: "n", secret: "y" }, {}],
        ports: [1, "two", null],
        replicas: ["postgres://u:p@a/db", "postgres://b/db"],
      }),
    ).toEqual({
      value: { tokens: [], clients: [{ name: "n" }, {}], ports: [1, "two", null], replicas: ["postgres://b/db"] },
      stripped: ["tokens.0", "tokens.1", "clients.0.secret", "clients.1.secret", "replicas.0"],
    });
  });
});

describe("ServerEnvProfile.evaluate", () => {
  test("says why and where an env file could not be evaluated, and never a line or a value of it", async () => {
    const root = await makeTempRoot();
    const secret = "dummy-secret-0123456789";
    const sources = {
      syntax: `export const env = {\n  jwtSecret: "${secret}" "again-${secret}",\n};\n`,
      unterminated: `export const env = {\n  jwtSecret: "${secret},\n};\n`,
      evaluating: `export const env = { jwtSecret: "${secret}".foo.bar };\n`,
      thrown: `const key = "${secret}";\nif (key) throw new Error("bad key: " + key);\nexport const env = {};\n`,
      thrownString: `throw "${secret}";\nexport const env = {};\n`,
      reference: `export const env = {\n  jwtSecret: "${secret}",\n  x: undefinedVar.y,\n};\n`,
    };
    const messages: Record<string, string> = {};
    for (const [name, source] of Object.entries(sources)) {
      const file = path.join(root, `env/env.server.${name}.ts`);
      await write(file, source);
      messages[name] = await ServerEnvProfile.evaluate(file, root).then(
        () => "",
        (error: Error) => error.message,
      );
    }
    for (const message of Object.values(messages)) {
      expect(message).toContain("could not be evaluated to check it for secrets");
      expect(message).not.toContain(secret);
    }
    expect(messages.reference).toMatch(
      /^env\.server\.reference\.ts could not be evaluated to check it for secrets: ReferenceError: undefinedVar is not defined \(at .*env\.server\.reference\.ts:3:\d+\)$/,
    );
    expect(messages.syntax).toMatch(/env\.server\.syntax\.ts:2:\d+\)$/);
  });

  test("reads an env file that writes to stdout as it loads", async () => {
    const envDir = await writeProfile(
      'console.info("loading the edge env");\nprocess.stdout.write("{ not json");\nexport const env = { hostname: "edge" };\n',
    );
    expect(await ServerEnvProfile.evaluate(path.join(envDir, "env.server.main.edge.ts"), path.dirname(envDir))).toEqual(
      {
        hostname: "edge",
      },
    );
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

  test("judges a profile that spreads the lib env defaults by what its bundle carries of them", async () => {
    const root = await makeTempRoot();
    const utilEnv = path.join(root, "libs/util/env/env.server.testing.ts");
    await write(
      utilEnv,
      'export const env = { hostname: "lib-host", security: { jwtSecret: "util-jwt" }, objectStorage: { secretAccessKey: "util-s3" } };\n',
    );
    await write(
      path.join(root, "libs/shared/env/env.server.type.ts"),
      `import { env as util } from ${JSON.stringify(utilEnv)};\nexport const libEnv = { ...util };\n`,
    );
    const sharedEnv = path.join(root, "libs/shared/env/env.server.testing.ts");
    await write(
      sharedEnv,
      'import { libEnv } from "./env.server.type";\nexport const env = { ...libEnv, rootAdminInfo: { password: "shared-root" } };\n',
    );
    const envDir = path.join(root, "apps/demo/env");
    await write(
      path.join(envDir, "env.server.type.ts"),
      `import { env as shared } from ${JSON.stringify(sharedEnv)};\nexport const libEnv = { ...shared };\n`,
    );
    await write(
      path.join(envDir, "env.server.main.edge.ts"),
      'import { libEnv } from "./env.server.type";\nexport const env = { ...libEnv, origin: "edge" };\n',
    );
    const shippable = () => ServerEnvProfile.assertShippable({ envDir, environment: "main", profile: "edge" });
    await expect(shippable()).resolves.toBe(undefined);

    const sharedEdge = path.join(root, "libs/shared/env/env.server.testing.edge.ts");
    await write(
      sharedEdge,
      'import { libEnv } from "./env.server.type";\nexport const env = { ...libEnv, sharedOrigin: "edge" };\n',
    );
    await expect(shippable()).resolves.toBe(undefined);

    await write(sharedEdge, 'export const env = { mailer: { pass: "edge-pass" } };\n');
    await expect(shippable()).rejects.toThrow(`${sharedEdge} holds secret-named values`);

    await write(sharedEdge, 'export const env = { origin: "edge" };\n');
    await write(
      path.join(envDir, "env.server.main.edge.ts"),
      'import { libEnv } from "./env.server.type";\nexport const env = { ...libEnv, llm: { apiKey: "edge-key" } };\n',
    );
    await expect(shippable()).rejects.toThrow(
      "holds secret-named values, which a profile's bundle carries to every computer it runs on: llm.apiKey.",
    );
  });

  test("refuses a profile that imports the file it is bundled in place of, which it would then import as itself", async () => {
    const envDir = await writeProfile(
      'import { env as main } from "./env.server.main";\nexport const env = { hostname: main.hostname };\n',
    );
    await write(path.join(envDir, "env.server.main.ts"), 'export const env = { hostname: "main-host" };\n');
    await expect(ServerEnvProfile.assertShippable({ envDir, environment: "main", profile: "edge" })).rejects.toThrow(
      'env.server.main.edge.ts imports ./env.server.main, the file a "edge" build bundles it in place of, so it would import itself.',
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
