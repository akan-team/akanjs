import type { AgentLoopRemote, AgentLoopRemoteResult, AgentTool } from "akanjs/service";
import { MCP_APP_META, MCP_UI_MIME_TYPE } from "../../signal/mcp/mcpProtocol";
import type { RemoteFetch } from "./RemoteFetch";
import { RemoteMcp, type RemoteMcpCallResult, type RemoteMcpTool } from "./RemoteMcp";
import { RemoteError } from "./remoteError";

export interface RemoteAccess {
  /** The connection's access token, `""` for a remote that asks for none, or `null` with no connection. */
  token(): Promise<string | null>;
  /** Asked after a 401: a renewed token, or `null` once the connection cannot be renewed. */
  renew(): Promise<string | null>;
}

export interface RemoteSourceProps {
  name: string;
  /** The remote's MCP endpoint, as `RemoteSource.endpointOf` normalized it. */
  url: string;
  description: string;
  /** Narrows what the model is listed to these tool names; omitted, every tool the remote lists to the account. */
  allow?: readonly string[];
  access: RemoteAccess;
  fetcher: RemoteFetch;
  clientName?: string;
}

export interface RemoteScreen {
  html: string;
  href?: string;
}

interface RemoteApp {
  resourceUri?: string;
  static: boolean;
  readOnly: boolean;
}

// One remote MCP server as one account sees it: what `agentService.loop({ remotes })` lists and calls.
export class RemoteSource implements AgentLoopRemote {
  /** On a listed tool: its screen can be drawn as script-less HTML. On a call: asks for that HTML. */
  static readonly staticMeta = "akanjs/static";
  static readonly renderMeta = "akanjs/render";
  static readonly disconnected = "remoteDisconnected";
  //? A view is one file holding its whole client bundle, far past what a tool result may weigh.
  static readonly viewBytes = 8 * 1024 * 1024;
  static readonly #fullScreen = /^Open the full screen: (\S+)$/m;

  readonly name: string;
  readonly description: string;
  readonly #props: RemoteSourceProps;
  readonly #apps = new Map<string, RemoteApp>();
  readonly #tools = new Set<string>();
  #client: { token: string; mcp: RemoteMcp } | null = null;

  constructor(props: RemoteSourceProps) {
    this.name = props.name;
    this.description = props.description;
    this.#props = props;
  }

  /** A typed address as an MCP endpoint: a bare origin means the `/mcp` an akan server answers at. */
  static endpointOf(fetcher: RemoteFetch, input: string): string {
    const url = fetcher.parse(input.trim());
    url.hash = "";
    url.search = "";
    if (url.pathname === "/" || url.pathname === "") url.pathname = "/mcp";
    return url.href;
  }

  async list(): Promise<AgentTool[] | null> {
    const listed = await this.#with((mcp) => mcp.listTools());
    if (!listed) return null;
    const allowed = this.#props.allow ? new Set(this.#props.allow) : null;
    const tools = listed.filter((tool) => !allowed || allowed.has(tool.name));
    this.#apps.clear();
    this.#tools.clear();
    for (const tool of tools) {
      this.#tools.add(tool.name);
      const app = RemoteSource.#appOf(tool);
      if (app) this.#apps.set(tool.name, app);
    }
    return tools.map(({ name, description, inputSchema, annotations }) => ({
      name,
      ...(description ? { description } : {}),
      ...(inputSchema ? { parameters: inputSchema } : {}),
      readOnly: annotations?.readOnlyHint === true,
    }));
  }

  async call(tool: string, args: Record<string, unknown>): Promise<AgentLoopRemoteResult> {
    const answer = await this.#with((mcp) => mcp.callTool(tool, args));
    if (!answer)
      return {
        error: `The connection to "${this.name}" is gone. Open its toolkit again to reconnect.`,
        code: RemoteSource.disconnected,
      };
    const text = RemoteMcp.textOf(answer.content);
    if (answer.isError) return { error: text || "The call failed.", ...(answer.code ? { code: answer.code } : {}) };
    const app = this.#apps.get(tool);
    if (!app) return { result: text };
    const href = this.#hrefOf(answer, text);
    return {
      result: text,
      view: {
        ...(href ? { href } : {}),
        ...(app.static ? { static: true } : {}),
        ...(app.resourceUri ? { resourceUri: app.resourceUri } : {}),
      },
    };
  }

  /**
   * A static app's screen as the remote rendered it for this account, or `null` when it sent none.
   * Security: reached from a browser with no `approve` in front, so it calls only what the remote lists as a
   * read-only static app.
   */
  async screen(tool: string, args: Record<string, unknown>): Promise<RemoteScreen | null> {
    if (!this.#apps.size && !(await this.list())) return null;
    const app = this.#apps.get(tool);
    if (!app?.static || !app.readOnly) return null;
    const answer = await this.#with((mcp) => mcp.callTool(tool, args, { [RemoteSource.renderMeta]: "html" }));
    if (!answer || answer.isError) return null;
    const html = answer.content.find((part) => part.type === "resource" && part.resource?.mimeType === "text/html")
      ?.resource?.text;
    if (!html) return null;
    const href = this.#hrefOf(answer, RemoteMcp.textOf(answer.content.filter((part) => part.type === "text")));
    return { html, ...(href ? { href } : {}) };
  }

  /**
   * An app's view document, framed for a sandboxed frame on another origin, or `null` when the remote lists no such view.
   * Security: the document is the remote's own script. The policy put ahead of it lets it load only from the remote's
   * origin and connect nowhere, so everything it does goes through the host that frames it.
   */
  async view(uri: string): Promise<string | null> {
    if (!this.#apps.size && !(await this.list())) return null;
    if (![...this.#apps.values()].some((app) => app.resourceUri === uri)) return null;
    const contents = await this.#with((mcp) => mcp.readResource(uri, RemoteSource.viewBytes));
    const html = contents?.find((part) => part.mimeType === MCP_UI_MIME_TYPE)?.text;
    return html ? RemoteSource.framed(html, new URL(this.#props.url).origin) : null;
  }

  /** A call the view itself makes, answered as its server answers a view: raw values, for that frame alone. */
  async viewCall(tool: string, args: Record<string, unknown>): Promise<RemoteMcpCallResult | null> {
    if (!this.#tools.size && !(await this.list())) return null;
    if (!this.#tools.has(tool)) return null;
    return await this.#with((mcp) => mcp.callTool(tool, args, { [MCP_APP_META.view]: true }));
  }

  static framed(html: string, origin: string): string {
    const policy = [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      `style-src 'unsafe-inline' ${origin}`,
      `img-src ${origin} data: blob:`,
      `font-src ${origin} data:`,
      `media-src ${origin} data: blob:`,
      "connect-src 'none'",
      "frame-src 'none'",
      "form-action 'none'",
      `base-uri ${origin}`,
    ].join("; ");
    const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    const head = /<head(\s[^>]*)?>/i.exec(html);
    if (!head) return `${meta}${html}`;
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${meta}${html.slice(at)}`;
  }

  //? Security: the link is the remote's own text, so it is kept only when it stays on the origin the person connected.
  #hrefOf(answer: RemoteMcpCallResult, text: string): string | undefined {
    const named = answer.structuredContent?.href;
    const candidate = typeof named === "string" && named ? named : RemoteSource.#fullScreen.exec(text)?.[1];
    if (!candidate) return undefined;
    const origin = new URL(this.#props.url).origin;
    const url = URL.parse(candidate, origin);
    return url && url.origin === origin ? url.href : undefined;
  }

  async #with<T>(run: (mcp: RemoteMcp) => Promise<T>): Promise<T | null> {
    const token = await this.#props.access.token();
    if (token === null) return null;
    try {
      return await run(this.#clientOf(token));
    } catch (error) {
      if (!RemoteSource.#unauthorized(error)) throw error;
    }
    const renewed = await this.#props.access.renew();
    if (renewed === null) return null;
    try {
      return await run(this.#clientOf(renewed));
    } catch (error) {
      if (!RemoteSource.#unauthorized(error)) throw error;
      return null;
    }
  }

  #clientOf(token: string): RemoteMcp {
    if (this.#client?.token === token) return this.#client.mcp;
    const { fetcher, url, clientName } = this.#props;
    const mcp = new RemoteMcp(fetcher, url, token, clientName ? { clientName } : {});
    this.#client = { token, mcp };
    return mcp;
  }

  static #unauthorized(error: unknown): boolean {
    return error instanceof RemoteError && error.code === "remoteUnauthorized";
  }

  static #appOf(tool: RemoteMcpTool): RemoteApp | null {
    const meta = tool._meta;
    const ui = meta?.ui as { resourceUri?: unknown } | undefined;
    const resourceUri = typeof ui?.resourceUri === "string" ? ui.resourceUri : undefined;
    const isStatic = meta?.[RemoteSource.staticMeta] === true;
    if (!resourceUri && !isStatic) return null;
    return {
      ...(resourceUri ? { resourceUri } : {}),
      static: isStatic,
      readOnly: tool.annotations?.readOnlyHint === true,
    };
  }
}
