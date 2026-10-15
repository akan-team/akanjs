import { dayjs } from "akanjs/base";
import { adapt } from "akanjs/service";
import { Err } from "../lib/dict";
import type { ModulesOptions } from "../lib/option";
import { SignalTestHarness } from "./signalTestHarness";

export interface PurpleApiOptions {
  phone: string;
  apiKey: string;
  apiSecret: string;
}
interface SolapiMessageService {
  send(message: { from: string; to: string; text: string }, options: { scheduledDate: string }): Promise<unknown>;
}
interface SolapiModule {
  SolapiMessageService: new (apiKey: string, apiSecret: string) => SolapiMessageService;
}
export class PurpleApi extends adapt("purpleApi", ({ env }) => ({
  options: env((options: ModulesOptions) => options.message),
})) {
  static #solapiLoad: Promise<SolapiModule> | null = null;

  static #loadSolapi() {
    PurpleApi.#solapiLoad ??= import("solapi") as Promise<SolapiModule>;
    return PurpleApi.#solapiLoad;
  }

  #message: SolapiMessageService | null = null;

  get configured() {
    return !!this.options;
  }
  #requireOptions(): PurpleApiOptions {
    if (!this.options) throw new Err("util.error.adaptorNotConfigured", { adaptor: "PurpleApi", option: "message" });
    return this.options;
  }
  async #getMessage() {
    const { apiKey, apiSecret } = this.#requireOptions();
    this.#message ??= new (await PurpleApi.#loadSolapi()).SolapiMessageService(apiKey, apiSecret);
    return this.#message;
  }
  async send(to: string, text: string, at = new Date()) {
    const { phone } = this.#requireOptions();
    if (SignalTestHarness.isRunning()) {
      this.logger.debug(`send suppressed in the signal-test harness: ***${to.slice(-4)}`);
      return true;
    }
    const message = await this.#getMessage();
    await message.send(
      { from: phone, to: to.replace(/-/g, ""), text },
      { scheduledDate: dayjs(at).format("YYYY-MM-DD HH:mm:ss") },
    );
    //? Never log the text (it carries one-time codes) or the full number.
    this.logger.info(`send: ***${to.slice(-4)} (${text.length} chars)`);
    return true;
  }
  async sendPhoneCode(to: string, phoneCode: string, hash: string) {
    return await this.send(to, `[휴대폰 인증]: 인증번호 ${phoneCode} 를 입력하세요.\n${hash}`);
  }
}
