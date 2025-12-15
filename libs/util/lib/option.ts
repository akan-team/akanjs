import type { SshOptions } from "@akanjs/base";
import { generateAeskey, generateHost, generateJwtSecret, resolveJwt } from "@akanjs/nest";
import { Middleware, useGlobals } from "@akanjs/server";
import { Account } from "@akanjs/signal";

import type {
  CloudflareOptions,
  DiscordOptions,
  EmailOptions,
  FirebaseOptions,
  IpfsOptions,
  ObjectStorageOptions,
  PurpleOptions,
} from "../nest";
import {
  BlobStorageApi,
  CloudflareApi,
  DiscordApi,
  EmailApi,
  FirebaseApi,
  IpfsApi,
  ObjectStorageApi,
  PurpleApi,
} from "../nest";
import type { LibOptions } from "./__lib/lib.service";

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
  hostname: string | null;
  redis: RedisOptions;
  mongo: MongoOptions;
  security: SecurityOptions;
  objectStorage?: ObjectStorageOptions;
  ipfs?: IpfsOptions;
  discord?: DiscordOptions;
  mailer?: EmailOptions;
  message?: PurpleOptions;
  cloudflare?: CloudflareOptions;
  firebase?: FirebaseOptions;
  iapVerify?: {
    google: GoogleAccount;
    apple: string;
  };
};

export const registerGlobalModule = (options: ModulesOptions) => {
  const blobStorageApi = new BlobStorageApi(options.appName, {
    baseDir: "local",
    urlPrefix:
      options.operationMode === "local"
        ? `http://localhost:${process.env.PORT ?? options.port ?? 8080}/backend/localFile/getBlob`
        : "/backend/localFile/getBlob",
  });
  return useGlobals({
    uses: {
      cloudflareApi: options.cloudflare ? new CloudflareApi(options.cloudflare) : null,
      firebaseApi: options.firebase ? new FirebaseApi(options.firebase) : null,
      emailApi: options.mailer ? new EmailApi(options.mailer) : null,
      ipfsApi: options.ipfs ? new IpfsApi(options.ipfs) : null,
      purpleApi: options.message ? new PurpleApi(options.message) : null,
      storageApi: options.objectStorage ? new ObjectStorageApi(options.appName, options.objectStorage) : blobStorageApi,
      blobStorageApi,
      jwtSecret: generateJwtSecret(options.appName, options.environment),
      aeskey: generateAeskey(options.appName, options.environment),
      host: generateHost(options),
    },
    useAsyncs: {
      discordApi: async () => {
        return options.discord ? await new DiscordApi(options.discord).initBots() : null;
      },
    },
  });
};

export const registerGlobalMiddlewares = (options: ModulesOptions) => {
  const jwtSecret = generateJwtSecret(options.appName, options.environment);
  return [
    (req, res, next) => {
      const requestHeader = req as unknown as {
        headers: { authorization?: string };
        cookies?: { jwt?: string };
        "user-agent"?: string;
        userAgent?: string;
        account?: Account;
      };
      requestHeader.account = resolveJwt<Account>(
        jwtSecret,
        requestHeader.headers.authorization ??
          (requestHeader.cookies?.jwt ? `Bearer ${requestHeader.cookies.jwt}` : undefined),
        { appName: options.appName, environment: options.environment } as unknown as Account
      );
      requestHeader.userAgent = requestHeader["user-agent"];
      next();
    },
  ] as Middleware[];
};
