import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import {
  type CodeAgentMcpServerRef,
  type CodeAgentMcpStatus,
  type CodeAgentProfile,
  codeAgentClip,
  codeAgentOutputChars,
} from "akanjs/common";
import { Type } from "typebox";
import { WorkspaceTrust } from "../agent/WorkspaceTrust";
import { McpClient, type McpToolInfo, McpUnauthorized } from "./McpClient";
import { McpServerConfig } from "./McpServerConfig";
import { McpSignIn } from "./McpSignIn";

export interface McpToolPackOptions {
  workspaceRoot: string;
  profile: CodeAgentProfile;
  onNotice?: (message: string) => void;
}

interface McpToolPackServer {
  client: McpClient;
  tools: McpToolInfo[];
  token: string | undefined;
  status: CodeAgentMcpStatus;
  renewing: Promise<McpClient | undefined> | undefined;
  refused: McpClient | undefined;
}

// Tool names carry the server prefix: two servers offering `search` is the normal case, and a shadow is invisible.
export class McpToolPack {
  readonly #clients: McpToolPackServer[] = [];
  readonly #status: CodeAgentMcpStatus[] = [];
  readonly #onNotice: ((message: string) => void) | undefined;

  private constructor(onNotice: ((message: string) => void) | undefined) {
    this.#onNotice = onNotice;
  }

  /** Undefined only when nothing is declared; a pack whose every server failed still comes back to say why. */
  static async connect(options: McpToolPackOptions) {
    const refs = McpToolPack.#refs(options);
    if (!refs.length) return undefined;
    const pack = new McpToolPack(options.onNotice);
    for (const ref of refs) {
      const base = { name: ref.name, transport: ref.transport, target: McpServerConfig.targetOf(ref) };
      // Never an interactive sign-in: connect runs inside `CodeAgent.create`, before any screen is drawn.
      const token = ref.transport === "http" ? await McpSignIn.token(ref, options.onNotice) : undefined;
      try {
        const opened = await McpToolPack.#openRefreshing(ref, token, options.onNotice);
        const status: CodeAgentMcpStatus = {
          ...base,
          tools: opened.tools.map((tool) => McpToolPack.#nameOf(ref.name, tool.name)),
          auth: opened.token ? "authorized" : "none",
        };
        pack.#clients.push({ ...opened, status, renewing: undefined, refused: undefined });
        pack.#status.push(status);
      } catch (error) {
        if (error instanceof McpUnauthorized) {
          options.onNotice?.(`MCP server "${ref.name}" needs signing in — /mcp login ${ref.name}`);
          pack.#status.push({ ...base, tools: [], auth: "required" });
          continue;
        }
        // One unreachable integration must not cost the agent its turn, so it costs only its own tools.
        options.onNotice?.(`MCP server "${ref.name}" is unavailable: ${String(error)}`);
        pack.#status.push({ ...base, tools: [], error: String(error) });
      }
    }
    return pack;
  }

  // A token refused before its stated expiry, or issued with none, gets one refresh before a sign-in is asked for.
  static async #openRefreshing(
    ref: CodeAgentMcpServerRef,
    token: string | undefined,
    onNotice: ((message: string) => void) | undefined,
  ) {
    try {
      return await McpToolPack.#open(ref, token);
    } catch (error) {
      if (!(error instanceof McpUnauthorized) || !token) throw error;
      const retry = await McpSignIn.retryToken(ref, token, onNotice);
      if (!retry) throw error;
      return await McpToolPack.#open(ref, retry);
    }
  }

  static async #open(ref: CodeAgentMcpServerRef, token: string | undefined) {
    const client = await new McpClient(ref, token).connect();
    return { client, tools: await client.listTools(), token };
  }

  get toolNames() {
    return this.#clients.flatMap(({ client, tools }) =>
      tools.map((tool) => McpToolPack.#nameOf(client.ref.name, tool.name)),
    );
  }

  get status(): CodeAgentMcpStatus[] {
    return this.#status;
  }

  extension(): InlineExtension {
    return { name: "akan-mcp", factory: (pi: ExtensionAPI) => this.#register(pi) };
  }

  close() {
    for (const { client } of this.#clients) client.close();
  }

  #register(pi: ExtensionAPI) {
    for (const server of this.#clients)
      for (const tool of server.tools) {
        const name = McpToolPack.#nameOf(server.client.ref.name, tool.name);
        const description = tool.description ?? tool.name;
        pi.registerTool({
          name,
          label: `${server.client.ref.name}: ${tool.name}`,
          description,
          promptSnippet: `${name}: ${description.split(".")[0] ?? description}`,
          // The server's own schema goes through untouched; it is the party that validates the call.
          parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
          execute: async (_id, params) => {
            const result = await this.#call(server, tool.name, params ?? {});
            return {
              content: [{ type: "text", text: codeAgentClip(result.text, codeAgentOutputChars) }],
              details: undefined,
              isError: result.isError,
            };
          },
        });
      }
  }

  async #call(server: McpToolPackServer, tool: string, args: Record<string, unknown>) {
    const client = server.client;
    try {
      return await client.callTool(tool, args);
    } catch (error) {
      if (!(error instanceof McpUnauthorized)) throw error;
    }
    const renewed = await this.#renewed(server, client);
    try {
      if (renewed) return await renewed.callTool(tool, args);
    } catch (error) {
      if (!(error instanceof McpUnauthorized)) throw error;
      McpToolPack.#refuse(server, renewed);
    }
    throw new Error(`MCP server "${client.ref.name}" needs signing in — /mcp login ${client.ref.name}`);
  }

  // Reported as a failed connect is; only a new pack, after `/mcp login` or `/mcp reload`, reads `authorized` again.
  static #refuse(server: McpToolPackServer, client: McpClient | undefined) {
    server.refused = client;
    server.status.auth = "required";
  }

  // One refresh per refused token, shared by every call it refused; a server that refuses every token costs one.
  async #renewed(server: McpToolPackServer, refused: McpClient) {
    if (server.client === refused && server.refused !== refused)
      server.renewing ??= this.#renew(server, refused).finally(() => {
        server.renewing = undefined;
      });
    if (server.renewing) return await server.renewing;
    return server.client === server.refused ? undefined : server.client;
  }

  async #renew(server: McpToolPackServer, refused: McpClient) {
    const token = server.token ? await McpSignIn.retryToken(refused.ref, server.token, this.#onNotice) : undefined;
    const client = token ? await McpToolPack.#reopen(refused.ref, token) : undefined;
    if (!client) {
      McpToolPack.#refuse(server, refused);
      return undefined;
    }
    refused.close();
    server.client = client;
    server.token = token;
    return client;
  }

  // A new client, so a new streamable HTTP session: a server may bind its session to the token that opened it.
  static async #reopen(ref: CodeAgentMcpServerRef, token: string) {
    try {
      return await new McpClient(ref, token).connect();
    } catch (error) {
      if (error instanceof McpUnauthorized) return undefined;
      throw error;
    }
  }

  static #nameOf(server: string, tool: string) {
    return `mcp__${server.replace(/[^a-zA-Z0-9_]/g, "_")}__${tool}`;
  }

  static #refs(options: McpToolPackOptions): CodeAgentMcpServerRef[] {
    if (options.profile.tools.mcp === "off") return [];
    const declared = Array.isArray(options.profile.tools.mcp) ? options.profile.tools.mcp : [];
    if (WorkspaceTrust.isTrusted(options.workspaceRoot, "mcp"))
      return [...McpServerConfig.read(options.workspaceRoot), ...declared];
    const skipped = McpServerConfig.read(options.workspaceRoot, ["workspace"]).map((ref) => ref.name);
    options.onNotice?.(
      `Not started, because this repo's MCP servers are not approved: ${skipped.join(", ")}. Start akan code in a terminal to approve them, or pass --trust-workspace.`,
    );
    return [...McpServerConfig.read(options.workspaceRoot, ["global"]), ...declared];
  }
}
