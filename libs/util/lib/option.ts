import type {
  CloudflareApiOptions,
  DiscordApiOptions,
  EmailApiOptions,
  IpfsApiOptions,
  ObjectStorageOptions,
  PurpleApiOptions,
  PushNotificationServerOptions,
} from "@libs/util/srvkit";
import {
  BlobStorageApi,
  CloudflareApi,
  DiscordApi,
  EmailApi,
  generateAeskey,
  generateHost,
  generateJwtSecret,
  ObjectStorageApi,
  PurpleApi,
} from "@libs/util/srvkit";
import type { SshOptions } from "akanjs/base";
import { AkanOption } from "akanjs/server";
import type { LibOptions } from "./srv";

export interface RedisOptions {
  username?: string;
  password?: string;
  sshOptions?: SshOptions;
}
export interface Wallet {
  address: string;
  privateKey: string;
}

export const ssoTypes = ["github", "google", "facebook", "apple", "naver", "kakao"] as const;
export type SSOType = (typeof ssoTypes)[number];

export interface SSOCredential {
  clientID: string;
  clientSecret?: string; //apple의 경우 keypath
}
export type AppleCredential = SSOCredential & {
  teamID: string;
  keyID: string;
  keyFilePath: string;
};
export type SSOOptions = {
  [key in SSOType]?: SSOCredential | AppleCredential;
};

export interface SecurityOptions {
  verifies: ("wallet" | "password" | "phone" | "kakao" | "naver" | "email")[][];
  sso: SSOOptions;
}

export interface MongoOptions {
  password?: string;
  replSet?: string;
  sshOptions?: SshOptions;
}
export interface GoogleAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

export type ModulesOptions = LibOptions & {
  hostname?: string | null;
  security?: SecurityOptions;
  objectStorage?: ObjectStorageOptions;
  privateStorage?: ObjectStorageOptions;
  ipfs?: IpfsApiOptions;
  discord?: DiscordApiOptions;
  mailer?: EmailApiOptions;
  message?: PurpleApiOptions;
  cloudflare?: CloudflareApiOptions;
  pushNoti?: PushNotificationServerOptions;
  iapVerify?: {
    google: GoogleAccount;
    apple: string;
  };
};

export const option = new AkanOption<ModulesOptions>().use((options) => {
  const blobStorageApi = new BlobStorageApi(options.appName, {
    baseDir: "local",
    urlPrefix:
      options.operationMode === "local"
        ? `http://localhost:${process.env.PORT ?? options.port ?? 8282}/api/localFile/getBlob`
        : "/api/localFile/getBlob",
  });
  const storageApi = options.objectStorage
    ? new ObjectStorageApi(options.appName, options.objectStorage)
    : blobStorageApi;
  // Private-only storage. On R2/S3 access control is bucket-level (R2 ignores per-object ACL),
  // so private files must live in a separate bucket that has NO public access configured.
  // Falls back to the public storageApi when `privateStorage` is not configured (e.g. local blob backend).
  const privStorageApi = options.privateStorage
    ? new ObjectStorageApi(options.appName, options.privateStorage)
    : storageApi;
  return {
    cloudflareApi: options.cloudflare ? new CloudflareApi(options.cloudflare) : null,
    emailApi: options.mailer ? new EmailApi(options.mailer) : null,
    purpleApi: options.message ? new PurpleApi(options.message) : null,
    storageApi,
    privStorageApi,
    blobStorageApi,
    jwtSecret: generateJwtSecret(options.appName, options.environment),
    aeskey: generateAeskey(options.appName, options.environment),
    host: generateHost(options),
    discordApi: options.discord ? new DiscordApi(options.discord).initBots() : null,
  };
});
