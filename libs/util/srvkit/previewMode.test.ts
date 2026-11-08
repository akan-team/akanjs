import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const sdkCalls: string[] = [];
void mock.module("nodemailer", () => ({
  createTransport: () => {
    sdkCalls.push("nodemailer.createTransport");
    return { sendMail: async () => ({ accepted: ["x"] }) };
  },
}));
void mock.module("solapi", () => ({
  SolapiMessageService: class {
    async send() {
      sdkCalls.push("solapi.send");
    }
  },
}));
void mock.module("firebase-admin", () => ({
  apps: [],
  messaging: () => ({
    sendEachForMulticast: async () => {
      sdkCalls.push("firebase.sendEachForMulticast");
      return { successCount: 1, failureCount: 0, responses: [{ success: true }] };
    },
  }),
}));

const { DiscordApi } = await import("./discordApi");
const { EmailApi } = await import("./emailApi");
const { PreviewMode } = await import("./previewMode");
const { PurpleApi } = await import("./purpleApi");
const { PushNotificationServer } = await import("./pushNotificationServer");

const original = process.env[PreviewMode.env];
const restore = () => {
  if (original === undefined) delete process.env[PreviewMode.env];
  else process.env[PreviewMode.env] = original;
};
afterEach(restore);

describe("PreviewMode", () => {
  test("is off while the marker is unset or spelled as off", () => {
    delete process.env[PreviewMode.env];
    expect(PreviewMode.isOn()).toBe(false);
    for (const value of ["", " ", "0", "false", "FALSE", "off", "no", " Off "]) {
      process.env[PreviewMode.env] = value;
      expect({ value, on: PreviewMode.isOn() }).toEqual({ value, on: false });
    }
  });

  test("is on for any other value, so a misspelled marker still holds the sends back", () => {
    for (const value of ["1", "true", "on", "yes", "preview", "ture"]) {
      process.env[PreviewMode.env] = value;
      expect({ value, on: PreviewMode.isOn() }).toEqual({ value, on: true });
    }
  });
});

describe("external sends while the preview marker is set", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  beforeEach(() => {
    sdkCalls.length = 0;
    process.env[PreviewMode.env] = "1";
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      (async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
    );
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const loggedBy = (target: object) => {
    const lines: string[] = [];
    const { logger } = target as { logger: { info: (...args: unknown[]) => unknown } };
    spyOn(logger, "info").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    return lines;
  };

  test("mail reports success, opens no transport and logs the skip with the recipient masked", async () => {
    const api = Object.assign(new EmailApi(), {
      options: { address: "smtp.example.invalid", auth: { user: "noreply@example.invalid", pass: "p" } },
    });
    const lines = loggedBy(api);
    const sent = await api.sendVerificationCodeMail("reviewer@client.test", "481516", "Angelo");

    expect(sent).toBe(true);
    expect(sdkCalls).toEqual([]);
    expect(lines).toEqual(["sendMail skipped in a preview: ***@client.test"]);
  });

  test("mail with no mailer configured still completes instead of failing the flow", async () => {
    const api = new EmailApi();
    const lines = loggedBy(api);

    expect(await api.sendMail({ to: "a@client.test", subject: "s", html: "<p>h</p>" })).toBe(true);
    expect(lines).toHaveLength(1);
  });

  test("SMS reports success, reaches no provider and never logs the text or the full number", async () => {
    const api = Object.assign(new PurpleApi(), { options: { phone: "0212345678", apiKey: "k", apiSecret: "s" } });
    const lines = loggedBy(api);

    expect(await api.sendPhoneCode("010-1234-5678", "929292", "hash")).toBe(true);
    expect(await new PurpleApi().send("01099998888", "x")).toBe(true);
    expect(sdkCalls).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("***5678");
    expect(lines.join("\n")).not.toContain("929292");
    expect(lines.join("\n")).not.toContain("1234");
  });

  test("Discord posts nothing, configured or not", async () => {
    const api = Object.assign(new DiscordApi(), { options: { webhook: "https://discord.com/api/webhooks/1/token" } });
    const lines = loggedBy(api);
    await api.sendWebhookMessageWithEmbed({ message: "New signup", embed: { title: "t" } });
    await new DiscordApi().log("x");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines).toEqual(["webhook post skipped in a preview: 1 embed(s)"]);
  });

  test("push reaches neither FCM nor APNs and reports no sent, failed or gone token", async () => {
    const api = Object.assign(new PushNotificationServer(), {
      firebase: { type: "service_account", project_id: "p", private_key_id: "k", private_key: "x", client_email: "c" },
    });
    const lines = loggedBy(api);
    const result = await api.sendEach(
      [
        { provider: "fcm", token: "fcm-token" },
        { provider: "apns", token: "apns-token" },
      ],
      { title: "Ticket moved", body: "b" },
    );

    expect(result).toEqual({ successCount: 0, failureCount: 0, invalidTokens: [] });
    expect(sdkCalls).toEqual([]);
    expect(lines).toEqual(["Push skipped in a preview: 2 devices."]);
  });

  test("the same sends go out once the marker is off", async () => {
    process.env[PreviewMode.env] = "0";
    const api = Object.assign(new DiscordApi(), { options: { webhook: "https://discord.com/api/webhooks/1/token" } });
    await api.log("hello");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
