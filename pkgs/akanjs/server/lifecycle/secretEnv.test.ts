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

const refusalOf = (env: NodeJS.ProcessEnv) => {
  const { warnings, logger } = collect();
  try {
    SecretEnv.check(logger, env);
    return { warnings, error: null };
  } catch (error) {
    return { warnings, error };
  }
};

describe("SecretEnv.check", () => {
  test("refuses to start, naming only the variables the deployment does not set and the command that lists them", () => {
    const { warnings, error } = refusalOf({
      AKAN_ENV_NAMES: "FIXTURE__TOKEN,MAILER__AUTH__PASS,DISCORD__TOKENS:json,LLM__API_KEY",
      AKAN_PUBLIC_APP_NAME: "portal",
      AKAN_PUBLIC_ENV: "main",
      FIXTURE__TOKEN: sentinel,
    });
    expect(AkanError.is(error, "secretEnvMissing")).toBe(true);
    expect((error as AkanError).message).toBe(
      "3 secret env values this server reads from its process env are not set, so it does not start: MAILER__AUTH__PASS, DISCORD__TOKENS, LLM__API_KEY. Its build left the values out of the image. Set them in the deployment's environment; `akan secret-env portal --env main` lists every name and writes the values from the env file.",
    );
    expect(warnings).toEqual([]);
    expect(`${(error as AkanError).stack} ${JSON.stringify(error)}`).not.toContain(sentinel);
  });

  test("starts silently when every declared variable is set, or when no build declared one", () => {
    const { warnings, logger } = collect();
    SecretEnv.check(logger, { AKAN_ENV_NAMES: "FIXTURE__TOKEN", FIXTURE__TOKEN: sentinel });
    SecretEnv.check(logger, { FIXTURE__TOKEN: sentinel });
    SecretEnv.check(logger, { AKAN_ENV_NAMES: "" });
    SecretEnv.check(logger, {});
    expect(warnings).toEqual([]);
  });

  test("an empty variable counts as not set", () => {
    const { error } = refusalOf({ AKAN_ENV_NAMES: "FIXTURE__TOKEN", FIXTURE__TOKEN: "" });
    expect((error as AkanError).message).toBe(
      "1 secret env value this server reads from its process env is not set, so it does not start: FIXTURE__TOKEN. Its build left the value out of the image. Set it in the deployment's environment; `akan secret-env <app> --env <env>` lists every name and writes the values from the env file.",
    );
  });

  test("the other name the database reads satisfies POSTGRES_URL", () => {
    const { warnings, logger } = collect();
    SecretEnv.check(logger, { AKAN_ENV_NAMES: "POSTGRES_URL", POSTGRES_URI: sentinel });
    expect(warnings).toEqual([]);
    process.env.POSTGRES_URI = sentinel;
    expect(SecretEnv.read("POSTGRES_URL")).toBe(sentinel);
  });

  test("a variable the env file reads ahead of the declared one stands in for it, and an empty one does not", () => {
    const list = SecretEnv.format([{ name: "POSTGRES_URL", kind: "string", ahead: ["DATABASE_URL", "DB_URL"] }]);
    expect(list).toBe("POSTGRES_URL|DATABASE_URL|DB_URL");
    const { logger } = collect();
    SecretEnv.check(logger, { AKAN_ENV_NAMES: list, DB_URL: sentinel });
    expect(refusalOf({ AKAN_ENV_NAMES: list, DATABASE_URL: "" }).error).toBeInstanceOf(AkanError);
  });

  test("refuses a JSON variable that does not parse, by name, and neither the error nor a log line holds its text", () => {
    const { warnings, error: failure } = refusalOf({
      AKAN_ENV_NAMES: "FIXTURE__TOKENS:json",
      FIXTURE__TOKENS: `["a", ${sentinel}`,
    });
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
    SecretEnv.check(logger, {
      AKAN_ENV_NAMES: "FIXTURE__PRIVATE_KEY:multiline,OTHER__PRIVATE_KEY:multiline",
      FIXTURE__PRIVATE_KEY: key.replaceAll("\n", "\\n"),
      OTHER__PRIVATE_KEY: key,
    });
    expect(warnings).toEqual([
      "FIXTURE__PRIVATE_KEY holds a backslash and an n where a line should break, as a key pasted onto one line does. Set it with real line breaks; `akan secret-env` writes it so.",
    ]);
  });
});

describe("SecretEnv reads", () => {
  test("a string comes from the process env, and an empty one reads as unset", () => {
    expect(SecretEnv.read("FIXTURE__TOKEN")).toBeUndefined();
    process.env.FIXTURE__TOKEN = "";
    expect(SecretEnv.read("FIXTURE__TOKEN")).toBeUndefined();
    process.env.FIXTURE__TOKEN = sentinel;
    expect(SecretEnv.read("FIXTURE__TOKEN")).toBe(sentinel);
  });

  test("an array comes parsed from its JSON, and a value that is no array is refused without being quoted", () => {
    expect(SecretEnv.json("FIXTURE__TOKENS")).toBeUndefined();
    process.env.FIXTURE__TOKENS = JSON.stringify([sentinel, "second"]);
    expect(SecretEnv.json("FIXTURE__TOKENS")).toEqual([sentinel, "second"]);
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
      { name: "POSTGRES_URL", kind: "string" as const, ahead: ["DATABASE_URL"] },
    ];
    expect(SecretEnv.format(entries)).toBe(
      "JWT_SECRET,DISCORD__TOKENS:json,PUSH_NOTI__FIREBASE__PRIVATE_KEY:multiline,POSTGRES_URL|DATABASE_URL",
    );
    expect(SecretEnv.parse(SecretEnv.format(entries))).toEqual(entries);
    expect(SecretEnv.parse(undefined)).toEqual([]);
  });
});
