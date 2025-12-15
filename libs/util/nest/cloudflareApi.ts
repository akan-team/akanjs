import { Logger } from "@akanjs/common";
import axios, { type AxiosInstance } from "axios";
import { webcrypto } from "crypto";

interface DnsInput {
  name: string;
  type: string;
  content: string;
}
type Dns = DnsInput & {
  id: string;
};
export interface CloudflareOptions {
  authEmail: string;
  authKey: string;
  token: string;
  accountId: string;
  turnstileSecret: string;
}

export class CloudflareApi {
  readonly #logger = new Logger("CloudflareApi");
  readonly #options: CloudflareOptions;
  readonly #dnsApi: AxiosInstance;
  readonly #robotCheckApi: AxiosInstance;

  constructor(options: CloudflareOptions) {
    this.#dnsApi = axios.create({
      baseURL: `https://api.cloudflare.com/client/v4`,
      timeout: 20000,
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Key": options.authKey,
        "X-Auth-Email": options.authEmail,
        Authorization: `Bearer ${options.token}`,
      },
    });
    this.#robotCheckApi = axios.create({
      baseURL: `https://challenges.cloudflare.com/turnstile/v0`,
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  // Utilities functions
  static arrayBufferToBase64Url(buffer: ArrayBuffer) {
    const asc = String.fromCharCode(...new Uint8Array(buffer));
    return Buffer.from(asc, "binary").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  static objectToBase64url(payload: object) {
    return this.arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  }

  async getDnsZones() {
    return await this.#dnsApi.get(`/zones`);
  }
  async applyDnsRecords(zoneId: string, records: DnsInput[]) {
    const existings = (await this.#dnsApi.get<{ result: Dns[] }>(`/zones/${zoneId}/dns_records?per_page=5000`)).data
      .result;
    const toCreate = records.filter((r) => !existings.find((er) => er.name === r.name));
    const toUpdate = existings.filter((er) => records.find((r) => er.name === r.name && er.content !== r.content));
    for (const record of toCreate)
      await this.#dnsApi.post(`/zones/${zoneId}/dns_records`, {
        ...record,
        ttl: 1,
      });
    for (const record of toUpdate)
      await this.#dnsApi.put(`/zones/${zoneId}/dns_records/${record.id}`, {
        ...record,
        ttl: 1,
      });
    this.#logger.log(`${toCreate.length} records created, ${toUpdate.length} records updated`);
    return true;
  }
  async deleteDnsRecords(zoneId: string, records: DnsInput[]) {
    const existings = (await this.#dnsApi.get<{ result: Dns[] }>(`/zones/${zoneId}/dns_records?per_page=5000`)).data
      .result;
    const toDelete = existings.filter((er) => records.find((r) => er.name === r.name && er.content === r.content));
    for (const record of toDelete) await this.#dnsApi.delete(`/zones/${zoneId}/dns_records/${record.id}`);
    return true;
  }
  async createSignedUrlToken(videoUid: string, expireTimeMs: number) {
    const { id: keyId, jwk: jwkKey } = (
      await this.#dnsApi.post<{ result: { id: string; jwk: string } }>(
        `/accounts/${this.#options.accountId}/stream/keys`
      )
    ).data.result;
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
    return (
      await this.#robotCheckApi.post<{ success: boolean }>(`/siteverify`, {
        secret: this.#options.turnstileSecret,
        response: token,
      })
    ).data.success;
  }
}
