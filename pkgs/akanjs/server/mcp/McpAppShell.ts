import { MCP_UI_MIME_TYPE, type McpResourceContents } from "../../signal/mcp/mcpProtocol";

export class McpAppShell {
  static readonly #hostname = /^(?:[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.?|\[[0-9a-f:.]+\])$/;
  // Runs before the bundle. A `srcdoc` view throws on any cookie or storage access, and a proxy-origin view would share
  // one storage with every other app the host renders there, so the view keeps both in memory, like a native shell.
  // A host may block the `<base>` despite `baseUriDomains` (Claude does), so a root-relative asset — a stored file's
  // `/api/...` URL — is pointed at the app's origin wherever it is written, before the browser fetches it. A srcset URL
  // may hold commas (a `data:` URL does), so candidates part where the HTML parser parts them, not at every comma.
  static readonly #runtime = `
(() => {
  const memoryStorage = () => {
    const items = new Map();
    return {
      get length() { return items.size; },
      key: (idx) => [...items.keys()][idx] ?? null,
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => { items.set(String(key), String(value)); },
      removeItem: (key) => { items.delete(String(key)); },
      clear: () => { items.clear(); },
    };
  };
  for (const name of ["localStorage", "sessionStorage"])
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
  const jar = new Map();
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => [...jar].map(([name, value]) => name + "=" + value).join("; "),
    set: (raw) => {
      const [pair, ...attrs] = String(raw).split(";");
      const at = pair.indexOf("=");
      if (at < 0) return;
      const name = pair.slice(0, at).trim();
      const attrOf = (key) => {
        const found = attrs.find((attr) => attr.trim().toLowerCase().startsWith(key + "="));
        return found === undefined ? undefined : found.slice(found.indexOf("=") + 1).trim();
      };
      const maxAge = attrOf("max-age");
      const expires = attrOf("expires");
      const expired = maxAge !== undefined && /^-?\\d+$/.test(maxAge)
        ? Number(maxAge) <= 0
        : expires !== undefined && Date.parse(expires) < Date.now();
      if (expired) jar.delete(name);
      else jar.set(name, pair.slice(at + 1).trim());
    },
  });
  const origin = window.__AKAN_EMBED__.origin;
  if (!origin || document.baseURI.startsWith(origin + "/")) return;
  const absolute = (url) => (url.startsWith("/") && !url.startsWith("//") ? origin + url : url);
  const valueOf = (el, name, value) => {
    if (typeof value !== "string") return value;
    if (name === "src" || name === "poster" || (name === "href" && el.tagName === "LINK")) return absolute(value);
    if (name !== "srcset") return value;
    return value.replace(/(^|,)(\\s*)([^\\s,](?:\\S*[^\\s,])?)/g, (_, comma, space, url) => comma + space + absolute(url));
  };
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    return setAttribute.call(this, name, valueOf(this, String(name).toLowerCase(), value));
  };
  const fix = (el) => {
    for (const name of ["src", "srcset", "poster", "href"]) {
      const value = el.getAttribute(name);
      if (value !== null && valueOf(el, name, value) !== value) setAttribute.call(el, name, valueOf(el, name, value));
    }
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") fix(record.target);
      else for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        fix(node);
        for (const el of node.querySelectorAll("[src],[srcset],[poster],link[href]")) fix(el);
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "poster", "href"],
  });
})();
`;

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
