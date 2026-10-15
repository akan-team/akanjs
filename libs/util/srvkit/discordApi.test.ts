import { afterEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { DiscordApi } from "./discordApi";

const webhook = "https://discord.com/api/webhooks/1/token";
let fetchSpy: Mock<typeof fetch> | null = null;

const discordStandIn = (status = 204) => {
  const sent: { url: string; body: unknown }[] = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status });
  }) as typeof fetch);
  return sent;
};

afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe("DiscordApi", () => {
  test("posts a log line to the webhook without letting it mention anyone", async () => {
    const sent = discordStandIn();
    await Object.assign(new DiscordApi(), { options: { webhook } }).log("@everyone hello");
    expect(sent).toEqual([{ url: webhook, body: { content: "@everyone hello", allowed_mentions: { parse: [] } } }]);
  });

  test("posts an embed next to the message", async () => {
    const sent = discordStandIn();
    const embed = { title: "New signup", color: 0x52c41a, fields: [{ name: "User", value: "u1" }] };
    await Object.assign(new DiscordApi(), { options: { webhook } }).sendWebhookMessageWithEmbed({
      message: "m",
      embed,
    });
    expect(sent[0]?.body).toEqual({ content: "m", embeds: [embed], allowed_mentions: { parse: [] } });
  });

  test("fails when Discord refuses the message or no webhook is configured", async () => {
    discordStandIn(429);
    await expect(Object.assign(new DiscordApi(), { options: { webhook } }).log("x")).rejects.toThrow(
      "util.error.discordWebhookFailed",
    );
    await expect(new DiscordApi().log("x")).rejects.toThrow("util.error.adaptorNotConfigured");
  });
});
