import { adapt } from "akanjs/service";
import { Err } from "../lib/dict";
import type { ModulesOptions } from "../lib/option";
import type { DiscordEmbed, SendWebhookMessageWithEmbedType } from "./discordApi.helper";
import { SignalTestHarness } from "./signalTestHarness";

export interface DiscordApiOptions {
  tokens?: unknown; //? bot tokens are no longer read; env files outside git still set them
  webhook: string;
}

export class DiscordApi extends adapt("discordApi", ({ env }) => ({
  options: env((options: ModulesOptions) => options.discord),
})) {
  get configured() {
    return !!this.options;
  }
  async #post(body: { content: string; embeds?: DiscordEmbed[] }) {
    if (!this.options) throw new Err("util.error.adaptorNotConfigured", { adaptor: "DiscordApi", option: "discord" });
    if (SignalTestHarness.isRunning()) {
      this.logger.debug(`webhook post suppressed in the signal-test harness: ${body.embeds?.length ?? 0} embed(s)`);
      return;
    }
    const response = await fetch(this.options.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      //? No mentions are parsed, so text that reaches a message can never ping @everyone or a role.
      body: JSON.stringify({ ...body, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Err("util.error.discordWebhookFailed", { status: response.status });
  }
  async log(message: string) {
    await this.#post({ content: message });
  }
  async sendWebhookMessageWithEmbed({ message, embed }: SendWebhookMessageWithEmbedType) {
    await this.#post({ content: message, embeds: [embed] });
  }
}
