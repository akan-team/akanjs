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

/** The single-file view each `.app()` boots from, read from the build that serves the web. */
export interface McpAppShellSource {
  /** `null` when this build has no view for the app. */
  read(app: string): Promise<string | null>;
}

interface McpAppsOption {
  /** Every write the view sends is refused before it leaves, as the deployment lists no write to relay it to. */
  readOnly?: boolean;
}

// MCP Apps: each `.app()` is a read-only tool, and a host that speaks the extension draws its result with that app's
// own view. A `.prompt()` page is a text tool beside its prompt. Without views (an api-only build,
// `web: { csr: false }`) an app's tool answers with the briefing alone.
export class McpApps {
  static readonly scheme = "ui://";
  static readonly #tokenClaims = new Set(["iss", "aud", "exp", "nbf", "iat", "jti", "client_id", "scope"]);
  //? Checked before the name reaches the shell source, which reads a file named after it.
  static readonly #appUri = /^ui:\/\/([^/]+)\/apps\/([A-Za-z0-9_-]{1,64})$/;

  readonly #shell: McpAppShellSource | null;
  readonly #readOnly: boolean;

  constructor(shell: McpAppShellSource | null, { readOnly = false }: McpAppsOption = {}) {
    this.#shell = shell;
    this.#readOnly = readOnly;
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
    const inputSchema = {
      type: "object" as const,
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    };
    const tool = { name: entry.name, description: entry.description, inputSchema };
    // A prompt's run renders the whole page, whose own `fetch.*` calls may write; an app's load may only query.
    if (entry.kind === "prompt") return { ...tool, annotations: { readOnlyHint: false, openWorldHint: false } };
    return {
      ...tool,
      annotations: { readOnlyHint: true, openWorldHint: false },
      ...(this.#shell ? { _meta: this.#toolMetaOf(this.uriOf(entry.name)) } : {}),
    };
  }

  #toolMetaOf(resourceUri: string) {
    return { ui: { resourceUri }, [MCP_UI_LEGACY_RESOURCE_URI]: resourceUri };
  }

  resourcesOf(entries: PagePromptEntry[]): McpResource[] {
    if (!this.#shell) return [];
    return entries
      .filter((entry) => entry.kind === "app")
      .map((entry) => ({
        uri: this.uriOf(entry.name),
        name: entry.name,
        description: entry.description,
        mimeType: MCP_UI_MIME_TYPE,
      }));
  }

  //? Lowercased: an authority is case-insensitive (RFC 3986), and a host may normalize it before reading it back.
  uriOf(app: string) {
    return `${McpApps.scheme}${getEnv().appName.toLowerCase()}/apps/${app}`;
  }

  async read(uri: string, origin: string): Promise<McpResourceContents | null> {
    const match = McpApps.#appUri.exec(uri);
    const app = match?.[1]?.toLowerCase() === getEnv().appName.toLowerCase() ? match[2] : undefined;
    if (!this.#shell || !app) return null;
    const html = await this.#shell.read(app);
    return html ? McpAppShell.contentsOf(uri, html, origin) : null;
  }

  // The prompt's own blocks are valid tool-result content, so a host without the extension reads the same briefing.
  // Security: the snapshot is the screen's raw values, unmasked for an agent, so it rides `_meta`, which a host passes
  // to the view and never to the model. `structuredContent`, which some hosts do show the model, holds only where the
  // view starts: the arguments the model gave.
  resultOf(
    entry: PagePromptEntry,
    run: Extract<PagePromptRun, { ok: true }>,
    messages: PromptMessage[],
    webOrigin: string,
    forView: { account: Record<string, unknown> | null } | null,
  ) {
    const url = new URL(run.url);
    const href = `${url.pathname}${url.search}`;
    const content: PromptContent[] = [
      ...messages.map((message) => message.content),
      { type: "text", text: `Open the full screen: ${webOrigin}${href}` },
    ];
    if (entry.kind === "prompt" || !this.#shell || !forView) return { content, isError: false };
    const _meta = {
      [MCP_APP_META.snapshot]: McpApps.#snapshotOf(run.records),
      [MCP_APP_META.account]: forView.account,
      ...(this.#readOnly ? { [MCP_APP_META.readOnly]: true } : {}),
    };
    return { content, structuredContent: { href, ...run.route }, _meta, isError: false };
  }

  // The claims a browser tab reads off its own token to decide what it shows, so a component that reads the account
  // draws as it would in the browser. Security: the token itself never leaves; the guards judge every relayed call.
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

  // Raw wire values, exactly what the browser's own call would have received under the same credential.
  static #snapshotOf(records: PagePromptRecord[]): McpAppSnapshotRecord[] {
    return records.flatMap(({ key, args, value }) => (value === undefined ? [] : [{ key, args, value }]));
  }
}
