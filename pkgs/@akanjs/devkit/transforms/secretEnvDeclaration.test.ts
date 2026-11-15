import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  holdsSentinel,
  secretEnvFixtureNames,
  secretEnvSentinels,
  writeSecretEnvFixture,
} from "../test/secretEnvFixture";
import { tempDirs, writeText } from "../test/testHelpers";
import { SecretEnvDeclaration } from "./secretEnvDeclaration";
import { SecretEnvFile } from "./secretEnvFile";

const makeTempRoot = tempDirs("akan-devkit-secret-env-");

describe("SecretEnvDeclaration", () => {
  test("lists each secret of the environment's server env with its variable, kind and value, a lib's default included", async () => {
    const { envDir } = await writeSecretEnvFixture(await makeTempRoot());
    const { variables, unmoved, held } = await SecretEnvDeclaration.of(envDir, "main");
    expect({ unmoved, held }).toEqual({ unmoved: [], held: [] });
    expect(variables.map(({ name }) => name)).toEqual(secretEnvFixtureNames);
    expect(Object.fromEntries(variables.map(({ name, kind, path: at, value }) => [name, { kind, at, value }]))).toEqual(
      {
        JWT_SECRET: { kind: "string", at: "security.jwtSecret", value: secretEnvSentinels.jwt },
        SECURITY__SSO__GOOGLE__CLIENT_SECRET: {
          kind: "string",
          at: "security.sso.google.clientSecret",
          value: secretEnvSentinels.google,
        },
        MAILER__AUTH__PASS: { kind: "string", at: "mailer.auth.pass", value: secretEnvSentinels.libPass },
        OBJECT_STORAGE__ENDPOINT: { kind: "string", at: "objectStorage.endpoint", value: secretEnvSentinels.storage },
        DISCORD__TOKENS: { kind: "json", at: "discord.tokens", value: JSON.stringify(secretEnvSentinels.bots) },
        DISCORD__WEBHOOK: { kind: "string", at: "discord.webhook", value: secretEnvSentinels.webhook },
        PUSH_NOTI__FIREBASE__PRIVATE_KEY: {
          kind: "multiline",
          at: "pushNoti.firebase.private_key",
          value: secretEnvSentinels.pem,
        },
        MESSAGE__API_SECRET: { kind: "string", at: "message.apiSecret", value: secretEnvSentinels.dollar },
        MESSAGE__SENDER_PASSWORD: {
          kind: "string",
          at: "message.senderPassword",
          value: secretEnvSentinels.apostrophe,
        },
        POSTGRES_URL: { kind: "string", at: "database.postgres.url", value: secretEnvSentinels.postgres },
      },
    );
  });

  test("the listing names every variable and its key, says which the shell sets, and holds no value", async () => {
    const { envDir } = await writeSecretEnvFixture(await makeTempRoot());
    const declared = await SecretEnvDeclaration.of(envDir, "main");
    const shell = process.env.MAILER__AUTH__PASS;
    process.env.MAILER__AUTH__PASS = "set-in-the-shell";
    try {
      const listing = SecretEnvFile.listing(declared);
      expect(holdsSentinel(listing)).toBe(false);
      expect(listing.split("\n")).toEqual([
        "VARIABLE                              KIND       SHELL  ENV FILE KEY",
        "JWT_SECRET                            string     unset  security.jwtSecret",
        "SECURITY__SSO__GOOGLE__CLIENT_SECRET  string     unset  security.sso.google.clientSecret",
        "MAILER__AUTH__PASS                    string     set    mailer.auth.pass",
        "OBJECT_STORAGE__ENDPOINT              string     unset  objectStorage.endpoint",
        "DISCORD__TOKENS                       json       unset  discord.tokens",
        "DISCORD__WEBHOOK                      string     unset  discord.webhook",
        "PUSH_NOTI__FIREBASE__PRIVATE_KEY      multiline  unset  pushNoti.firebase.private_key",
        "MESSAGE__API_SECRET                   string     unset  message.apiSecret",
        "MESSAGE__SENDER_PASSWORD              string     unset  message.senderPassword",
        "POSTGRES_URL                          string     unset  database.postgres.url",
      ]);
    } finally {
      if (shell === undefined) delete process.env.MAILER__AUTH__PASS;
      else process.env.MAILER__AUTH__PASS = shell;
    }
  });

  test("lists the environment asked for, and the env file itself where it replaced the switch", async () => {
    const { envDir } = await writeSecretEnvFixture(await makeTempRoot());
    const local = await SecretEnvDeclaration.of(envDir, "local");
    expect(local.variables.map(({ name, value }) => [name, value])).toEqual([
      ["LLM__API_KEY", secretEnvSentinels.local],
    ]);
    await writeText(
      path.join(envDir, "env.server.ts"),
      `export const env = { security: { jwtSecret: ${JSON.stringify(secretEnvSentinels.jwt)} }, hostname: "app.example.test" };\n`,
    );
    const replaced = await SecretEnvDeclaration.of(envDir, "main");
    expect(replaced.variables.map(({ name, value }) => [name, value])).toEqual([
      ["JWT_SECRET", secretEnvSentinels.jwt],
    ]);
  });

  test("names a secret the env file computes as one no build can move, without its value", async () => {
    const { envDir } = await writeSecretEnvFixture(await makeTempRoot(), {
      mainExtra: '\n  llm: { apiKey: ["sentinel", "computed", "0a73"].join("-") },',
    });
    const declared = await SecretEnvDeclaration.of(envDir, "main");
    expect(declared.unmoved).toEqual(["llm.apiKey"]);
    expect(declared.held).toEqual([{ path: "llm.apiKey", value: "sentinel-computed-0a73" }]);
    expect(declared.variables.map(({ name }) => name)).toEqual(secretEnvFixtureNames);
    const listing = SecretEnvFile.listing(declared);
    expect(holdsSentinel(listing)).toBe(false);
    expect(listing).toEndWith(
      "\nNot read from a variable, since the env file computes or imports it: llm.apiKey. Write `process.env.<NAME>` there for a build to leave the value out.",
    );
  });

  test("says so when the server env holds no secret", async () => {
    const root = await makeTempRoot();
    const envDir = path.join(root, "apps/demo/env");
    await writeText(path.join(envDir, "env.server.ts"), 'export const env = { hostname: "app.example.test" };\n');
    expect(SecretEnvFile.listing(await SecretEnvDeclaration.of(envDir, "main"))).toBe(
      "The server env holds no secret value, so a build reads none.",
    );
  });

  test("refuses a key whose variable the platform owns, naming the file and the key and not the value", async () => {
    const { envDir } = await writeSecretEnvFixture(await makeTempRoot(), {
      mainExtra: '\n  pwd: "sentinel-pwd-1b84",',
    });
    const failure = await SecretEnvDeclaration.of(envDir, "main").catch((error: Error) => error.message);
    expect(failure).toContain(
      "env.server.main.ts `pwd` is a secret a build would read from the environment variable PWD",
    );
    expect(holdsSentinel(String(failure))).toBe(false);
  });
});
