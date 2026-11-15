import { describe, expect, test } from "bun:test";
import { SecretEnvName } from "./secretEnvName";

describe("SecretEnvName", () => {
  test("names a secret after its key path, one upper snake case segment per key", () => {
    const names = Object.fromEntries(
      [
        "security.sso.google.clientSecret",
        "security.sso.kakao.clientID",
        "objectStorage.secretAccessKey",
        "mailer.auth.pass",
        "iapVerify.google.private_key",
        "rootAdminInfo.password",
        "llm.apiKey",
        "storage.s3Key",
        "push-noti.apns.keyId",
      ].map((at) => [at, SecretEnvName.of(at.split("."))]),
    );
    expect(names).toEqual({
      "security.sso.google.clientSecret": "SECURITY__SSO__GOOGLE__CLIENT_SECRET",
      "security.sso.kakao.clientID": "SECURITY__SSO__KAKAO__CLIENT_ID",
      "objectStorage.secretAccessKey": "OBJECT_STORAGE__SECRET_ACCESS_KEY",
      "mailer.auth.pass": "MAILER__AUTH__PASS",
      "iapVerify.google.private_key": "IAP_VERIFY__GOOGLE__PRIVATE_KEY",
      "rootAdminInfo.password": "ROOT_ADMIN_INFO__PASSWORD",
      "llm.apiKey": "LLM__API_KEY",
      "storage.s3Key": "STORAGE__S3_KEY",
      "push-noti.apns.keyId": "PUSH_NOTI__APNS__KEY_ID",
    });
  });

  test("keeps the names the framework already reads from the process env", () => {
    expect(SecretEnvName.of(["security", "jwtSecret"])).toBe("JWT_SECRET");
    expect(SecretEnvName.of(["database", "postgres", "url"])).toBe("POSTGRES_URL");
    expect(SecretEnvName.of(["database", "postgres", "password"])).toBe("POSTGRES_PASSWORD");
    expect(SecretEnvName.of(["database", "postgres", "insightUrl"])).toBe("POSTGRES_INSIGHT_URL");
  });

  test("refuses a name the platform sets, one akan or Bun keeps, and one no environment variable can take", () => {
    for (const name of ["PATH", "HOME", "HOSTNAME", "PORT", "USER", "PWD", "TZ", "NODE_ENV"])
      expect(SecretEnvName.refusal(name)).toBe("a variable the platform sets");
    expect(SecretEnvName.refusal(SecretEnvName.of(["akan", "token"]))).toBe(
      "a name akan and Bun keep for their own settings",
    );
    expect(SecretEnvName.refusal(SecretEnvName.of(["bun", "apiKey"]))).toBe(
      "a name akan and Bun keep for their own settings",
    );
    expect(SecretEnvName.refusal(SecretEnvName.of(["2fa", "secret"]))).toBe(
      "which is not a name an environment variable can take",
    );
    expect(SecretEnvName.refusal("JWT_SECRET")).toBeNull();
    expect(SecretEnvName.refusal("SECURITY__SSO__GOOGLE__CLIENT_SECRET")).toBeNull();
  });
});
