import { baseEnv } from "@akanjs/base";
import { resolveJwt } from "@akanjs/nest";
import { serve } from "@akanjs/service";
import { aesDecrypt, aesEncrypt, jwtSign, jwtVerify } from "@util/nest";

export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
  aeskey: use<string>(),
})) {
  decrypt(hash: string) {
    return aesDecrypt(hash, this.aeskey);
  }
  encrypt(data: string) {
    return aesEncrypt(data, this.aeskey);
  }
  sign(message: string | Record<string, any>) {
    return { jwt: jwtSign(message, this.jwtSecret) };
  }
  verify(token: string) {
    return jwtVerify(token, this.jwtSecret);
  }
  addJwt(data: { [key: string]: any }, existing: { [key: string]: any } = {}): { jwt: string } {
    return this.sign({ ...existing, ...data, appName: baseEnv.appName, environment: baseEnv.environment });
  }
  subJwt(existing: { [key: string]: any }, keys: string | string[]) {
    const removeKeys = Array.isArray(keys) ? keys : [keys];
    const newJwt = Object.fromEntries(Object.entries(existing).filter(([key, value]) => !removeKeys.includes(key))) as {
      [key: string]: any;
    };
    return this.sign({ ...newJwt, appName: baseEnv.appName, environment: baseEnv.environment });
  }
  verifyToken(token?: string) {
    return resolveJwt(this.jwtSecret, token, { appName: baseEnv.appName, environment: baseEnv.environment });
  }
}
