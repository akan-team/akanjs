import {
  type AccessToken,
  type CloudApi,
  CloudHttpError,
  GlobalConfig,
  getDefaultHostConfig,
} from "@akanjs/devkit/cloud";
import { Backoff, Logger, RemoteAuthCode, sleep } from "akanjs/common";
import chalk from "chalk";
import * as QRcode from "qrcode";
import { openBrowser } from "../openBrowser";

type RemoteLoginApi = Pick<CloudApi, "host" | "getRemoteAuthToken" | "getRemoteSelf">;
type RemoteSelf = NonNullable<Awaited<ReturnType<CloudApi["getRemoteSelf"]>>>;

interface RemoteLoginOptions {
  pollMs?: number;
  limitMs?: number;
  maxBackoffMs?: number;
  selfAttempts?: number;
  open?: (url: string) => Promise<void>;
  wait?: (ms: number) => Promise<unknown>;
  now?: () => number;
}

export class RemoteLogin {
  readonly #api: RemoteLoginApi;
  readonly #pollMs: number;
  readonly #limitMs: number;
  readonly #maxBackoffMs: number;
  readonly #selfAttempts: number;
  readonly #open: (url: string) => Promise<void>;
  readonly #wait: (ms: number) => Promise<unknown>;
  readonly #now: () => number;

  constructor(
    api: RemoteLoginApi,
    {
      pollMs = 2_000,
      limitMs = 10 * 60_000,
      maxBackoffMs = 30_000,
      selfAttempts = 5,
      open = openBrowser,
      wait = sleep,
      now = Date.now,
    }: RemoteLoginOptions = {},
  ) {
    this.#api = api;
    this.#pollMs = pollMs;
    this.#limitMs = limitMs;
    this.#maxBackoffMs = maxBackoffMs;
    this.#selfAttempts = selfAttempts;
    this.#open = open;
    this.#wait = wait;
    this.#now = now;
  }

  //* The server hands the session out once and forgets it, so it is saved before the account is read.
  async signIn(remoteId = crypto.randomUUID()) {
    const loginId = await RemoteAuthCode.loginIdOf(remoteId);
    await this.#prompt(remoteId, loginId);
    const accessToken = await this.#awaitApproval(remoteId, loginId);
    const { host } = this.#api;
    await GlobalConfig.setHostConfig({ host, auth: { accessToken } });
    const self = await this.#readSelf();
    if (self) await GlobalConfig.setHostConfig({ host, auth: { accessToken, self } });
    return self;
  }

  // Security: the URL carries the login id only; the code derives from the device code, which is never in the link.
  async #prompt(remoteId: string, loginId: string) {
    const signinUrl = `${this.#api.host}/remoteAuth?remoteId=${encodeURIComponent(loginId)}`;
    Logger.rawLog(chalk.bold(`\n${chalk.green("➤")} Authentication Required`));
    Logger.rawLog(chalk.dim("Please visit or click the following URL:"));
    Logger.rawLog(`${chalk.cyan.underline(signinUrl)}\n`);
    try {
      Logger.rawLog(await QRcode.toString(signinUrl, { type: "terminal", small: true }));
      await this.#open(signinUrl);
      Logger.rawLog(chalk.dim("Opening browser..."));
    } catch {
      Logger.rawLog(chalk.yellow("Could not open browser. Please visit the URL manually."));
    }
    Logger.rawLog(`\n${chalk.bold("Your code:")} ${chalk.bold.inverse(` ${await RemoteAuthCode.of(remoteId)} `)}`);
    Logger.rawLog(
      chalk.dim("Enter this code on the sign-in page. Never enter a code that did not come from your own terminal.\n"),
    );
  }

  //* A cloud on the login-id contract answers the device code; one before it keeps the session under the URL's id.
  async #awaitApproval(remoteId: string, loginId: string): Promise<AccessToken> {
    Logger.rawLog(chalk.dim("Waiting for authentication..."));
    const deadline = this.#now() + this.#limitMs;
    const ids = [remoteId, loginId];
    let failures = 0;
    while (this.#now() < deadline) {
      const answers = await Promise.allSettled(ids.map((id) => this.#api.getRemoteAuthToken(id)));
      for (const answer of answers) if (answer.status === "fulfilled" && answer.value) return answer.value;
      const [device, legacy] = answers.map((answer) => (answer.status === "rejected" ? answer.reason : null));
      if (RemoteLogin.#isFinal(device)) throw this.#refusal(device);
      //? Only the device code's poll ends the wait: a cloud on the new contract may refuse the URL's id outright.
      if (RemoteLogin.#isFinal(legacy)) ids.pop();
      const errors = [device, legacy].filter((error) => error && !RemoteLogin.#isFinal(error));
      const retryAfterMs = Math.max(
        0,
        ...errors.map((error) => (error instanceof CloudHttpError ? error.retryAfterMs : null) ?? 0),
      );
      let waitMs = Math.max(this.#pollMs, retryAfterMs);
      if (answers.some((answer) => answer.status === "fulfilled")) failures = 0;
      else {
        if (failures++ === 0)
          Logger.rawLog(chalk.yellow(`Could not check the sign-in (${RemoteLogin.#reasonOf(errors[0])}); retrying...`));
        waitMs = Math.max(retryAfterMs, Backoff.delay(failures + 1, { min: this.#pollMs, max: this.#maxBackoffMs }));
      }
      await this.#wait(Math.min(waitMs, Math.max(0, deadline - this.#now())));
    }
    throw new Error(
      chalk.red(`✖ Authentication timed out after ${Math.round(this.#limitMs / 60_000)} minutes. Please try again.`),
    );
  }

  async #readSelf(): Promise<RemoteSelf | null> {
    let reason = "";
    for (let attempt = 1; attempt <= this.#selfAttempts; attempt++) {
      let self: RemoteSelf | null;
      try {
        self = await this.#api.getRemoteSelf();
      } catch (error) {
        reason = RemoteLogin.#reasonOf(error);
        if (attempt < this.#selfAttempts) await this.#wait(Backoff.delay(attempt, { min: 1_000, max: 8_000 }));
        continue;
      }
      if (self) return self;
      const { host } = this.#api;
      await GlobalConfig.setHostConfig(getDefaultHostConfig(host));
      throw new Error(chalk.red(`✖ ${host} did not take the session it handed out. Run akan login again.`));
    }
    Logger.rawLog(chalk.yellow(`Could not read the signed-in account (${reason}).`));
    return null;
  }

  //? 408 and 429 ask to come back later; any other 4xx is the server's answer and repeating the poll cannot change it.
  static #isFinal(error: unknown): error is CloudHttpError {
    return error instanceof CloudHttpError && error.status < 500 && error.status !== 408 && error.status !== 429;
  }

  #refusal(error: CloudHttpError) {
    const { host } = this.#api;
    if (error.status === 404 && !error.errKey)
      return new Error(chalk.red(`✖ ${host} does not serve Akan CLI sign-ins (HTTP 404): check --host.`), {
        cause: error,
      });
    return new Error(
      chalk.red(
        `✖ ${host} refused this sign-in (${error.errKey ?? `HTTP ${error.status}`}). Run akan login to start over.`,
      ),
      { cause: error },
    );
  }

  static #reasonOf(error: unknown) {
    if (error instanceof CloudHttpError) return error.errKey ?? `HTTP ${error.status}`;
    return error instanceof Error ? error.message : String(error);
  }
}
