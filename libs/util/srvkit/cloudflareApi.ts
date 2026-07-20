import { Logger } from "akanjs/common";
import { webcrypto } from "crypto";
import { Err } from "../lib/dict";
import type { CloudflareResponse, Dns, DnsInput } from "./cloudflareApi.helper";

export interface CloudflareApiOptions {
  authEmail: string;
  authKey: string;
  token: string;
  accountId: string;
  turnstileSecret: string;
}

export class CloudflareApi {
  readonly #logger = new Logger("CloudflareApi");
  readonly #options: CloudflareApiOptions;
  readonly #baseUrl = "https://api.cloudflare.com/client/v4";
  readonly #headers: Record<string, string>;

  constructor(options: CloudflareApiOptions) {
    this.#options = options;
    this.#headers = {
      "Content-Type": "application/json",
      "X-Auth-Key": options.authKey,
      "X-Auth-Email": options.authEmail,
      Authorization: `Bearer ${options.token}`,
    };
  }

  async #api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: { ...this.#headers, ...init?.headers },
      signal: AbortSignal.timeout(20_000),
    });
    return (await response.json()) as T;
  }

  // Utilities functions
  static arrayBufferToBase64Url(buffer: ArrayBuffer) {
    const asc = String.fromCharCode(...new Uint8Array(buffer));
    return Buffer.from(asc, "binary").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  static objectToBase64url(payload: object) {
    return CloudflareApi.arrayBufferToBase64Url(
      new TextEncoder().encode(JSON.stringify(payload)).buffer as unknown as ArrayBuffer,
    );
  }

  async getDnsZones() {
    return await this.#api(`/zones`);
  }
  async applyDnsRecords(zoneId: string, records: DnsInput[], cfApiToken: string) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfApiToken}`,
    };
    const response = await fetch(`${this.#baseUrl}/zones/${zoneId}/dns_records?per_page=5000`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json()) as CloudflareResponse<Dns[] | null>;
    if (!data.success || !Array.isArray(data.result)) {
      throw new Err("util.error.cloudflareDnsRecordsLoadFailed", { errors: JSON.stringify(data.errors ?? data) });
    }
    const existings = data.result;
    const toCreate = records.filter((r) => !existings.find((er) => er.name === r.name));
    const toUpdate = records.flatMap((record) => {
      const existing = existings.find((er) => er.name === record.name);
      return existing && existing.content !== record.content ? [{ existing, record }] : [];
    });
    for (const record of toCreate) {
      const response = await fetch(`${this.#baseUrl}/zones/${zoneId}/dns_records`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...record, ttl: 1 }),
      });
      const data = (await response.json()) as CloudflareResponse<Dns | null>;
      if (!data.success)
        throw new Err("util.error.cloudflareDnsRecordCreateFailed", { errors: JSON.stringify(data.errors) });
    }
    for (const { existing, record } of toUpdate) {
      const response = await fetch(`${this.#baseUrl}/zones/${zoneId}/dns_records/${existing.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...record, ttl: 1 }),
      });
      const data = (await response.json()) as CloudflareResponse<Dns | null>;
      if (!data.success)
        throw new Err("util.error.cloudflareDnsRecordUpdateFailed", { errors: JSON.stringify(data.errors) });
    }
    this.#logger.log(`${toCreate.length} records created, ${toUpdate.length} records updated`);
    return true;
  }
  async deleteDnsRecords(zoneId: string, records: DnsInput[]) {
    const { result: existings } = await this.#api<{ result: Dns[] }>(`/zones/${zoneId}/dns_records?per_page=5000`);
    const toDelete = existings.filter((er) => records.find((r) => er.name === r.name && er.content === r.content));
    for (const record of toDelete) await this.#api(`/zones/${zoneId}/dns_records/${record.id}`, { method: "DELETE" });
    return true;
  }
  async createSignedUrlToken(videoUid: string, expireTimeMs: number) {
    const {
      result: { id: keyId, jwk: jwkKey },
    } = await this.#api<{ result: { id: string; jwk: string } }>(`/accounts/${this.#options.accountId}/stream/keys`, {
      method: "POST",
    });
    const encoder = new TextEncoder();
    const expiresIn = Math.floor(Date.now() / 1000) + Math.floor(expireTimeMs / 1000);
    const headers = { alg: "RS256", kid: keyId };
    const data = { sub: videoUid, kid: keyId, exp: expiresIn, accessRules: [] };
    const token = `${CloudflareApi.objectToBase64url(headers)}.${CloudflareApi.objectToBase64url(data)}`;
    const jwk = JSON.parse(Buffer.from(jwkKey, "base64").toString("binary")) as JsonWebKey;
    const key = await webcrypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const signature = await webcrypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, encoder.encode(token));
    const signedToken = `${token}.${CloudflareApi.arrayBufferToBase64Url(signature)}`;
    return signedToken;
  }
  async isVerified(token: string) {
    const formData = new FormData();
    formData.append("secret", this.#options.turnstileSecret);
    formData.append("response", token);
    const response = await fetch(`https://challenges.cloudflare.com/turnstile/v0/siteverify`, {
      method: "POST",
      body: formData,
    });
    const { success } = (await response.json()) as { success: boolean };
    return success;
  }
}
