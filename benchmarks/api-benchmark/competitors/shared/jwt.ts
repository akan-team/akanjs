import { jwtVerify, SignJWT } from "jose";

/**
 * Shared HS256 JWT helper so the "realistic" axis (auth + DB + serialize) is applied
 * identically across every competitor and matches what akanjs does per request.
 */
const SECRET = new TextEncoder().encode(process.env.BENCH_JWT_SECRET ?? "akan-bench-shared-secret-please-override");

export const signBenchToken = async (sub: string): Promise<string> =>
  await new SignJWT({ sub, role: "user", tokenType: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);

export const verifyBenchToken = async (
  authHeader: string | null | undefined,
): Promise<Record<string, unknown> | null> => {
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
};
