import { Logger } from "akanjs/common";

import type { SigninDevice } from "./signinClient";

export type SecuritySignal =
  | {
      kind: "signinLocked";
      subject: "user" | "admin";
      accountId: string;
      ip: string | null;
      scope: "caller" | "account";
    }
  | {
      kind: "refreshReuse";
      subject: "user" | "admin";
      subjectId: string;
      revokes: "account" | "lineage";
      clientId?: string; // the OAuth client the reused token was issued to; unset for a first-party session
    }
  | {
      kind: "newDeviceSignin";
      subject: "user";
      subjectId: string;
      sessionId: string;
      device: SigninDevice;
    };

export interface SecuritySignalHook {
  onSignal?: (signal: SecuritySignal) => Promise<void> | void;
}

const logger = new Logger("SecuritySignal");

let hook: SecuritySignalHook = {};

export const setSecuritySignalHook = (next: SecuritySignalHook) => {
  hook = next;
};

//? Never awaited: a record that fails or hangs must not hold up the sign-in or refresh that raised it.
export const emitSecuritySignal = (signal: SecuritySignal) => {
  const { onSignal } = hook;
  if (!onSignal) return;
  void Promise.resolve()
    .then(() => onSignal(signal))
    .catch((error: unknown) => logger.warn(`security signal hook failed - ${(error as Error).message}`));
};
