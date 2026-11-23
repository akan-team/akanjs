import { Logger } from "akanjs/common";
import { ReportText } from "../client/reportText";
import { ClientErrorReport } from "./clientErrorReport";
import { ClientReport } from "./hmr/clientReport";
import { SCRIPT_POLICY_REPORT_PATH } from "./scriptPolicy";
import type { HttpRoutes } from "./types";

type Fields = Record<string, unknown>;

interface ReportedFields {
  documentUrl: unknown;
  directive: unknown;
  blocked: unknown;
  disposition: unknown;
  sourceFile: unknown;
  line: unknown;
  sample: unknown;
}

export interface ScriptPolicyViolation {
  path: string;
  directive: string;
  blocked: string;
  disposition: "enforce" | "report";
  source: string;
  sample: string;
}

//* What browsers post: `{"csp-report": {…}}` to report-uri (Firefox, and WebKit with `type` and `url` beside it), an
//* array of `{type, url, body}` through the Reporting API, and WebKit's report-to one such object on its own.
export class ScriptPolicyReport {
  static readonly path = SCRIPT_POLICY_REPORT_PATH;
  static readonly maxBodyBytes = 32_768;
  static readonly maxGroups = 512;
  static readonly #maxEntries = 64;
  static readonly #contentTypes = new Set(["application/csp-report", "application/reports+json", "application/json"]);
  static readonly #directiveShape = /^[a-z][a-z-]{0,39}$/;
  static readonly #groups = new Set<string>();

  static routes(routeOf: (pathname: string) => string | undefined = () => undefined): HttpRoutes {
    return { [ScriptPolicyReport.path]: (req: Request) => ScriptPolicyReport.handle(req, routeOf) };
  }

  //? Security: anyone can post here, so every answer is the same empty one and nothing of the body is echoed.
  static async handle(req: Request, routeOf: (pathname: string) => string | undefined): Promise<Response> {
    const headers = { "cache-control": "no-store" };
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, allow: "POST" } });
    const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const text = ScriptPolicyReport.#contentTypes.has(type)
      ? await ClientErrorReport.readText(req, ScriptPolicyReport.maxBodyBytes).catch(() => null)
      : null;
    for (const violation of text ? ScriptPolicyReport.violationsOf(text) : [])
      ScriptPolicyReport.#log(violation, routeOf);
    return new Response(null, { status: 204, headers });
  }

  static violationsOf(text: string): ScriptPolicyViolation[] {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return [];
    }
    const entries = Array.isArray(body) ? body.slice(0, ScriptPolicyReport.#maxEntries) : [body];
    return entries.flatMap((entry) => ScriptPolicyReport.#violationOf(entry) ?? []);
  }

  static #violationOf(entry: unknown): ScriptPolicyViolation | null {
    if (!ScriptPolicyReport.#isFields(entry)) return null;
    const legacy = entry["csp-report"];
    if (ScriptPolicyReport.#isFields(legacy))
      return ScriptPolicyReport.#violation({
        documentUrl: legacy["document-uri"],
        directive: legacy["effective-directive"] ?? legacy["violated-directive"],
        blocked: legacy["blocked-uri"],
        disposition: legacy.disposition,
        sourceFile: legacy["source-file"],
        line: legacy["line-number"],
        sample: legacy["script-sample"],
      });
    const { type, url, body } = entry;
    if (!ScriptPolicyReport.#isFields(body) || (type !== undefined && type !== "csp-violation")) return null;
    return ScriptPolicyReport.#violation({
      documentUrl: body.documentURL ?? url,
      directive: body.effectiveDirective,
      blocked: body.blockedURL,
      disposition: body.disposition,
      sourceFile: body.sourceFile,
      line: body.lineNumber,
      sample: body.sample,
    });
  }

  static #violation(fields: ReportedFields): ScriptPolicyViolation | null {
    const directive = typeof fields.directive === "string" ? (fields.directive.trim().split(/\s/)[0] ?? "") : "";
    if (!ScriptPolicyReport.#directiveShape.test(directive)) return null;
    const line = typeof fields.line === "number" && Number.isInteger(fields.line) ? `:${fields.line}` : "";
    const source = ScriptPolicyReport.#location(fields.sourceFile);
    return {
      path: ScriptPolicyReport.#text(URL.parse(String(fields.documentUrl))?.pathname, 200) || "an unknown page",
      directive,
      blocked: ScriptPolicyReport.#location(fields.blocked) || "inline",
      disposition: fields.disposition === "report" ? "report" : "enforce",
      source: source ? `${source}${line}` : "",
      sample: ScriptPolicyReport.#text(fields.sample, 80),
    };
  }

  //? A URL keeps its origin and path: a query or fragment can carry a token. A keyword (`inline`, `eval`) stays.
  static #location(value: unknown): string {
    if (typeof value !== "string") return "";
    const url = URL.parse(value);
    const kept = url && /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : (url?.protocol ?? value);
    return ScriptPolicyReport.#text(kept, 200);
  }

  static #text(value: unknown, limit: number): string {
    if (typeof value !== "string") return "";
    return ClientReport.line(ReportText.scrub(ClientReport.clean(value, ScriptPolicyReport.maxBodyBytes)), limit);
  }

  static #isFields(value: unknown): value is Fields {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  //? One line per kind of violation a process sees, so a page that breaks for every visitor logs once.
  static #log(violation: ScriptPolicyViolation, routeOf: (pathname: string) => string | undefined) {
    const route = routeOf(violation.path) ?? violation.path;
    const key = `${route} ${violation.directive} ${violation.blocked}`;
    const groups = ScriptPolicyReport.#groups;
    if (groups.has(key)) return;
    if (groups.size > ScriptPolicyReport.maxGroups) return;
    if (groups.size === ScriptPolicyReport.maxGroups) {
      groups.add("");
      Logger.emit({
        level: "warn",
        name: "ScriptPolicy",
        message: `${ScriptPolicyReport.maxGroups} kinds of script policy report are logged; this process logs no more`,
      });
      return;
    }
    groups.add(key);
    const { directive, blocked, disposition, source, sample } = violation;
    const verb = disposition === "report" ? "would refuse" : "refused";
    Logger.emit({
      level: "warn",
      name: "ScriptPolicy",
      message: `The script policy ${verb} ${blocked} (${directive}) on ${route}${source ? ` at ${source}` : ""}${sample ? `: ${sample}` : ""}`,
      attrs: { route, directive, blocked, disposition },
    });
  }
}
