import { beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { getEnv } from "akanjs/base";
import { getOrSetupSignalTestContext } from "akanjs/test";
import { DiscordApi } from "./discordApi";
import { EmailApi } from "./emailApi";
import { PurpleApi } from "./purpleApi";

const createTransport = mock(() => ({ sendMail: async () => ({ accepted: ["standin"] }) }));
const solapiSend = mock(async () => ({}));
class SolapiMessageService {
  static created = 0;
  send = solapiSend;
  constructor() {
    SolapiMessageService.created += 1;
  }
}
mock.module("nodemailer", () => ({ createTransport }));
mock.module("solapi", () => ({ SolapiMessageService }));

const mailer = { address: "smtp.invalid", auth: { user: "sender@example.test", pass: "standin" } };
const message = { phone: "0200000000", apiKey: "standin", apiSecret: "standin" };
const webhook = "https://discord.invalid/api/webhooks/0/standin";

describe("Signal-test harness outbound suppression", () => {
  beforeAll(async () => {
    await getOrSetupSignalTestContext();
  });

  test("runs inside the harness with both SDKs replaced by stand-ins", async () => {
    expect(getEnv().environment).toBe("testing");
    expect<unknown>((await import("nodemailer")).createTransport).toBe(createTransport);
    expect<unknown>((await import("solapi")).SolapiMessageService).toBe(SolapiMessageService);
  });

  test("EmailApi.sendMail reports success without building a transport or logging the recipient", async () => {
    const emailApi = Object.assign(new EmailApi(), { options: mailer });
    const debug = spyOn(emailApi.logger, "debug");
    const html = "<p>secret body</p>";
    expect(
      await emailApi.sendMail({ to: ["first.person@gmail.com", { name: "B", address: "b@corp.test" }], html }),
    ).toBe(true);
    expect(await emailApi.sendVerificationCodeMail("someone@naver.com", "123456", "svc")).toBe(true);
    expect(createTransport).not.toHaveBeenCalled();
    const logged = debug.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("***@gmail.com,***@corp.test");
    expect(logged).toContain("***@naver.com");
    expect(logged).not.toMatch(/first\.person|someone|secret body|123456/);
  });

  test("PurpleApi.send reports success without constructing the Solapi client", async () => {
    const purpleApi = Object.assign(new PurpleApi(), { options: message });
    const debug = spyOn(purpleApi.logger, "debug");
    expect(await purpleApi.send("010-9876-4321", "code 654321")).toBe(true);
    expect(await purpleApi.sendPhoneCode("01098764321", "654321", "hash")).toBe(true);
    expect(SolapiMessageService.created).toBe(0);
    expect(solapiSend).not.toHaveBeenCalled();
    const logged = debug.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("***4321");
    expect(logged).not.toMatch(/9876|654321/);
  });

  test("DiscordApi resolves without posting to the webhook or logging the message", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      (async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
    );
    try {
      const discordApi = Object.assign(new DiscordApi(), { options: { webhook } });
      const debug = spyOn(discordApi.logger, "debug");
      expect(await discordApi.log("inquiry from first.person")).toBeUndefined();
      expect(
        await discordApi.sendWebhookMessageWithEmbed({ message: "signup", embed: { title: "secret title" } }),
      ).toBeUndefined();
      expect(fetchSpy.mock.calls.filter(([input]) => String(input) === webhook)).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      const logged = debug.mock.calls.map(([line]) => String(line)).join("\n");
      expect(logged).toContain("suppressed");
      expect(logged).not.toMatch(/first\.person|signup|secret title|discord\.invalid/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("an adapter with no options still refuses exactly as before", async () => {
    expect(await new EmailApi().sendMail({ to: "x@example.test" })).toBe(false);
    await expect(new PurpleApi().send("01000000000", "x")).rejects.toThrow("util.error.adaptorNotConfigured");
    await expect(new DiscordApi().log("x")).rejects.toThrow("util.error.adaptorNotConfigured");
  });
});
