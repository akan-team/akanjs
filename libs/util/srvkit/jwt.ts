import type { Dayjs } from "akanjs/base";
import { errors, jwtVerify as joseVerify, SignJWT } from "jose";

const encodeSecret = (secret: string) => new TextEncoder().encode(secret);

export interface JwtSignOption {
  expiresAt?: Dayjs;
  jwtId?: string;
  issuedAt?: boolean;
}

export const jwtSign = async (
  message: object,
  secret: string,
  { expiresAt, jwtId, issuedAt }: JwtSignOption = {},
): Promise<string> => {
  const payload = JSON.parse(JSON.stringify(message));
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });
  if (issuedAt) jwt = jwt.setIssuedAt();
  if (expiresAt) jwt = jwt.setExpirationTime(expiresAt.toDate());
  if (jwtId) jwt = jwt.setJti(jwtId);
  return await jwt.sign(encodeSecret(secret));
};

export const jwtVerify = async (message: string, secret: string): Promise<Record<string, unknown>> => {
  const { payload } = await joseVerify(message, encodeSecret(secret), { algorithms: ["HS256"] });
  return payload;
};

//? jose checks the signature before the claims, so the claims of a token it calls expired are this secret's own.
export const expiredJwtClaims = (error: unknown): Record<string, unknown> | null =>
  error instanceof errors.JWTExpired ? error.payload : null;
