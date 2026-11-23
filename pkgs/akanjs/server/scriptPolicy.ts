import { createHash, randomBytes } from "node:crypto";
import { isDevBuild } from "./routing/devBuild";

export const SCRIPT_POLICY_HEADER = "Content-Security-Policy";
export const SCRIPT_POLICY_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const SCRIPT_POLICY_REPORT_GROUP = "akan-csp";
export const SCRIPT_POLICY_REPORT_PATH = "/_akan/csp-report";
//? A proxy reads a response's headers into one buffer (4 KB in nginx by default) and answers 502 past it. A hash
//? source is 54 bytes, so 32 keep the policy under 2 KB: half the buffer, the rest for cookies and other headers.
export const MAX_RESPONSE_SCRIPT_HASHES = 32;
const MAX_REPORTED_ROUTES = 512;
//? Security: 'wasm-unsafe-eval' compiles WebAssembly but evaluates no text, which is what script-src guards against.
const DEFAULT_EXTRA_SOURCES = ["'wasm-unsafe-eval'"];

export interface ScriptPolicySources {
  nonce?: string;
  hashes?: Iterable<string>;
}

//* `own` is false for AKAN_CONTENT_SECURITY_POLICY's value, sent as written beside a script policy that only reports.
export interface DocumentPolicy {
  directives: string | null;
  own: boolean;
}

export interface PageScript {
  attrs: string;
  text: string;
  external: boolean;
}

export const isOff = (value: string) => ["off", "false", "0", "none"].includes(value.toLowerCase());
const isOn = (value: string) => ["on", "true", "1"].includes(value.toLowerCase());
const hashSourceRe = /^'?(sha(?:256|384|512)-[A-Za-z0-9+/_-]+={0,2})'?$/;
const scriptOpenRe = /<script\b([^>]*)>/gi;
const scriptCloseRe = /<\/script[\s/>]/i;
const executableTypeRe = /^(?:|module|importmap|speculationrules|(?:text|application)\/(?:x-)?(?:java|ecma)script)$/i;

export class ScriptPolicy {
  static readonly #reported = new Set<string>();

  static firstReport(about: "declared" | "replay", route: string): boolean {
    const key = `${about} ${route}`;
    if (ScriptPolicy.#reported.has(key) || ScriptPolicy.#reported.size >= MAX_REPORTED_ROUTES) return false;
    ScriptPolicy.#reported.add(key);
    return true;
  }

  //? A browser hashes the text the parser kept, in which CRLF and a lone CR have become LF.
  static hashOf(text: string): string {
    return `'sha256-${createHash("sha256").update(text.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}'`;
  }

  static createNonce(): string {
    return randomBytes(16).toString("base64");
  }

  /** `sha256-…` as an app writes it, quoted or not; anything else is dropped rather than sent into a header. */
  static hashSource(value: string): string | null {
    const hash = hashSourceRe.exec(value.trim())?.[1];
    return hash ? `'${hash}'` : null;
  }

  //? As the tokenizer reads it: a script's text ends at the first `</script`, so text naming a tag opens no element.
  static scriptsOf(html: string): PageScript[] {
    const scripts: PageScript[] = [];
    scriptOpenRe.lastIndex = 0;
    for (let open = scriptOpenRe.exec(html); open; open = scriptOpenRe.exec(html)) {
      const start = open.index + open[0].length;
      const close = scriptCloseRe.exec(html.slice(start));
      const end = close ? start + close.index : html.length;
      const attrs = open[1] ?? "";
      scripts.push({ attrs, text: html.slice(start, end), external: /\ssrc\s*=/i.test(attrs) });
      scriptOpenRe.lastIndex = end;
    }
    return scripts;
  }

  static inlineScriptsOf(html: string): PageScript[] {
    return ScriptPolicy.scriptsOf(html).filter(({ external }) => !external);
  }

  /** The inline scripts a browser runs or reads as an import map: a data block (`application/json`) is neither. */
  static executableScriptsOf(html: string): PageScript[] {
    return ScriptPolicy.inlineScriptsOf(html).filter(({ attrs }) =>
      executableTypeRe.test(/\stype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] ?? ""),
    );
  }

  static hashesOf(html: string): string[] {
    return [...new Set(ScriptPolicy.executableScriptsOf(html).map(({ text }) => ScriptPolicy.hashOf(text)))];
  }

  //? Security: only a script carrying the render's own nonce is counted, so text the page echoed gets no hash.
  //? Read as bytes: a stored page is megabytes at most, and decoding it would cost more than finding the few tags.
  static hashesOfNonced(html: Uint8Array, nonce: string): string[] {
    const body = Buffer.from(html.buffer, html.byteOffset, html.byteLength);
    const hashes = new Set<string>();
    const marker = `<script nonce="${nonce}"`;
    for (let at = body.indexOf(marker); at !== -1; at = body.indexOf(marker, at + marker.length)) {
      const start = body.indexOf(">", at) + 1;
      const end = body.indexOf("</script", start);
      if (start === 0 || end === -1) break;
      if (!/\ssrc\s*=/i.test(body.toString("latin1", at, start)))
        hashes.add(ScriptPolicy.hashOf(body.toString("utf8", start, end)));
    }
    return [...hashes];
  }

  //? Security: each word is one source expression; one that could end the directive or the header is dropped.
  static extraSources(raw = process.env.AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC?.trim()): string[] {
    if (!raw) return DEFAULT_EXTRA_SOURCES;
    if (isOff(raw)) return [];
    return raw.split(/\s+/).filter((source) => /^(?:'[\w+/=-]+'|[\w*.:/+-]+)$/.test(source));
  }

  static reportUri(raw = process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_URI?.trim()): string | null {
    if (!raw) return SCRIPT_POLICY_REPORT_PATH;
    if (isOff(raw) || /[\s;,"'<>\\]/.test(raw)) return null;
    return raw;
  }

  //* 'strict-dynamic' turns 'self' off in a browser that knows it, so every script is named by a hash or the nonce
  //* and loads the rest itself; 'self' is what an older browser falls back to.
  //? Dev adds 'unsafe-eval': React's development build evaluates text to name server frames in a stack.
  static scriptSrc(
    { nonce, hashes = [] }: ScriptPolicySources = {},
    env: Record<string, string | undefined> = process.env,
  ): string {
    const extra = ScriptPolicy.extraSources(env.AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC?.trim());
    const sources = new Set([
      "'self'",
      ...(nonce ? [`'nonce-${nonce}'`] : []),
      ...hashes,
      "'strict-dynamic'",
      ...extra,
    ]);
    if (isDevBuild(env)) sources.add("'unsafe-eval'");
    return `script-src ${[...sources].join(" ")}`;
  }

  //* AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=on moves the script policy into that header; another value is the header.
  static headersOf(
    sources: ScriptPolicySources | undefined,
    { directives, own }: DocumentPolicy,
    env: Record<string, string | undefined> = process.env,
  ): Record<string, string> {
    const raw = env.AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY?.trim();
    const setting = raw && !/[\r\n]/.test(raw) ? raw : null;
    const reportUri = ScriptPolicy.reportUri(env.AKAN_CONTENT_SECURITY_POLICY_REPORT_URI?.trim());
    const report = reportUri ? `; report-uri ${reportUri}; report-to ${SCRIPT_POLICY_REPORT_GROUP}` : "";
    const script = `${ScriptPolicy.scriptSrc(sources, env)}${report}`;
    const enforces = own && !(setting && isOn(setting));
    const written = setting && !isOn(setting) ? setting : null;
    const headers: Record<string, string> = {};
    const enforced = enforces ? [directives, script].filter(Boolean).join("; ") : directives;
    if (enforced) headers[SCRIPT_POLICY_HEADER] = enforced;
    if (written && !isOff(written)) headers[SCRIPT_POLICY_REPORT_ONLY_HEADER] = written;
    else if (!written && !enforces) headers[SCRIPT_POLICY_REPORT_ONLY_HEADER] = script;
    if (
      reportUri &&
      Object.values(headers).some((policy) => policy.includes(`report-to ${SCRIPT_POLICY_REPORT_GROUP}`))
    )
      headers["Reporting-Endpoints"] = `${SCRIPT_POLICY_REPORT_GROUP}="${reportUri}"`;
    return headers;
  }

  static apply(headers: Headers, sources: ScriptPolicySources | undefined, policy: DocumentPolicy): Headers {
    for (const [name, value] of Object.entries(ScriptPolicy.headersOf(sources, policy))) headers.set(name, value);
    return headers;
  }
}
