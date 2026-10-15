import { createOpaqueToken, hashToken, jwtSign, jwtVerify } from "@libs/util/srvkit";
import { type Dayjs, dayjs, getEnv } from "akanjs/base";
import { serve } from "akanjs/service";

import { Err } from "../dict";

interface SignOption {
  expiresIn?: number; // seconds; omitted, the token never expires
  typ?: string; // what the token is for; `verify` with the same `typ` refuses any other kind
}

export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
})) {
  readonly refreshTokenDays = 30;

  async sign(message: object, { expiresIn, typ }: SignOption = {}) {
    const expiresAt = expiresIn ? dayjs().add(expiresIn, "second") : undefined;
    const claims = typ ? { ...message, typ } : message;
    return { jwt: await jwtSign(claims, this.jwtSecret, { expiresAt, issuedAt: !!expiresAt }) };
  }
  async signAccessToken(
    data: Record<string, unknown>,
    { sid, jti, expiresAt = dayjs().add(7, "day") }: { sid: string; jti: string; expiresAt?: Dayjs },
  ): Promise<{
    jwt: string;
    expiresAt: Dayjs;
  }> {
    const jwt = await jwtSign(
      {
        ...data,
        appName: getEnv().appName,
        environment: getEnv().environment,
        tokenType: "access",
        sid,
      },
      this.jwtSecret,
      { expiresAt, issuedAt: true, jwtId: jti },
    );
    return { jwt, expiresAt };
  }
  createRefreshToken() {
    const refreshToken = createOpaqueToken();
    return {
      refreshToken,
      refreshTokenHash: hashToken(refreshToken),
      refreshTokenExpiresAt: dayjs().add(this.refreshTokenDays, "day").toDate(),
    };
  }
  hashRefreshToken(refreshToken: string) {
    return hashToken(refreshToken);
  }
  async verify<T extends object = Record<string, unknown>>(token: string, { typ }: Pick<SignOption, "typ"> = {}) {
    const payload = await jwtVerify(token, this.jwtSecret);
    if (typ !== undefined && payload.typ !== typ) throw new Err("security.error.unexpectedTokenType", { typ });
    return payload as T;
  }
}
