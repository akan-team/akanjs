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
  assertJwtSecretConfigured,
  BlobStorageApi,
  CloudflareApi,
  DiscordApi,
  EmailApi,
  generateAeskey,
  generateHost,
  ObjectStorageApi,
  PurpleApi,
  resolveJwtSecret,
} from "@libs/util/srvkit";
import { getEnv, type SshOptions } from "akanjs/base";
import { AkanOption } from "akanjs/server";
import { BlobStorage } from "akanjs/service";
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
  jwtSecret: string;
  aeskey?: string;
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
  security: SecurityOptions;
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
  const env = getEnv();
  const blobStorageApi = new BlobStorageApi(env.appName, {
    baseDir: "local",
    urlPrefix:
      env.operationMode === "local"
        ? `http://localhost:${process.env.PORT ?? options.port ?? 8282}/api/localFile/getBlob`
        : "/api/localFile/getBlob",
  });
  // A closed-network kit has no route to the object store, and CI replaces an app's env file with its own, so the
  // deployment's STORAGE_MODE=local is what keeps its files on the local blob storage whatever the env configures.
  const isLocalStorageOnly = process.env.STORAGE_MODE === "local";
  const objectStorage = isLocalStorageOnly ? undefined : options.objectStorage;
  const privateStorage = isLocalStorageOnly ? undefined : options.privateStorage;
  if (!objectStorage) BlobStorage.assertShared("Without `objectStorage`, libs/util storage");
  const storageApi = objectStorage ? new ObjectStorageApi(env.appName, objectStorage) : blobStorageApi;
  // Private-only storage. On R2/S3 access control is bucket-level (R2 ignores per-object ACL),
  // so private files must live in a separate bucket that has NO public access configured.
  // Falls back to the public storageApi when `privateStorage` is not configured (e.g. local blob backend).
  const privStorageApi = privateStorage ? new ObjectStorageApi(env.appName, privateStorage) : storageApi;
  assertJwtSecretConfigured({ operationMode: env.operationMode, configuredSecret: options.security?.jwtSecret });
  return {
    cloudflareApi: options.cloudflare ? new CloudflareApi(options.cloudflare) : null,
    emailApi: options.mailer ? new EmailApi(options.mailer) : null,
    purpleApi: options.message ? new PurpleApi(options.message) : null,
    storageApi,
    privStorageApi,
    blobStorageApi,
    jwtSecret: resolveJwtSecret(env.appName, env.environment, options.security?.jwtSecret),
    aeskey:
      process.env.AES_KEY ?? options.security?.aeskey ?? generateAeskey(env.appName, env.environment, env.repoName),
    host: generateHost(options),
    discordApi: options.discord ? new DiscordApi(options.discord).initBots() : null,
  };
});
