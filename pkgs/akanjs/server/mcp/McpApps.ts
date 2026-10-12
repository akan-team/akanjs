import { getEnv } from "akanjs/base";
import type { PromptContent, PromptMessage } from "../../signal/mcp/Msg";
import {
  MCP_UI_EXTENSION,
  MCP_UI_LEGACY_RESOURCE_URI,
  MCP_UI_MIME_TYPE,
  type McpResource,
  type McpResourceContents,
  type McpTool,
} from "../../signal/mcp/mcpProtocol";
import type { PagePromptEntry, PagePromptRecord, PagePromptRun } from "../../signal/mcp/pagePrompt";

/** The CSR shell a view boots from: one single-file HTML per basePath, read from the build that serves the web. */
export interface McpAppShellSource {
  readonly basePaths: readonly string[];
  /** `""` is the app without a basePath; `null` when this build has no single-file shell for it. */
  read(basePath: string): Promise<string | null>;
}

interface McpAppSnapshotRecord {
  key: string;
  args: Record<string, unknown>;
  value: unknown;
}

// MCP Apps: a `.prompt()` page is also a tool, and a host that speaks the extension renders its result from the app's
// own CSR shell. Without a shell (an api-only build, `web: { csr: false }`) the tool answers the briefing alone.
export class McpApps {
  static readonly scheme = "ui://";
  static readonly sessionPrefix = "ui.";
  // Read by `McpAppBridge` on the view side; `_meta` is the one part of a result no host hands to the model.
  static readonly snapshotKey = "akanjs/snapshot";
  // A basePath sits under the root's own segment, so no basePath name can address the root's screens.
  static readonly rootSegment = "app";
  static readonly #tokenClaims = new Set(["iss", "aud", "exp", "nbf", "iat", "jti", "client_id", "scope"]);
  // Runs before the bundle. A `srcdoc` view throws on any cookie or storage access, and a proxy-origin view would share
  // one storage with every other app the host renders there, so the view keeps both in memory, like a native shell.
  // A host may block the `<base>` despite `baseUriDomains` (Claude does), so a root-relative asset — a stored file's
  // `/api/...` URL — is pointed at the app's origin wherever it is written, before the browser fetches it.
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
      const expired = attrs.some((attr) => /^\\s*expires=/i.test(attr) && Date.parse(attr.split("=")[1]) < Date.now());
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
    return value.split(",").map((part) => part.trim().replace(/^\\S+/, absolute)).join(", ");
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

  readonly #shell: McpAppShellSource | null;

  constructor(shell: McpAppShellSource | null) {
    this.#shell = shell;
  }

  get rendersUi() {
    return this.#shell !== null;
  }

  static declaresUi(capabilities: unknown) {
    if (!capabilities || typeof capabilities !== "object") return false;
    const extensions = (capabilities as { extensions?: unknown }).extensions;
    if (!extensions || typeof extensions !== "object") return false;
    const ui = (extensions as Record<string, { mimeTypes?: unknown } | undefined>)[MCP_UI_EXTENSION];
    return Array.isArray(ui?.mimeTypes) && ui.mimeTypes.includes(MCP_UI_MIME_TYPE);
  }

  toolOf(entry: PagePromptEntry): McpTool {
    const properties = Object.fromEntries(
      entry.arguments.map((arg) => [
        arg.name,
        { type: "string", ...(arg.description ? { description: arg.description } : {}) },
      ]),
    );
    const required = entry.arguments.filter((arg) => arg.required).map((arg) => arg.name);
    return {
      name: entry.name,
      description: entry.description,
      inputSchema: {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      ...(this.#shell ? { _meta: this.#toolMetaOf(this.uriOf(this.#basePathOf(entry.pattern))) } : {}),
    };
  }

  #toolMetaOf(resourceUri: string) {
    return { ui: { resourceUri }, [MCP_UI_LEGACY_RESOURCE_URI]: resourceUri };
  }

  resourcesOf(entries: PagePromptEntry[]): McpResource[] {
    if (!this.#shell) return [];
    const { appName } = getEnv();
    const basePaths = [...new Set(entries.map((entry) => this.#basePathOf(entry.pattern)))];
    return basePaths.map((basePath) => ({
      uri: this.uriOf(basePath),
      name: basePath || appName,
      description: `The ${basePath || appName} screens, rendered in place of a tool result.`,
      mimeType: MCP_UI_MIME_TYPE,
    }));
  }

  //? Lowercased: an authority is case-insensitive (RFC 3986), and a host may normalize it before reading it back.
  uriOf(basePath: string) {
    const root = `${McpApps.scheme}${getEnv().appName.toLowerCase()}/${McpApps.rootSegment}`;
    return basePath ? `${root}/${basePath}` : root;
  }

  // `connect-src` stays closed: every call the view makes is relayed by the host under the host's credential. The
  // origin is opened for what the page loads by URL — its fonts and stored images — and as the base those resolve
  // against, since a `srcdoc` view has no URL of its own.
  async read(uri: string, origin: string): Promise<McpResourceContents | null> {
    const shell = this.#shell;
    const basePath = shell ? this.#basePathOfUri(uri) : null;
    if (!shell || basePath === null) return null;
    const html = await shell.read(basePath);
    if (!html) return null;
    const appOrigin = McpApps.#originOf(origin);
    return {
      uri,
      mimeType: MCP_UI_MIME_TYPE,
      text: McpApps.#withHead(appOrigin ? McpApps.#absoluteCss(html, appOrigin) : html, appOrigin),
      _meta: {
        ui: {
          prefersBorder: false,
          ...(appOrigin ? { csp: { resourceDomains: [appOrigin], baseUriDomains: [appOrigin] } } : {}),
        },
      },
    };
  }

  // The prompt's own blocks are valid tool-result content, so a host without the extension reads the same briefing.
  // Security: the snapshot is the screen's raw values, unmasked for an agent, so it rides `_meta`, which a host passes
  // to the view and never to the model; some hosts do show `structuredContent` to the model.
  resultOf(
    run: Extract<PagePromptRun, { ok: true }>,
    messages: PromptMessage[],
    webOrigin: string,
    forView: { account: Record<string, unknown> | null } | null,
  ) {
    const url = new URL(run.url);
    const href = `${url.pathname}${url.search}`;
    const content: PromptContent[] = [
      ...messages.map((message) => message.content),
      { type: "text", text: `Open this screen in a browser: ${webOrigin}${href}` },
    ];
    if (!this.#shell || !forView) return { content, isError: false };
    const _meta = { [McpApps.snapshotKey]: McpApps.#snapshotOf(run.records), "akanjs/account": forView.account };
    return { content, structuredContent: { href }, _meta, isError: false };
  }

  // The claims a browser tab reads off its own token to decide what it shows, so a guarded layout renders in the view
  // instead of sending it to sign in. Security: the token itself never leaves; the guards judge every relayed call.
  static accountOf(req: Request): Record<string, unknown> | null {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const payload = token?.split(".")[1];
    if (!payload) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(claims).filter(([key]) => !McpApps.#tokenClaims.has(key)));
    } catch {
      return null;
    }
  }

  #basePathOf(pattern: string) {
    const [, , segment] = pattern.split("/");
    return segment && this.#shell?.basePaths.includes(segment) ? segment : "";
  }

  #basePathOfUri(uri: string) {
    const match = /^ui:\/\/([^/]+)\/([^?#]*)$/i.exec(uri);
    if (!match || match[1]?.toLowerCase() !== getEnv().appName.toLowerCase()) return null;
    const [root, basePath, ...rest] = (match[2] ?? "").split("/");
    if (root !== McpApps.rootSegment || rest.length) return null;
    if (!basePath) return "";
    return this.#shell?.basePaths.includes(basePath) ? basePath : null;
  }

  // Raw wire values, exactly what the browser's own call would have received under the same credential.
  static #snapshotOf(records: PagePromptRecord[]): McpAppSnapshotRecord[] {
    return records.flatMap(({ key, args, value }) => (value === undefined ? [] : [{ key, args, value }]));
  }

  // Security: the origin comes from `x-forwarded-host` unless a resource is pinned; it is written into markup only
  // once `URL` has reduced it to scheme, host and port.
  static #originOf(origin: string) {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
    } catch {
      return null;
    }
  }

  // The shell's own stylesheet names its fonts by root-relative URL, which a blocked `<base>` would resolve against the
  // host's sandbox origin.
  static #absoluteCss(html: string, origin: string) {
    return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) =>
      block.replace(/url\((["']?)\/(?!\/)/g, `url($1${origin}/`),
    );
  }

  // After `<meta charset>` when the head declares one before its first script: a decoder only looks for it in the
  // first 1024 bytes, and the preamble alone is longer.
  static #withHead(html: string, origin: string | null) {
    const embed = JSON.stringify({ kind: "mcp-app", ...(origin ? { origin } : {}) });
    const preamble = `<script>\nwindow.__AKAN_EMBED__ = ${embed};${McpApps.#runtime}</script>`;
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
