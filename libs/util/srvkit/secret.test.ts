import { afterEach, describe, expect, test } from "bun:test";
import { generateJwtSecret, resolveJwtSecret } from "./secret";

describe("resolveJwtSecret", () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  test("prefers JWT_SECRET env over configured and generated secrets", () => {
    process.env.JWT_SECRET = "from-env";
    expect(resolveJwtSecret("akasys", "local", "from-config", "repo")).toBe("from-env");
  });

  test("uses configured secret when JWT_SECRET is unset", () => {
    delete process.env.JWT_SECRET;
    expect(resolveJwtSecret("akasys", "local", "from-config", "repo")).toBe("from-config");
  });

  test("falls back to generateJwtSecret with the same seed", () => {
    delete process.env.JWT_SECRET;
    expect(resolveJwtSecret("akasys", "local", undefined, "repo")).toBe(generateJwtSecret("akasys", "local", "repo"));
  });
});
