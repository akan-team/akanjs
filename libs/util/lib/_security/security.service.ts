import {
  aesDecrypt,
  aesEncrypt,
  createOpaqueToken,
  hashToken,
  jwtSign,
  jwtVerify,
  resolveJwt,
} from "@libs/util/srvkit";
import { type Dayjs, dayjs, getEnv } from "akanjs/base";
import { serve } from "akanjs/service";

export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
  aeskey: use<string>(),
})) {
  readonly refreshTokenDays = 30;

  async decrypt(hash: string) {
    return await aesDecrypt(hash, this.aeskey);
  }
  async encrypt(data: string) {
    return await aesEncrypt(data, this.aeskey);
  }
  async sign(message: object) {
    return { jwt: await jwtSign(message, this.jwtSecret) };
  }
  async signAccessToken(
    data: Record<string, unknown>,
    { sid, jti }: { sid: string; jti: string },
  ): Promise<{
    jwt: string;
    expiresAt: Dayjs;
  }> {
    const expiresAt = dayjs().add(7, "day");
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
  async verify<T extends object = Record<string, unknown>>(token: string): Promise<T> {
    return (await jwtVerify(token, this.jwtSecret)) as T;
  }
  async addJwt(data: Record<string, unknown>, existing: Record<string, unknown> = {}): Promise<{ jwt: string }> {
    return await this.sign({ ...existing, ...data, appName: getEnv().appName, environment: getEnv().environment });
  }
  async subJwt(existing: Record<string, unknown>, keys: string | string[]): Promise<{ jwt: string }> {
    const removeKeys = Array.isArray(keys) ? keys : [keys];
    const newJwt = Object.fromEntries(Object.entries(existing).filter(([key]) => !removeKeys.includes(key))) as {
      [key: string]: unknown;
    };
    return await this.sign({ ...newJwt, appName: getEnv().appName, environment: getEnv().environment });
  }
  async verifyToken(token?: string) {
    return await resolveJwt(this.jwtSecret, token, { appName: getEnv().appName, environment: getEnv().environment });
  }
}
