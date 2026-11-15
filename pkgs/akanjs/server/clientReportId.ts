import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

//? Security: a report is taken only with the id its page view was given. Signed rather than stored, so every replica
//? takes an id another issued; the time is signed in, so an id is taken for one to two buckets and no longer.
export class ClientReportId {
  static readonly keyEnv = "AKAN_CLIENT_REPORT_KEY";
  static readonly bucketMs = 30 * 60_000;
  static readonly minSecretLength = 32;
  static readonly #shape = /^([0-9a-f]{32})\.([\w-]{22})$/;
  static readonly #processKey = randomBytes(32);

  static sign(traceId: string, now = Date.now()): string {
    return `${traceId}.${ClientReportId.#mac(traceId, ClientReportId.#bucketOf(now)).toString("base64url")}`;
  }

  static verify(value: unknown, now = Date.now()): string | null {
    const [, traceId, mac] = (typeof value === "string" ? ClientReportId.#shape.exec(value) : null) ?? [];
    if (!traceId || !mac) return null;
    const given = Buffer.from(mac, "base64url");
    const bucket = ClientReportId.#bucketOf(now);
    //? Both buckets are compared whatever the first says, so a wrong mac costs what a right one does.
    const matched = [bucket, bucket - 1].map((at) => timingSafeEqual(given, ClientReportId.#mac(traceId, at)));
    return matched.includes(true) ? traceId : null;
  }

  static #bucketOf(now: number): number {
    return Math.floor(now / ClientReportId.bucketMs);
  }

  //? 16 of the 32 bytes: the value rides a response header on every page, and a guess is still one in 2^128.
  static #mac(traceId: string, bucket: number): Buffer {
    return createHmac("sha256", ClientReportId.#key()).update(`${traceId}\n${bucket}`).digest().subarray(0, 16);
  }

  //? `AKAN_LOG_DEBUG_HEADER` is the secret every server of a deployment already shares (devtools signs its unlock with
  //? it); without it the gateway's replicas share the key it made at start, and a lone process keeps its own. The app
  //? and environment are signed in, so apps or environments sharing one secret do not take each other's ids.
  static #key(): Buffer {
    const shared = process.env.AKAN_LOG_DEBUG_HEADER;
    const material =
      shared && shared.length >= ClientReportId.minSecretLength
        ? shared
        : process.env[ClientReportId.keyEnv] || ClientReportId.#processKey;
    const scope = ["akan-client-report", process.env.AKAN_PUBLIC_APP_NAME ?? "", process.env.AKAN_PUBLIC_ENV ?? ""];
    return createHmac("sha256", material).update(JSON.stringify(scope)).digest();
  }
}
