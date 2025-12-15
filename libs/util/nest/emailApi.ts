import { Logger } from "@akanjs/common";
import { createTransport, SendMailOptions, type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export interface EmailOptions {
  address: string;
  service: string;
  auth: { user: string; pass: string };
}

export class EmailApi {
  readonly #logger = new Logger("EmailApi");
  readonly #options: EmailOptions;
  readonly #mailer: Transporter<SMTPTransport.SentMessageInfo>;
  constructor(options: EmailOptions) {
    this.#options = options;
    this.#mailer = createTransport({ host: options.address, port: 587, secure: false, auth: options.auth });
  }
  static getHtmlContent(id: string, password: string, serviceName: string) {
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
  async sendMail(mail: SendMailOptions) {
    try {
      const res = await this.#mailer.sendMail({ from: this.#options.auth.user, ...mail });
      const toAddresses = Array.isArray(mail.to)
        ? mail.to.map((t) => (typeof t === "string" ? t : t.address)).join(",")
        : typeof mail.to === "string"
          ? mail.to
          : mail.to?.address;
      this.#logger.debug(`sendMail: ${toAddresses} ${mail.subject} ${res.accepted.length}`);
      return !!res.accepted.length;
    } catch (error) {
      this.#logger.error(error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error");
      return false;
    }
  }
  async sendPasswordResetMail(to: string, password: string, serviceName: string, from = this.#options.auth.user) {
    const html = EmailApi.getHtmlContent(to, password, serviceName);
    await this.sendMail({ to, subject: "Password Reset", html, from });
    return true;
  }
}
