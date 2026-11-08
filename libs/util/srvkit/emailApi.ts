import { adapt } from "akanjs/service";
import { Err } from "../lib/dict";
import type { ModulesOptions } from "../lib/option";
import type { Address, SendMailOptions, SMTPSentMessageInfo, Transporter } from "./emailApi.helper";
import { PreviewMode } from "./previewMode";
import { SignalTestHarness } from "./signalTestHarness";

export interface EmailApiOptions {
  address: string;
  //? Ignored (the transport is `address` on port 587); optional so env files that still set it type-check.
  service?: unknown;
  auth: { user: string; pass: string };
  //? The relay rejects or silently drops mail whose From is not a sender it verified; the SMTP login may not be one.
  from?: string;
}

export class EmailApi extends adapt("emailApi", ({ env }) => ({
  options: env((options: ModulesOptions) => options.mailer),
})) {
  static #nodemailerLoad: Promise<typeof import("nodemailer")> | null = null;
  #mailerLoad: Promise<Transporter<SMTPSentMessageInfo>> | null = null;

  get configured() {
    return !!this.options;
  }
  get sender() {
    return this.options?.from ?? this.options?.auth.user;
  }
  #requireOptions(): EmailApiOptions {
    if (!this.options) throw new Err("util.error.adaptorNotConfigured", { adaptor: "EmailApi", option: "mailer" });
    return this.options;
  }
  #getMailer(): Promise<Transporter<SMTPSentMessageInfo>> {
    const { address, auth } = this.#requireOptions();
    EmailApi.#nodemailerLoad ??= import("nodemailer");
    this.#mailerLoad ??= EmailApi.#nodemailerLoad.then(({ createTransport }) =>
      createTransport({ host: address, port: 587, secure: false, requireTLS: true, auth }),
    );
    return this.#mailerLoad;
  }
  static #escapeHtml(value: string) {
    return value.replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
    );
  }
  static getHtmlContent(rawId: string, rawPassword: string, rawServiceName: string) {
    const id = EmailApi.#escapeHtml(rawId);
    const password = EmailApi.#escapeHtml(rawPassword);
    const serviceName = EmailApi.#escapeHtml(rawServiceName);
    return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Password Reset - ${serviceName}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #444444;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f7f7f7">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table width="600" border="0" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 30px; background-color: #2B6CB0; border-radius: 8px 8px 0 0;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${serviceName} Password Reset</h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 20px 0;">You requested a password reset for your ${serviceName} account. Below are your temporary login credentials:</p>
                            
                            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                                <p style="margin: 0 0 10px 0; font-weight: bold;">Account Details:</p>
                                <table cellpadding="5">
                                    <tr>
                                        <td style="color: #666;">Email:</td>
                                        <td style="font-weight: bold;">${id}</td>
                                    </tr>
                                    <tr>
                                        <td style="color: #666;">Temporary Password:</td>
                                        <td style="color: #2B6CB0; font-weight: bold;">${password}</td>
                                    </tr>
                                </table>
                            </div>

                            <p style="margin: 0 0 20px 0;">This password works once and expires in 30 minutes. Your current password keeps working until you sign in with this one, so you can ignore this mail if you did not ask for it.</p>

                            <p style="margin: 0 0 20px 0; color: #dc3545; font-weight: bold;">⚠️ Please change your password immediately after logging in.</p>

                            <div style="text-align: center; margin: 30px 0;">
                                <a href="#" style="background-color: #2B6CB0; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Login to ${serviceName}</a>
                            </div>

                            <p style="margin: 0; font-size: 14px; color: #666;">
                                Need help? Contact our support team or visit our help center.<br>
                                <span style="font-size: 12px;">This is an automated message - please do not reply directly.</span>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; background-color: #f8f9fa; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; font-size: 12px; color: #666; text-align: center;">
                                © ${new Date().getFullYear()} ${serviceName}. All rights reserved.<br>
                                For your security, never share your password with anyone.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
      `;
  }
  static #entriesOf(input: SendMailOptions["to"]): (string | Address)[] {
    return Array.isArray(input) ? input.flatMap((entry) => EmailApi.#entriesOf(entry)) : input ? [input] : [];
  }
  static #addressOf(entry: string | Address) {
    return typeof entry === "string" ? entry : (entry.address ?? "");
  }
  static #maskRecipients(to: SendMailOptions["to"]) {
    return EmailApi.#entriesOf(to)
      .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : [EmailApi.#addressOf(entry)]))
      .map((address) => `***@${address.split("@").at(-1)?.replace(/[>\s]/g, "") ?? ""}`)
      .join(",");
  }
  async sendMail(mail: SendMailOptions) {
    EmailApi.#assertRecipients(mail);
    if (PreviewMode.isOn()) {
      this.logger.info(`sendMail skipped in a preview: ${EmailApi.#maskRecipients(mail.to)}`);
      return true;
    }
    try {
      this.#requireOptions();
      if (SignalTestHarness.isRunning()) {
        this.logger.debug(`sendMail suppressed in the signal-test harness: ${EmailApi.#maskRecipients(mail.to)}`);
        return true;
      }
      const mailer = await this.#getMailer();
      const res = await mailer.sendMail({ from: this.sender, ...mail });
      const toAddresses = EmailApi.#entriesOf(mail.to).map(EmailApi.#addressOf).join(",");
      this.logger.debug(`sendMail: ${toAddresses} ${mail.subject} ${res.accepted.length}`);
      return !!res.accepted.length;
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error");
      return false;
    }
  }
  //? One bare address and nothing else: nodemailer's addressparser expands "a@x.com, b@y.com", "a@x.com; b@y.com",
  //? `Name <a@x.com>` and `group: a@x.com, b@y.com;` into several recipients, which a count of the list never sees.
  static #plainAddress = /^[^\s@,;:<>()[\]"\\]+@[^\s@,;:<>()[\]"'\\]+\.[^\s@,;:<>()[\]"'\\]+$/;
  static #isWithinLength(address: string) {
    return address.length <= 254 && address.indexOf("@") <= 64;
  }
  static isPlainAddress(address: string) {
    return EmailApi.#isWithinLength(address) && EmailApi.#plainAddress.test(address);
  }
  static #assertPlainAddress(address: string) {
    if (!EmailApi.#isWithinLength(address)) throw new Err("util.error.recipientTooLong");
    if (!EmailApi.#plainAddress.test(address)) throw new Err("util.error.invalidRecipient", { address });
  }
  static #assertRecipient(entry: string | Address) {
    if (typeof entry !== "string" && (entry.group || /[\r\n]/.test(entry.name ?? "")))
      throw new Err("util.error.invalidRecipient", { address: EmailApi.#addressOf(entry) });
    EmailApi.#assertPlainAddress(EmailApi.#addressOf(entry));
  }
  static #assertRecipients({ to, cc, bcc, envelope }: SendMailOptions) {
    for (const input of [to, cc, bcc, envelope?.to, envelope?.cc, envelope?.bcc])
      for (const entry of EmailApi.#entriesOf(input)) EmailApi.#assertRecipient(entry);
  }
  static recipientOf(address: string) {
    const recipient = address.trim();
    EmailApi.#assertPlainAddress(recipient);
    return recipient;
  }
  static recipientsOf(addresses: string[], { max = 20 }: { max?: number } = {}) {
    const recipients = [...new Set(addresses.map((address) => EmailApi.recipientOf(address)))];
    if (recipients.length > max) throw new Err("util.error.tooManyRecipients", { max });
    return recipients;
  }
  //? The platform account stays the sender: an org's own address is unverified, so it only answers as Reply-To.
  async sendMailOnBehalf(
    { to, subject, html }: { to: string; subject: string; html: string },
    { name, address }: { name: string; address: string },
  ) {
    if (!EmailApi.isPlainAddress(to)) {
      this.logger.warn(
        `sendMailOnBehalf refused a recipient that is not one plain address: ${EmailApi.#maskRecipients(to)}`,
      );
      return false;
    }
    return await this.sendMail({
      to,
      subject,
      html,
      from: { name, address: this.sender ?? "" },
      replyTo: { name, address },
    });
  }
  async sendPasswordResetMail(to: string, password: string, serviceName: string, from = this.sender) {
    const html = EmailApi.getHtmlContent(to, password, serviceName);
    return await this.sendMail({ to, subject: "Password Reset", html, from });
  }
  static getVerificationCodeHtml(rawCode: string, rawServiceName: string) {
    const code = EmailApi.#escapeHtml(rawCode);
    const serviceName = EmailApi.#escapeHtml(rawServiceName);
    return `<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>Email Verification - ${serviceName}</title>
</head>
<body style="margin: 0; padding: 40px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #444444; background-color: #f7f7f7;">
    <table width="600" align="center" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
        <tr>
            <td style="padding: 40px 30px;">
                <p style="margin: 0 0 20px 0;">Enter this code to verify your email for ${serviceName}. 아래 인증번호를 입력해 이메일을 인증해주세요.</p>
                <p style="margin: 0 0 20px 0; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2B6CB0;">${code}</p>
                <p style="margin: 0; font-size: 14px; color: #666;">The code expires in 10 minutes. If you did not sign up, ignore this mail. 인증번호는 10분 뒤 만료됩니다.</p>
            </td>
        </tr>
    </table>
</body>
</html>
      `;
  }
  async sendVerificationCodeMail(to: string, code: string, serviceName: string, from = this.sender) {
    const html = EmailApi.getVerificationCodeHtml(code, serviceName);
    return await this.sendMail({ to, subject: `[${serviceName}] Email verification code`, html, from });
  }
}
