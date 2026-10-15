import { jwtSign, jwtVerify, resolveJwtSecret } from "@libs/util/srvkit";
import { dayjs, getEnv } from "akanjs/base";
import type { SignalContext } from "akanjs/signal";

interface SignupTokenEnv {
  security?: { jwtSecret?: string };
}

/**
 * Proof that a prepare user's sign-up is the caller's. The user id alone travels in URLs, cookies and logs, so it
 * grants nothing: every sign-up step and the activation want this token, whose `sub` names the draft. It is a JWT
 * under the app's own secret with `typ: "signup"`, so an access token, an invite or another app's token never
 * passes for one.
 */
export class SignupToken {
  static readonly typ = "signup";
  static readonly seconds = 24 * 60 * 60;

  static async sign(userId: string, jwtSecret: string) {
    const { appName, environment } = getEnv();
    return await jwtSign({ sub: userId, typ: SignupToken.typ, appName, environment }, jwtSecret, {
      expiresAt: dayjs().add(SignupToken.seconds, "second"),
      issuedAt: true,
    });
  }

  static async verify(token: string, jwtSecret: string): Promise<string | null> {
    const { appName, environment } = getEnv();
    try {
      const payload = await jwtVerify(token, jwtSecret);
      if (payload.typ !== SignupToken.typ || payload.appName !== appName || payload.environment !== environment)
        return null;
      return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }

  static secretOf(context: SignalContext) {
    const { appName, environment } = getEnv();
    return resolveJwtSecret(appName, environment, (context.getEnv() as SignupTokenEnv).security?.jwtSecret);
  }

  static async userIdOf(context: SignalContext) {
    const token = context.getArg("signupToken");
    if (typeof token !== "string" || !token) return null;
    return await SignupToken.verify(token, SignupToken.secretOf(context));
  }
}
