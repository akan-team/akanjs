import { ShellOnlyEnv } from "../../shellOnlyEnv";

export const akanCodeGuardedEnv = [
  "AKAN_CODE_HOME",
  "AKAN_CODE_CAN_PROMPT",
  "AKAN_CODE_PROXY_URL",
  "AKAN_CODE_PROXY_TOKEN",
  "AKAN_CODE_PROXY_TOKEN_FILE",
  "AKAN_CODE_PROXY_PROVIDERS",
  "AKAN_CODE_RPC_TOKEN_FILE",
] as const;

export type AkanCodeGuardedEnvKey = (typeof akanCodeGuardedEnv)[number];

// Each key moves the credential store, a confirmation or the model traffic.
export class AkanCodeEnv {
  static readonly #env = new ShellOnlyEnv(akanCodeGuardedEnv);

  static get(key: AkanCodeGuardedEnvKey): string | undefined {
    return AkanCodeEnv.#env.get(key);
  }

  static ignored() {
    return AkanCodeEnv.#env.ignored();
  }
}
