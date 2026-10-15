import type {
  DiscordApiOptions,
  EmailApiOptions,
  GithubOptions,
  IpfsApiOptions,
  ObjectStorageOptions,
  PurpleApiOptions,
  PushNotificationServerOptions,
} from "@libs/util/srvkit";
import { assertJwtSecretConfigured, generateHost, resolveJwtSecret } from "@libs/util/srvkit";
import { getEnv, type SshOptions } from "akanjs/base";
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
  jwtSecret: string;
  aeskey?: string; //? no longer read; the env files outside git still set it

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
  cloudflare?: unknown; //? no longer read (Turnstile and the Cloudflare adaptor are gone); env files outside git still set it
  githubAppInfo?: GithubOptions;
  pushNoti?: PushNotificationServerOptions;
  iapVerify?: {
    google: GoogleAccount;
    apple: string;
  };
};

export const option = new AkanOption<ModulesOptions>().use((options) => {
  const env = getEnv();
  assertJwtSecretConfigured({ operationMode: env.operationMode, configuredSecret: options.security?.jwtSecret });
  return {
    jwtSecret: resolveJwtSecret(env.appName, env.environment, options.security?.jwtSecret),
    host: generateHost(options),
  };
});
