import { describe, expect, test } from "bun:test";
import { SecretEnvSource } from "./secretEnvSource";

const file = "/workspace/apps/demo/env/env.server.main.ts";
const read = (contents: string) => SecretEnvSource.rewrite(file, contents, "read");
const body = (rewritten: string) => rewritten.replace(/^import \{ SecretEnv as __akanSecretEnv \} from "[^"]+"; /, "");

describe("SecretEnvSource", () => {
  test("leaves a read of the process env where a secret string was, and every plain value as written", () => {
    const source = [
      'import type { ModulesOptions } from "../lib/option";',
      "export const env: ModulesOptions = {",
      '  hostname: "app.example.test",',
      "  security: {",
      '    jwtSecret: "sentinel-jwt",',
      '    verifies: [["password"], ["email"]],',
      "    accessTokenSeconds: 900,",
      '    sso: { google: { clientID: "plain-id", "clientSecret": \'sentinel-google\' } },',
      "  },",
      "  mailer: { auth: { user: `mailer`, pass: `sentinel-pass` } },",
      '  objectStorage: { endpoint: "https://minio:sentinel-url-pass@storage.example.test", region: "ap-northeast-2" },',
      '  cookieDomain: "",',
      "};",
      "",
    ].join("\n");
    const rewritten = read(source);
    expect(rewritten).toStartWith('import { SecretEnv as __akanSecretEnv } from "');
    expect(rewritten.split("\n").length).toBe(source.split("\n").length);
    expect(body(rewritten)).toBe(
      [
        'import type { ModulesOptions } from "../lib/option";',
        "export const env: ModulesOptions = {",
        '  hostname: "app.example.test",',
        "  security: {",
        '    jwtSecret: __akanSecretEnv.read("JWT_SECRET"),',
        '    verifies: [["password"], ["email"]],',
        "    accessTokenSeconds: 900,",
        '    sso: { google: { clientID: "plain-id", "clientSecret": __akanSecretEnv.read("SECURITY__SSO__GOOGLE__CLIENT_SECRET") } },',
        "  },",
        '  mailer: { auth: { user: `mailer`, pass: __akanSecretEnv.read("MAILER__AUTH__PASS") } },',
        '  objectStorage: { endpoint: __akanSecretEnv.read("OBJECT_STORAGE__ENDPOINT"), region: "ap-northeast-2" },',
        '  cookieDomain: "",',
        "};",
        "",
      ].join("\n"),
    );
  });

  test("moves an array holding a secret whole, as one JSON variable, and leaves one it cannot read as a literal", () => {
    const rewritten = body(
      read(
        [
          "const more = [];",
          "export const env = {",
          '  discord: { tokens: ["sentinel-a", "sentinel-b"], rooms: ["general"] },',
          '  accounts: [{ name: "ops", password: "sentinel-ops", retries: -1, active: true, note: null }],',
          '  apiKeys: ["sentinel-c", ...more],',
          "};",
        ].join("\n"),
      ),
    );
    expect(rewritten).toContain('discord: { tokens: __akanSecretEnv.json("DISCORD__TOKENS"), rooms: ["general"] },');
    expect(rewritten).toContain('accounts: __akanSecretEnv.json("ACCOUNTS"),');
    expect(rewritten).toContain('apiKeys: ["sentinel-c", ...more],');
  });

  test("replaces only the literal beside the developer's own variable, through `as` and `satisfies`", () => {
    const rewritten = body(
      read(
        [
          "export const env = {",
          '  database: { postgres: { url: process.env.DATABASE_URL ?? "postgres://app:sentinel@db.example.test/app" } },',
          '  llm: { apiKey: (process.env.LLM_KEY || "sentinel-llm") as string },',
          "} as const satisfies object;",
        ].join("\n"),
      ),
    );
    expect(rewritten).toContain('url: process.env.DATABASE_URL ?? __akanSecretEnv.read("POSTGRES_URL")');
    expect(rewritten).toContain('apiKey: (process.env.LLM_KEY || __akanSecretEnv.read("LLM__API_KEY")) as string');
  });

  test("a listing marks the literal with the developer's own variable beside it whole, so a shell that sets that variable lists it too, and names the plain reads ahead of it", () => {
    const marked = SecretEnvSource.rewrite(
      file,
      [
        "export const env = {",
        '  database: { postgres: { url: process.env.DATABASE_URL ?? "postgres://app:sentinel@db.example.test/app" } },',
        '  llm: { apiKey: (process.env.LLM_KEY || process.env["OTHER_KEY"] || "sentinel-llm") as string },',
        '  mailer: { pass: process.env.MAIL_PASS?.trim() || decode(process.env.RAW) || "sentinel-pass" },',
        "};",
      ].join("\n"),
      "mark",
    );
    expect(marked).toContain(
      'url: ({ __akanSecretEnv: ["POSTGRES_URL", "string", "postgres://app:sentinel@db.example.test/app", ["DATABASE_URL"]] }) }',
    );
    expect(marked).toContain(
      'apiKey: ({ __akanSecretEnv: ["LLM__API_KEY", "string", "sentinel-llm", ["LLM_KEY","OTHER_KEY"]] }) }',
    );
    expect(marked).toContain('pass: ({ __akanSecretEnv: ["MAILER__PASS", "string", "sentinel-pass"] }) }');
  });

  test("leaves a file alone that holds no secret literal, or whose env is not an object it can read", () => {
    const plain = 'export const env = { hostname: "app.example.test", port: 8080, tokenTtl: 3600 };\n';
    expect(read(plain)).toBe(plain);
    const computed = [
      'import { secret } from "./elsewhere";',
      "const token = [secret].join();",
      ["export const env = { llm: { apiKey: token, model: `m-$", "{secret}` }, ...secret };"].join(""),
      'export const other = { password: "sentinel-other" };',
      "",
    ].join("\n");
    expect(read(computed)).toBe(computed);
    const switched = "export const env = envConfigs[currentEnv as keyof typeof envConfigs];\n";
    expect(read(switched)).toBe(switched);
  });

  test("a build keeps no literal behind the read, and a listing marks it with its variable", () => {
    const source = 'export const env = { llm: { apiKey: "sentinel-llm" }, discord: { tokens: ["sentinel-a"] } };\n';
    expect(body(read(source))).toBe(
      'export const env = { llm: { apiKey: __akanSecretEnv.read("LLM__API_KEY") }, discord: { tokens: __akanSecretEnv.json("DISCORD__TOKENS") } };\n',
    );
    expect(SecretEnvSource.rewrite(file, source, "mark")).toBe(
      'export const env = { llm: { apiKey: ({ __akanSecretEnv: ["LLM__API_KEY", "string", "sentinel-llm"] }) }, discord: { tokens: ({ __akanSecretEnv: ["DISCORD__TOKENS", "json", ["sentinel-a"]] }) } };\n',
    );
  });

  test("marks a string holding a line break as multi-line", () => {
    const source = 'export const env = { push: { privateKey: "-----BEGIN-----\\nsentinel\\n-----END-----\\n" } };\n';
    expect(SecretEnvSource.rewrite(file, source, "mark")).toContain('["PUSH__PRIVATE_KEY", "multiline", ');
  });

  test("refuses two keys that would share one variable, and a key whose variable the platform owns, without a value", () => {
    const failure = (contents: string) => {
      try {
        read(contents);
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(failure('export const env = { a: { apiKey: "sentinel-one", api_key: "sentinel-two" } };')).toBe(
      `${file} \`a.apiKey\` and \`a.api_key\` are secrets a build would both read from the environment variable A__API_KEY. Rename one of the keys.`,
    );
    expect(failure('export const env = { pwd: "sentinel-three" };')).toBe(
      `${file} \`pwd\` is a secret a build would read from the environment variable PWD, a variable the platform sets. Rename the key, or write \`process.env.<NAME>\` there yourself, which a build leaves as it is.`,
    );
    expect(failure('export const env = { akan: { token: "sentinel-four" } };')).toContain(
      "AKAN__TOKEN, a name akan and Bun keep for their own settings.",
    );
  });
});
