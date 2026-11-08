import { describe, expect, it, mock } from "bun:test";

import { EmailApi, type EmailApiOptions } from "./emailApi";

const transported: { from?: unknown }[] = [];
mock.module("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (message: { from?: unknown }) => {
      transported.push(message);
      return { accepted: ["standin"] };
    },
  }),
}));

describe("EmailApi recipients", () => {
  it("keeps one bare address per entry, trimmed and de-duplicated", () => {
    expect(EmailApi.recipientsOf([" buyer@client.test", "buyer@client.test", "tax@client.co.kr"])).toEqual([
      "buyer@client.test",
      "tax@client.co.kr",
    ]);
  });

  it("accepts an apostrophe in the local part, which nodemailer does not split on", () => {
    expect(EmailApi.recipientsOf(["o'brien@client.test"])).toEqual(["o'brien@client.test"]);
    expect(() => EmailApi.recipientsOf(["o'brien@client.test, b@client.test"])).toThrow("util.error.invalidRecipient");
  });

  it("refuses an entry that nodemailer would expand into several recipients", () => {
    for (const packed of [
      "a@client.test, b@client.test",
      "a@client.test,b@client.test",
      "a@client.test;b@client.test",
      "a@client.test b@client.test",
      "Buyer <a@client.test>",
      "group: a@client.test, b@client.test;",
      '"a@client.test"@client.test',
      "not-an-address",
      "",
    ])
      expect(() => EmailApi.recipientsOf([packed])).toThrow("util.error.invalidRecipient");
  });

  it("refuses more distinct addresses than the cap", () => {
    const addresses = Array.from({ length: 21 }, (_, idx) => `customer${idx}@client.test`);
    expect(() => EmailApi.recipientsOf(addresses)).toThrow("util.error.tooManyRecipients");
    expect(EmailApi.recipientsOf(addresses.slice(0, 20))).toHaveLength(20);
    expect(EmailApi.recipientsOf([...addresses.slice(0, 20), "customer0@client.test"])).toHaveLength(20);
  });

  it("sends nothing on behalf of an account to a recipient that is not one plain address", async () => {
    const sender = { name: "Vendor", address: "sales@vendor.test" };
    const mail = { to: "a@client.test, b@client.test", subject: "Quotation", html: "<p>q</p>" };
    const api = new EmailApi();
    const sent: unknown[] = [];
    api.sendMail = async (outgoing) => {
      sent.push(outgoing);
      return true;
    };
    expect(await api.sendMailOnBehalf(mail, sender)).toBe(false);
    expect(await api.sendMailOnBehalf({ ...mail, to: "a@client.test" }, sender)).toBe(true);
    expect(sent).toEqual([
      expect.objectContaining({
        to: "a@client.test",
        replyTo: sender,
        from: expect.objectContaining({ name: "Vendor" }),
      }),
    ]);
  });
});

describe("EmailApi recipient validation before a send", () => {
  const localPart = (length: number) => "a".repeat(length);
  const longDomain = `${Array.from({ length: 4 }, () => "d".repeat(60)).join(".")}.test`;
  const api = Object.assign(new EmailApi(), {
    options: { address: "smtp.invalid", auth: { user: "smtp-login@relay.test", pass: "standin" } },
  });
  const send = (mail: Parameters<EmailApi["sendMail"]>[0]) => api.sendMail({ subject: "s", html: "h", ...mail });

  it("sends to one plain address at the length limits", async () => {
    transported.length = 0;
    const atLimit = `${localPart(64)}@${"d".repeat(184)}.test`;
    expect(atLimit).toHaveLength(254);
    expect(EmailApi.recipientOf(atLimit)).toBe(atLimit);
    expect(await send({ to: "buyer@client.test", cc: [{ name: "Tax", address: atLimit }] })).toBe(true);
    expect(transported).toHaveLength(1);
  });

  it("refuses a list, a line break, a display name or a group in any recipient field", async () => {
    transported.length = 0;
    for (const mail of [
      { to: "a@client.test, b@client.test" },
      { to: ["a@client.test", "b@client.test;c@client.test"] },
      { cc: "a@client.test\r\nBcc: b@client.test" },
      { bcc: "a@client.test\n" },
      { to: "Buyer <a@client.test>" },
      { to: { name: "Buyer", address: "a@client.test, b@client.test" } },
      { to: { name: "Buyer\r\nBcc: b@client.test", address: "a@client.test" } },
      { to: { name: "Team", group: [{ address: "a@client.test" }, { address: "b@client.test" }] } },
      { envelope: { to: "a@client.test, b@client.test" } },
    ])
      await expect(send(mail)).rejects.toThrow("util.error.invalidRecipient");
    expect(transported).toHaveLength(0);
  });

  it("refuses a local part past 64 characters and an address past 254", async () => {
    transported.length = 0;
    const longLocal = `${localPart(65)}@client.test`;
    const longAddress = `${localPart(10)}@${longDomain}`;
    expect(longAddress.length).toBeGreaterThan(254);
    for (const address of [longLocal, longAddress]) {
      expect(EmailApi.isPlainAddress(address)).toBe(false);
      expect(() => EmailApi.recipientOf(address)).toThrow("util.error.recipientTooLong");
      await expect(send({ to: address })).rejects.toThrow("util.error.recipientTooLong");
      await expect(send({ to: "a@client.test", bcc: [{ name: "B", address }] })).rejects.toThrow(
        "util.error.recipientTooLong",
      );
    }
    expect(transported).toHaveLength(0);
  });
});

describe("EmailApi sender", () => {
  const auth = { user: "smtp-login@relay.test", pass: "standin" };
  const sendWith = async (options: EmailApiOptions) => {
    transported.length = 0;
    const api = Object.assign(new EmailApi(), { options });
    expect(await api.sendVerificationCodeMail("someone@client.test", "123456", "svc")).toBe(true);
    expect(await api.sendMail({ to: "someone@client.test", subject: "s", html: "<p>h</p>" })).toBe(true);
    expect(
      await api.sendMailOnBehalf(
        { to: "someone@client.test", subject: "s", html: "h" },
        { name: "Org", address: "org@client.test" },
      ),
    ).toBe(true);
    return transported.map(({ from }) => from);
  };

  it("sends from the verified sender when one is set", async () => {
    expect(await sendWith({ address: "smtp.invalid", auth, from: "no-reply@verified.test" })).toEqual([
      "no-reply@verified.test",
      "no-reply@verified.test",
      { name: "Org", address: "no-reply@verified.test" },
    ]);
  });

  it("falls back to the SMTP login when no sender is set", async () => {
    expect(await sendWith({ address: "smtp.invalid", auth })).toEqual([
      "smtp-login@relay.test",
      "smtp-login@relay.test",
      { name: "Org", address: "smtp-login@relay.test" },
    ]);
  });
});
