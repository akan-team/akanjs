import { afterEach, describe, expect, test } from "bun:test";
import { AkanError } from "../../base/akanError";
import { SecretEnv } from "./secretEnv";

const sentinel = "sentinel-0f3a9c-value";
const names = ["FIXTURE__TOKEN", "FIXTURE__TOKENS", "FIXTURE__PRIVATE_KEY", "POSTGRES_URL", "POSTGRES_URI"];

const collect = () => {
  const warnings: string[] = [];
  return { warnings, logger: { warn: (message: string) => warnings.push(message) } };
};

afterEach(() => {
  for (const name of names) delete process.env[name];
});

describe("SecretEnv.check", () => {
  test("warns once, naming only the variables the deployment does not set", () => {
    const { warnings, logger } = collect();
    const report = SecretEnv.check(logger, {
      AKAN_ENV_NAMES: "FIXTURE__TOKEN,MAILER__AUTH__PASS,DISCORD__TOKENS:json,LLM__API_KEY",
      AKAN_PUBLIC_APP_NAME: "portal",
      AKAN_PUBLIC_ENV: "main",
      FIXTURE__TOKEN: sentinel,
    });
    expect(report.missing).toEqual(["MAILER__AUTH__PASS", "DISCORD__TOKENS", "LLM__API_KEY"]);
    expect(warnings).toEqual([
      "3 secret env values this server declares are not set: MAILER__AUTH__PASS, DISCORD__TOKENS, LLM__API_KEY. The framework does not stop for them yet, though whatever reads them may, and akanjs 3.5.0 will refuse to boot. Set them in the deployment's environment; `akan secret-env portal --env main` lists every name.",
    ]);
  });

  test("says nothing when every declared variable is set, or when no build declared one", () => {
    const { warnings, logger } = collect();
    SecretEnv.check(logger, { AKAN_ENV_NAMES: "FIXTURE__TOKEN", FIXTURE__TOKEN: sentinel });
    SecretEnv.check(logger, { FIXTURE__TOKEN: sentinel });
    SecretEnv.check(logger, { AKAN_ENV_NAMES: "" });
    expect(warnings).toEqual([]);
  });

  test("an empty variable counts as not set", () => {
    const { warnings, logger } = collect();
    expect(SecretEnv.check(logger, { AKAN_ENV_NAMES: "FIXTURE__TOKEN", FIXTURE__TOKEN: "" }).missing).toEqual([
      "FIXTURE__TOKEN",
    ]);
    expect(warnings).toEqual([
      "1 secret env value this server declares is not set: FIXTURE__TOKEN. The framework does not stop for it yet, though whatever reads it may, and akanjs 3.5.0 will refuse to boot. Set it in the deployment's environment; `akan secret-env <app> --env <env>` lists every name.",
    ]);
  });

  test("the other name the database reads satisfies POSTGRES_URL", () => {
    const { warnings, logger } = collect();
    SecretEnv.check(logger, { AKAN_ENV_NAMES: "POSTGRES_URL", POSTGRES_URI: sentinel });
    expect(warnings).toEqual([]);
    process.env.POSTGRES_URI = sentinel;
    expect(SecretEnv.read("POSTGRES_URL")).toBe(sentinel);
  });

  test("refuses a JSON variable that does not parse, by name, and neither the error nor a log line holds its text", () => {
    const { warnings, logger } = collect();
    const failure = (() => {
      try {
        SecretEnv.check(logger, { AKAN_ENV_NAMES: "FIXTURE__TOKENS:json", FIXTURE__TOKENS: `["a", ${sentinel}` });
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(AkanError.is(failure, "secretEnvInvalid")).toBe(true);
    const error = failure as AkanError;
    expect(error.message).toBe(
      "FIXTURE__TOKENS must hold a JSON array, as `akan secret-env` writes it, and what it holds is not one.",
    );
    expect(error.cause).toBeUndefined();
    expect(`${error.stack} ${JSON.stringify(error)} ${warnings.join(" ")}`).not.toContain(sentinel);
  });

  test("warns by name about a multi-line value pasted onto one line, and not about one with real line breaks", () => {
    const { warnings, logger } = collect();
    const key = `-----BEGIN PRIVATE KEY-----\n${sentinel}\n-----END PRIVATE KEY-----\n`;
    const report = SecretEnv.check(logger, {
      AKAN_ENV_NAMES: "FIXTURE__PRIVATE_KEY:multiline,OTHER__PRIVATE_KEY:multiline",
      FIXTURE__PRIVATE_KEY: key.replaceAll("\n", "\\n"),
      OTHER__PRIVATE_KEY: key,
    });
    expect(report).toEqual({ missing: [], escaped: ["FIXTURE__PRIVATE_KEY"] });
    expect(warnings).toEqual([
      "FIXTURE__PRIVATE_KEY holds a backslash and an n where a line should break, as a key pasted onto one line does. Set it with real line breaks; `akan secret-env` writes it so.",
    ]);
  });

  test("an image built with --inline-secrets says which built-in values it runs on", () => {
    const { warnings, logger } = collect();
    SecretEnv.check(logger, {
      AKAN_ENV_NAMES: "FIXTURE__TOKEN,LLM__API_KEY",
      AKAN_ENV_FALLBACK: "image",
      LLM__API_KEY: sentinel,
    });
    expect(warnings).toEqual([
      "1 secret env value this server declares is not set, so it uses the value built into this image (akan build --inline-secrets): FIXTURE__TOKEN. Set it in the deployment's environment and build without the flag; akanjs 3.5.0 removes it.",
    ]);
  });
});

describe("SecretEnv reads", () => {
  test("a string comes from the process env, and from the build only when it carries one and the variable is unset", () => {
    expect(SecretEnv.read("FIXTURE__TOKEN")).toBeUndefined();
    expect(SecretEnv.read("FIXTURE__TOKEN", "built-in")).toBe("built-in");
    process.env.FIXTURE__TOKEN = "";
    expect(SecretEnv.read("FIXTURE__TOKEN", "built-in")).toBe("built-in");
    process.env.FIXTURE__TOKEN = sentinel;
    expect(SecretEnv.read("FIXTURE__TOKEN", "built-in")).toBe(sentinel);
  });

  test("an array comes parsed from its JSON, and a value that is no array is refused without being quoted", () => {
    expect(SecretEnv.json("FIXTURE__TOKENS")).toBeUndefined();
    expect(SecretEnv.json("FIXTURE__TOKENS", ["built-in"])).toEqual(["built-in"]);
    process.env.FIXTURE__TOKENS = JSON.stringify([sentinel, "second"]);
    expect(SecretEnv.json("FIXTURE__TOKENS", ["built-in"])).toEqual([sentinel, "second"]);
    process.env.FIXTURE__TOKENS = JSON.stringify({ token: sentinel });
    expect(() => SecretEnv.json("FIXTURE__TOKENS")).toThrow(
      "FIXTURE__TOKENS must hold a JSON array, as `akan secret-env` writes it, and what it holds is not one.",
    );
  });

  test("the declared list keeps each variable's kind through the build's env file", () => {
    const entries = [
      { name: "JWT_SECRET", kind: "string" as const },
      { name: "DISCORD__TOKENS", kind: "json" as const },
      { name: "PUSH_NOTI__FIREBASE__PRIVATE_KEY", kind: "multiline" as const },
    ];
    expect(SecretEnv.format(entries)).toBe(
      "JWT_SECRET,DISCORD__TOKENS:json,PUSH_NOTI__FIREBASE__PRIVATE_KEY:multiline",
    );
    expect(SecretEnv.parse(SecretEnv.format(entries))).toEqual(entries);
    expect(SecretEnv.parse(undefined)).toEqual([]);
  });
});
