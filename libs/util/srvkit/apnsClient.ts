import { createPrivateKey, type KeyObject, sign } from "node:crypto";
import { type ClientHttp2Session, connect } from "node:http2";

import type { PushNotificationMessage } from "./pushNotificationServer.type";

export interface ApnsCredentials {
  teamId: string;
  keyId: string;
  // The .p8 signing key's PEM text.
  privateKey: string;
  // The app's bundle id, sent as `apns-topic`.
  bundleId: string;
  // Unset: production first, and the sandbox for a token production calls bad (a development build's token).
  environment?: "production" | "sandbox";
}

export type ApnsEnvironment = "production" | "sandbox";

export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string };

interface ApnsResponse {
  status: number;
  reason: string;
}

export class ApnsClient {
  static readonly hosts: { [env in ApnsEnvironment]: string } = {
    production: "https://api.push.apple.com",
    sandbox: "https://api.sandbox.push.apple.com",
  };
  //? Apple refuses a provider token older than an hour and answers TooManyProviderTokenUpdates to one renewed
  //? more often than every 20 minutes, so one token serves 50 minutes.
  static readonly tokenLifetimeMs = 50 * 60 * 1000;
  static readonly requestTimeoutMs = 20_000;

  readonly #credentials: ApnsCredentials;
  readonly #hosts: { [env in ApnsEnvironment]: string };
  readonly #sessions = new Map<ApnsEnvironment, ClientHttp2Session>();
  #key: KeyObject | null = null;
  #providerToken: { value: string; issuedAt: number } | null = null;

  constructor(credentials: ApnsCredentials, { hosts = ApnsClient.hosts } = {}) {
    this.#credentials = credentials;
    this.#hosts = hosts;
  }

  static #base64url(value: string | Buffer) {
    return Buffer.from(value).toString("base64url");
  }

  providerToken(now = Date.now()) {
    if (this.#providerToken && now - this.#providerToken.issuedAt < ApnsClient.tokenLifetimeMs)
      return this.#providerToken.value;
    this.#key ??= createPrivateKey(this.#credentials.privateKey.replace(/\\n/g, "\n"));
    const header = ApnsClient.#base64url(JSON.stringify({ alg: "ES256", kid: this.#credentials.keyId }));
    const claims = ApnsClient.#base64url(
      JSON.stringify({ iss: this.#credentials.teamId, iat: Math.floor(now / 1000) }),
    );
    //? JWS ES256 is the raw r||s pair, not the DER sequence node signs by default.
    const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: this.#key, dsaEncoding: "ieee-p1363" });
    const value = `${header}.${claims}.${ApnsClient.#base64url(signature)}`;
    this.#providerToken = { value, issuedAt: now };
    return value;
  }

  //? The deep link sits at the top level beside `aps`: the native push plugin hands the app every key but `aps`.
  static payloadOf({ title, body, url, tag, badge, data }: PushNotificationMessage) {
    return {
      aps: {
        alert: { title, body },
        sound: "default",
        "mutable-content": 1,
        ...(badge !== undefined ? { badge } : {}),
        ...(tag ? { "thread-id": tag } : {}),
      },
      ...(data ?? {}),
      ...(url ? { url } : {}),
    };
  }

  async send(deviceToken: string, message: PushNotificationMessage): Promise<ApnsResult> {
    const payload = JSON.stringify(ApnsClient.payloadOf(message));
    const headers = {
      "apns-topic": this.#credentials.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(message.tag ? { "apns-collapse-id": message.tag.slice(0, 64) } : {}),
    };
    const environments: ApnsEnvironment[] = this.#credentials.environment
      ? [this.#credentials.environment]
      : ["production", "sandbox"];
    let response: ApnsResponse = { status: 0, reason: "NotSent" };
    for (const environment of environments) {
      response = await this.#request(environment, deviceToken, payload, headers);
      if (response.status === 200) return { ok: true };
      if (response.reason !== "BadDeviceToken") break;
    }
    return { ok: false, ...response };
  }

  // The token will never be delivered to again, so its owner should stop storing it.
  static isGone({ status, reason }: { status: number; reason: string }) {
    return status === 410 || reason === "BadDeviceToken";
  }

  close() {
    for (const session of this.#sessions.values()) session.close();
    this.#sessions.clear();
  }

  #session(environment: ApnsEnvironment) {
    const current = this.#sessions.get(environment);
    if (current && !current.closed && !current.destroyed) return current;
    const session = connect(this.#hosts[environment]);
    const forget = () => {
      if (this.#sessions.get(environment) === session) this.#sessions.delete(environment);
    };
    session.on("error", forget);
    session.on("goaway", forget);
    session.on("close", forget);
    session.unref();
    this.#sessions.set(environment, session);
    return session;
  }

  #request(
    environment: ApnsEnvironment,
    deviceToken: string,
    payload: string,
    headers: Record<string, string>,
  ): Promise<ApnsResponse> {
    return new Promise((resolve) => {
      let status = 0;
      let text = "";
      const settle = (response: ApnsResponse) => {
        clearTimeout(timer);
        resolve(response);
      };
      const timer = setTimeout(() => {
        request.close();
        settle({ status: 0, reason: "Timeout" });
      }, ApnsClient.requestTimeoutMs);
      const request = this.#session(environment).request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${this.providerToken()}`,
        "content-type": "application/json",
        ...headers,
      });
      request.setEncoding("utf8");
      request.on("response", (responseHeaders) => {
        status = Number(responseHeaders[":status"] ?? 0);
      });
      request.on("data", (chunk: string) => {
        text += chunk;
      });
      request.on("end", () => {
        if (status === 200) return settle({ status, reason: "" });
        try {
          settle({ status, reason: (JSON.parse(text) as { reason?: string }).reason ?? "Unknown" });
        } catch {
          settle({ status, reason: text || "Unknown" });
        }
      });
      request.on("error", (error) => settle({ status: 0, reason: error.message }));
      request.end(payload);
    });
  }
}
