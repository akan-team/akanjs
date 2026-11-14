import { createHash, randomBytes } from "node:crypto";
import { DevSurfacePolicy } from "./routing/devSurfacePolicy";

export const SCRIPT_POLICY_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const SCRIPT_POLICY_REPORT_GROUP = "akan-csp";
/** A proxy caps the header block (nginx reads it into 4 KB by default), and one hash source is 53 bytes. */
export const MAX_RESPONSE_SCRIPT_HASHES = 32;

export interface ScriptPolicySources {
  nonce?: string;
  hashes?: Iterable<string>;
}

export interface PageScript {
  attrs: string;
  text: string;
  external: boolean;
}

export const isOff = (value: string) => ["off", "false", "0", "none"].includes(value.toLowerCase());
const hashSourceRe = /^'?(sha(?:256|384|512)-[A-Za-z0-9+/_-]+={0,2})'?$/;
const scriptOpenRe = /<script\b([^>]*)>/gi;
const scriptCloseRe = /<\/script[\s/>]/i;
const executableTypeRe = /^(?:|module|importmap|speculationrules|(?:text|application)\/(?:x-)?(?:java|ecma)script)$/i;

export class ScriptPolicy {
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
    if (!raw || isOff(raw)) return [];
    return raw.split(/\s+/).filter((source) => /^(?:'[\w+/=-]+'|[\w*.:/+-]+)$/.test(source));
  }

  static reportUri(raw = process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_URI?.trim()): string | null {
    if (!raw || isOff(raw) || /[\s;,"'<>\\]/.test(raw)) return null;
    return raw;
  }

  //* 'strict-dynamic' turns 'self' off in a browser that knows it, so every script is named by a hash or the nonce
  //* and loads the rest itself; 'self' is what an older browser falls back to.
  //? Dev adds 'unsafe-eval': React's development build evaluates text to name server frames in a stack.
  static reportOnly(
    { nonce, hashes = [] }: ScriptPolicySources = {},
    env: Record<string, string | undefined> = process.env,
  ): string | null {
    const raw = env.AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY?.trim();
    if (raw && !/[\r\n]/.test(raw)) return isOff(raw) ? null : raw;
    const extra = ScriptPolicy.extraSources(env.AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC?.trim());
    const named = new Set([...(nonce ? [`'nonce-${nonce}'`] : []), ...hashes, ...extra]);
    const sources = ["'self'", ...named, "'strict-dynamic'"];
    if (DevSurfacePolicy.isDevBuild(env)) sources.push("'unsafe-eval'");
    const reportUri = ScriptPolicy.reportUri(env.AKAN_CONTENT_SECURITY_POLICY_REPORT_URI?.trim());
    const report = reportUri ? `; report-uri ${reportUri}; report-to ${SCRIPT_POLICY_REPORT_GROUP}` : "";
    return `script-src ${sources.join(" ")}${report}`;
  }

  static apply(headers: Headers, sources: ScriptPolicySources = {}): Headers {
    const policy = ScriptPolicy.reportOnly(sources);
    if (!policy) return headers;
    headers.set(SCRIPT_POLICY_REPORT_ONLY_HEADER, policy);
    const reportUri = ScriptPolicy.reportUri();
    if (reportUri && policy.includes(`report-to ${SCRIPT_POLICY_REPORT_GROUP}`))
      headers.set("Reporting-Endpoints", `${SCRIPT_POLICY_REPORT_GROUP}="${reportUri}"`);
    return headers;
  }
}
