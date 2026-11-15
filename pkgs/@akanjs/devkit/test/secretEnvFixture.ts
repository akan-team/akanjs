import path from "node:path";
import { writeText } from "./testHelpers";

const environments = ["local", "main"] as const;

export const secretEnvSentinels = {
  jwt: "sentinel-jwt-2f0c",
  google: "sentinel-google-91ab",
  bots: ["sentinel-bot-a-44d1", "sentinel-bot-b-55e2"],
  webhook: "https://hooks.example.test/services/sentinel-hook-66f3",
  pem: "-----BEGIN PRIVATE KEY-----\nsentinel-pem-line-one-aa17\nsentinel-pem-line-two-bb28\n-----END PRIVATE KEY-----\n",
  postgres: "postgres://app:sentinel-db-pass-77a4@db.example.test:5432/app",
  storage: "https://minio:sentinel-url-pass-cc39@storage.example.test",
  dollar: ["sentinel-$HOME-", '"quoted"-$', "{USER}-dd40"].join(""),
  apostrophe: "sentinel-it's-$1-ee51",
  libPass: "sentinel-lib-pass-88b5",
  libJwt: "sentinel-lib-jwt-99c6",
  local: "sentinel-local-llm-ff62",
};

export const secretEnvPlain = { hostname: "app.example.test", clientID: "plain-client-id", region: "ap-northeast-2" };

const s = secretEnvSentinels;

const mainEnv = (extra = "", head = "") => `${head}import { libEnv } from "./env.server.type";

export const env = {
  ...libEnv,
  hostname: ${JSON.stringify(secretEnvPlain.hostname)},
  security: {
    jwtSecret: ${JSON.stringify(s.jwt)},
    verifies: [["password"], ["email"]],
    accessTokenSeconds: 900,
    sso: { google: { clientID: ${JSON.stringify(secretEnvPlain.clientID)}, clientSecret: ${JSON.stringify(s.google)} } },
  },
  objectStorage: { region: ${JSON.stringify(secretEnvPlain.region)}, endpoint: ${JSON.stringify(s.storage)} },
  discord: { tokens: ${JSON.stringify(s.bots)}, webhook: ${JSON.stringify(s.webhook)} },
  pushNoti: { firebase: { type: "service_account", private_key: ${JSON.stringify(s.pem)} } },
  message: { apiSecret: ${JSON.stringify(s.dollar)}, senderPassword: ${JSON.stringify(s.apostrophe)} },
  database: { postgres: { url: process.env.DATABASE_URL ?? ${JSON.stringify(s.postgres)} } },${extra}
} as const;
`;

export interface SecretEnvFixture {
  appDir: string;
  envDir: string;
  libEnvFile: string;
}

export const writeSecretEnvFixture = async (
  root: string,
  { app = "demo", mainExtra = "", mainHead = "" } = {},
): Promise<SecretEnvFixture> => {
  const appDir = path.join(root, "apps", app);
  const envDir = path.join(appDir, "env");
  const libEnvFile = path.join(root, "libs/util/env/env.server.testing.ts");
  await writeText(
    path.join(envDir, "env.server.ts"),
    [
      ...environments.map((name) => `import { env as ${name} } from "./env.server.${name}";`),
      `const envConfigs = { ${environments.join(", ")} };`,
      'const currentEnv = process.env.AKAN_PUBLIC_ENV ?? "local";',
      "export const env = envConfigs[currentEnv as keyof typeof envConfigs];",
      "",
    ].join("\n"),
  );
  await writeText(
    path.join(envDir, "env.server.type.ts"),
    `import { env as utilOption } from ${JSON.stringify(libEnvFile)};\n\nexport const libEnv = { ...utilOption };\n`,
  );
  await writeText(
    libEnvFile,
    `export const env = {\n  hostname: null,\n  security: { jwtSecret: ${JSON.stringify(s.libJwt)}, verifies: [["password"]] },\n  mailer: { address: "noreply@example.test", auth: { user: "mailer", pass: ${JSON.stringify(s.libPass)} } },\n};\n`,
  );
  await writeText(path.join(envDir, "env.server.main.ts"), mainEnv(mainExtra, mainHead));
  await writeText(
    path.join(envDir, "env.server.local.ts"),
    `export const env = { hostname: "localhost", llm: { apiKey: ${JSON.stringify(s.local)} } };\n`,
  );
  return { appDir, envDir, libEnvFile };
};

export const secretEnvFixtureNames = [
  "JWT_SECRET",
  "SECURITY__SSO__GOOGLE__CLIENT_SECRET",
  "MAILER__AUTH__PASS",
  "OBJECT_STORAGE__ENDPOINT",
  "DISCORD__TOKENS",
  "DISCORD__WEBHOOK",
  "PUSH_NOTI__FIREBASE__PRIVATE_KEY",
  "MESSAGE__API_SECRET",
  "MESSAGE__SENDER_PASSWORD",
  "POSTGRES_URL",
];

export const holdsSentinel = (text: string) => text.includes("sentinel-");

//* What no search of a build's files tells from code: a short password, a passphrase of plain words, a value under
//* eight characters, and a plain-named key under a secret-named one.
export const computedSecrets = {
  password: "sentinel-12c",
  passphrase: "sentinel-correct-horse-battery-xyzz",
  short: "s9-k2",
  user: "sentinel-user",
};

//* One string under a secret-named key and a plain one: a long mixed one, a short one, and one under eight characters.
export const twinSecrets = { long: "sentinel-Twin-7d21-Xq", plain: "sentinel-db", short: "s-pin" };

export const twinSecretEnv = [
  "",
  `  audit: { password: ${JSON.stringify(twinSecrets.long)}, label: ${JSON.stringify(twinSecrets.long)} },`,
  `  cache: { password: ${JSON.stringify(twinSecrets.plain)}, name: ${JSON.stringify(twinSecrets.plain)} },`,
  `  door: { secret: ${JSON.stringify(twinSecrets.short)}, hint: ${JSON.stringify(twinSecrets.short)} },`,
].join("\n");

export const computedSecretKeys = ["store.password", "store.passphrase", "otp.secret", "credentials.user"];

export const writeComputedSecretFixture = async (root: string, app = "demo"): Promise<SecretEnvFixture> => {
  await writeText(
    path.join(root, "apps", app, "srvkit/keys.ts"),
    `export const keys = ${JSON.stringify({ password: computedSecrets.password, passphrase: computedSecrets.passphrase, user: computedSecrets.user })};\n`,
  );
  return await writeSecretEnvFixture(root, {
    app,
    mainHead: 'import { keys } from "../srvkit/keys";\n',
    mainExtra: [
      "",
      "  store: { password: keys.password, passphrase: keys.passphrase },",
      `  otp: { secret: ${JSON.stringify(computedSecrets.short.split("-"))}.join("-") },`,
      "  credentials: { user: keys.user },",
    ].join("\n"),
  });
};
