import { MCP_UI_MIME_TYPE, type McpResourceContents } from "../../signal/mcp/mcpProtocol";
import { mcpAppViewRuntime } from "./mcpAppViewRuntime";

export class McpAppShell {
  static readonly #hostname = /^(?:[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?|\[[0-9a-f:.]+\])$/;
  static readonly #runtime = `\n(${mcpAppViewRuntime.toString()})();\n`;

  // `connect-src` stays closed: every call the view makes is relayed by the host under the host's credential. The
  // origin is opened for what the page loads by URL — its fonts and stored images — and as the base those resolve
  // against, since a `srcdoc` view has no URL of its own.
  static contentsOf(uri: string, html: string, origin: string): McpResourceContents {
    const appOrigin = McpAppShell.#originOf(origin);
    return {
      uri,
      mimeType: MCP_UI_MIME_TYPE,
      text: McpAppShell.#withHead(appOrigin ? McpAppShell.#absoluteCss(html, appOrigin) : html, appOrigin),
      _meta: {
        ui: {
          prefersBorder: false,
          ...(appOrigin ? { csp: { resourceDomains: [appOrigin], baseUriDomains: [appOrigin] } } : {}),
        },
      },
    };
  }

  // Security: the origin comes from `x-forwarded-host` unless a resource is pinned, and `URL` keeps a `"` (even a
  // `%22`) in a host. It reaches markup and the CSP only when its host is plain DNS or IP characters.
  static #originOf(origin: string) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
      return McpAppShell.#hostname.test(parsed.hostname) ? parsed.origin : null;
    } catch {
      return null;
    }
  }

  // The shell's own stylesheet names its fonts by root-relative URL, which a blocked `<base>` would resolve against the
  // host's sandbox origin.
  static #absoluteCss(html: string, origin: string) {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) =>
      block.replace(/url\((["']?)\/(?!\/)/g, (_url, quote: string) => `url(${quote}${origin}/`),
    );
  }

  // After `<meta charset>` when the head declares one before its first script: a decoder only looks for it in the
  // first 1024 bytes, and the preamble alone is longer.
  static #withHead(html: string, origin: string | null) {
    const embed = JSON.stringify({ kind: "mcp-app", ...(origin ? { origin } : {}) });
    const preamble = `<script>\nwindow.__AKAN_EMBED__ = ${embed};${McpAppShell.#runtime}</script>`;
    const inject = `${origin ? `<base href="${origin}/">` : ""}${preamble}`;
    const head = /<head(\s[^>]*)?>/i.exec(html);
    if (!head) return `${inject}${html}`;
    const headEnd = head.index + head[0].length;
    const scriptAt = html.indexOf("<script", headEnd);
    const charset = /<meta\s[^>]*charset[^>]*>/i.exec(html.slice(headEnd, scriptAt < 0 ? undefined : scriptAt));
    const at = charset ? headEnd + charset.index + charset[0].length : headEnd;
    return `${html.slice(0, at)}${inject}${html.slice(at)}`;
  }
}
