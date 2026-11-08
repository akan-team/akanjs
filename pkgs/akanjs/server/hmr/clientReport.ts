import { Logger } from "akanjs/common";

export interface HmrClientReport {
  type: "client-report";
  kind: "error" | "rejection";
  message: string;
  stack?: string;
  href: string;
  client: "ssr" | "csr";
  platform?: string;
  target?: string;
}

export class ClientReport {
  static readonly #fieldLimit = 4_000;
  static readonly #stackLines = 6;
  //? Any page can send this frame, so neither escape sequences nor line breaks reach the developer's terminal.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what it removes.
  static readonly #controlChars = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
  static readonly #lineBreaks = /[\n\u2028\u2029]/g;

  static parse(value: unknown): HmrClientReport | null {
    if (!value || typeof value !== "object") return null;
    const report = value as Partial<HmrClientReport>;
    if (report.type !== "client-report") return null;
    if (report.kind !== "error" && report.kind !== "rejection") return null;
    if (report.client !== "ssr" && report.client !== "csr") return null;
    if (typeof report.message !== "string" || typeof report.href !== "string") return null;
    return {
      type: "client-report",
      kind: report.kind,
      message: ClientReport.#line(report.message),
      href: ClientReport.#line(report.href),
      client: report.client,
      ...(typeof report.stack === "string" && report.stack ? { stack: ClientReport.#clean(report.stack) } : {}),
      ...(typeof report.platform === "string" ? { platform: ClientReport.#line(report.platform) } : {}),
      ...(typeof report.target === "string" ? { target: ClientReport.#line(report.target) } : {}),
    };
  }

  static describe(report: HmrClientReport) {
    const where = [report.client, report.platform && report.platform !== "web" ? report.platform : null, report.target]
      .filter(Boolean)
      .join(" ");
    const what = report.kind === "rejection" ? "Unhandled rejection" : "Uncaught error";
    const head = `${what} on ${report.href} (${where}): ${report.message}`;
    const frames = (report.stack ?? "")
      .split("\n")
      .filter((line) => line.trim().length > 1 && !report.message.includes(line.trim()))
      .slice(0, ClientReport.#stackLines);
    return [head, ...frames.map((line) => `    ${line.trim()}`)].join("\n");
  }

  static log(report: HmrClientReport) {
    Logger.emit({
      level: "error",
      name: "ClientReport",
      message: ClientReport.describe(report),
      attrs: {
        kind: report.kind,
        href: report.href,
        client: report.client,
        platform: report.platform ?? null,
        target: report.target ?? null,
      },
    });
  }

  static #clean(text: string) {
    return Logger.stripAnsi(text).replace(ClientReport.#controlChars, "").slice(0, ClientReport.#fieldLimit);
  }

  static #line(text: string) {
    return ClientReport.#clean(text).replace(ClientReport.#lineBreaks, "\\n");
  }
}
