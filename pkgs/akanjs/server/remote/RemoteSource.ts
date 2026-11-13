import type { AgentLoopRemote, AgentLoopRemoteResult, AgentTool } from "akanjs/service";
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
}

// One remote MCP server as one account sees it: what `agentService.loop({ remotes })` lists and calls.
export class RemoteSource implements AgentLoopRemote {
  /** On a listed tool: its screen can be drawn as script-less HTML. On a call: asks for that HTML. */
  static readonly staticMeta = "akanjs/static";
  static readonly renderMeta = "akanjs/render";
  static readonly disconnected = "remoteDisconnected";
  static readonly #fullScreen = /^Open the full screen: (\S+)$/m;

  readonly name: string;
  readonly description: string;
  readonly #props: RemoteSourceProps;
  readonly #apps = new Map<string, RemoteApp>();
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
    for (const tool of tools) {
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

  /** A static app's screen as the remote rendered it for this account, or `null` when it sent none. */
  async screen(tool: string, args: Record<string, unknown>): Promise<RemoteScreen | null> {
    const answer = await this.#with((mcp) => mcp.callTool(tool, args, { [RemoteSource.renderMeta]: "html" }));
    if (!answer || answer.isError) return null;
    const html = answer.content.find((part) => part.type === "resource" && part.resource?.mimeType === "text/html")
      ?.resource?.text;
    if (!html) return null;
    const href = this.#hrefOf(answer, RemoteMcp.textOf(answer.content.filter((part) => part.type === "text")));
    return { html, ...(href ? { href } : {}) };
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
    return { ...(resourceUri ? { resourceUri } : {}), static: isStatic };
  }
}
