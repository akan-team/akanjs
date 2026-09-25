import type * as option from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: option.ModulesOptions = {
  ...libEnv,
  hostname: null,
  security: {
    verifies: [["password"]],
    sso: {},
  },
  objectStorage: undefined,
  cloudflare: undefined,
  mailer: undefined,
  message: undefined,
  discord: undefined,
  iapVerify: undefined,
  firebase: undefined,
};
