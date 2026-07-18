import { dayjs } from "akanjs/base";
import { Logger } from "akanjs/common";

export interface PurpleOptions {
  phone: string;
  apiKey: string;
  apiSecret: string;
}

export class PurpleApi {
  private static solapiLoad: Promise<{
    SolapiMessageService: new (
      apiKey: string,
      apiSecret: string,
    ) => {
      send(message: { from: string; to: string; text: string }, options: { scheduledDate: string }): Promise<unknown>;
    };
  }> | null = null;

  private static loadSolapi() {
    PurpleApi.solapiLoad ??= import("solapi") as NonNullable<typeof PurpleApi.solapiLoad>;
    return PurpleApi.solapiLoad;
  }

  readonly #logger = new Logger("PurpleApi");
  readonly #options: PurpleOptions;
  #message: InstanceType<Awaited<ReturnType<typeof PurpleApi.loadSolapi>>["SolapiMessageService"]> | null = null;
  constructor(options: PurpleOptions) {
    this.#options = options;
  }
  async #getMessage() {
    this.#message ??= new (await PurpleApi.loadSolapi()).SolapiMessageService(
      this.#options.apiKey,
      this.#options.apiSecret,
    );
    return this.#message;
  }
  async send(to: string, text: string, at = new Date()) {
    const message = await this.#getMessage();
    await message.send(
      { from: this.#options.phone, to: to.replace(/-/g, ""), text },
      { scheduledDate: dayjs(at).format("YYYY-MM-DD HH:mm:ss") },
    );
    this.#logger.info(`send: ${to} ${text} ${at}`);
    return true;
  }
  async sendPhoneCode(to: string, phoneCode: string, hash: string) {
    return await this.send(to, `[휴대폰 인증]: 인증번호 ${phoneCode} 를 입력하세요.\n${hash}`);
  }
}
