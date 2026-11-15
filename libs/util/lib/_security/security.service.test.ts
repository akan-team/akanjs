import { describe, expect, test } from "bun:test";
import { accessTokenSeconds } from "@libs/util/common";
import { dayjs } from "akanjs/base";
import { decodeJwtPayload } from "akanjs/common";

import { SecurityService } from "./security.service";

process.env.AKAN_PUBLIC_APP_NAME ??= "util";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akan";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const serviceOf = () => {
  const service = new SecurityService();
  Object.defineProperty(service, "jwtSecret", { value: crypto.randomUUID() });
  return service;
};

describe("SecurityService.sign", () => {
  test("stamps the expiry it is given on the token", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { jwt } = await serviceOf().sign({ orgId: crypto.randomUUID() }, { expiresIn: 3600 });
    const { exp, iat } = decodeJwtPayload<{ exp?: number; iat?: number }>(jwt);
    expect(iat).toBeGreaterThanOrEqual(before);
    expect((exp ?? 0) - (iat ?? 0)).toBe(3600);
  });

  test("verifies a token it signed, and refuses it once expired", async () => {
    const service = serviceOf();
    const message = { orgId: crypto.randomUUID() };
    const { jwt } = await service.sign(message, { expiresIn: 60 });
    expect(await service.verify<typeof message>(jwt)).toMatchObject(message);
    const { jwt: expired } = await service.sign(message, { expiresIn: -60 });
    await expect(service.verify(expired)).rejects.toThrow();
  });
});

describe("SecurityService.signAccessToken", () => {
  test("signs an access token for one hour unless the caller names another expiry", async () => {
    const service = serviceOf();
    const { jwt, expiresAt } = await service.signAccessToken({}, { sid: "s1", jti: "j1" });
    const { exp, iat } = decodeJwtPayload<{ exp: number; iat: number }>(jwt);
    expect(accessTokenSeconds).toBe(60 * 60);
    expect(Math.abs(exp - iat - accessTokenSeconds)).toBeLessThanOrEqual(1);
    expect(expiresAt.unix()).toBe(exp);

    const named = await service.signAccessToken({}, { sid: "s1", jti: "j2", expiresAt: dayjs().add(5, "minute") });
    const longer = decodeJwtPayload<{ exp: number; iat: number }>(named.jwt);
    expect(Math.abs(longer.exp - longer.iat - 300)).toBeLessThanOrEqual(1);
  });
});
