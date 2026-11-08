import { describe, expect, test } from "bun:test";
import { decodeJwtPayload } from "akanjs/common";

import { SecurityService } from "./security.service";

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
