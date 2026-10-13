import { getEnv } from "akanjs/base";
import { bearerTokenOf, decodeJwtPayload } from "akanjs/common";
import type { PromptContent, PromptMessage } from "../../signal/mcp/Msg";
import {
  MCP_APP_META,
  MCP_UI_EXTENSION,
  MCP_UI_LEGACY_RESOURCE_URI,
  MCP_UI_MIME_TYPE,
  type McpAppSnapshotRecord,
  type McpResource,
  type McpResourceContents,
  type McpTool,
} from "../../signal/mcp/mcpProtocol";
import type { PagePromptEntry, PagePromptRecord, PagePromptRun } from "../../signal/mcp/pagePrompt";
import { McpAppShell } from "./McpAppShell";

/** The CSR shell a view boots from: one single-file HTML per basePath, read from the build that serves the web. */
export interface McpAppShellSource {
  readonly basePaths: readonly string[];
  /** `""` is the app without a basePath; `null` when this build has no single-file shell for it. */
  read(basePath: string): Promise<string | null>;
}

// MCP Apps: a `.prompt()` page is also a tool, and a host that speaks the extension renders its result from the app's
// own CSR shell. Without a shell (an api-only build, `web: { csr: false }`) the tool answers the briefing alone.
export class McpApps {
  static readonly scheme = "ui://";
  // A basePath sits under the root's own segment, so no basePath name can address the root's screens.
  static readonly rootSegment = "app";
  static readonly #tokenClaims = new Set(["iss", "aud", "exp", "nbf", "iat", "jti", "client_id", "scope"]);

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
      // Not read-only: the page run makes the page's own `fetch.*` calls under the caller's token, mutations included.
      annotations: { readOnlyHint: false, openWorldHint: false },
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

  async read(uri: string, origin: string): Promise<McpResourceContents | null> {
    const shell = this.#shell;
    const basePath = shell ? this.#basePathOfUri(uri) : null;
    if (!shell || basePath === null) return null;
    const html = await shell.read(basePath);
    return html ? McpAppShell.contentsOf(uri, html, origin) : null;
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
    const _meta = {
      [MCP_APP_META.snapshot]: McpApps.#snapshotOf(run.records),
      [MCP_APP_META.account]: forView.account,
    };
    return { content, structuredContent: { href }, _meta, isError: false };
  }

  // The claims a browser tab reads off its own token to decide what it shows, so a guarded layout renders in the view
  // instead of sending it to sign in. Security: the token itself never leaves; the guards judge every relayed call.
  static accountOf(req: Request): Record<string, unknown> | null {
    const token = bearerTokenOf(req.headers.get("authorization"));
    if (!token) return null;
    try {
      const claims = decodeJwtPayload<Record<string, unknown>>(token);
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
}
