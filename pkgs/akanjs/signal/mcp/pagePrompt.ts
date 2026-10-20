import type { McpPromptArgument } from "./mcpProtocol";

export interface PagePromptEntry {
  /** A `.prompt()` briefs the whole screen; an `.app()` is one component of it, which a host draws from the result. */
  kind: "prompt" | "app";
  name: string;
  description: string;
  arguments: McpPromptArgument[];
  /** The matched route pattern, e.g. `/:lang/project/:projectId`. */
  pattern: string;
}

export interface PagePromptRecord {
  key: string;
  args: Record<string, unknown>;
  returns: { refName: string; modelType?: string; arrDepth?: number; nullable?: boolean };
  value?: unknown;
  error?: string;
}

/** `forbidden` is a data call inside the body refused with 401/403: the screen is not this caller's, like a redirect. */
export type PagePromptRefusal = "unknown" | "argument" | "redirect" | "forbidden" | "not-found" | "error";

/** The route values the run read, as the page's own route holds them: where an app's view starts. */
export interface PagePromptRoute {
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}

export type PagePromptRun =
  | { ok: true; url: string; records: PagePromptRecord[]; route: PagePromptRoute }
  | { ok: false; reason: PagePromptRefusal; message: string };

export interface PagePromptRunInput {
  name: string;
  /** `prompts/get` sends a flat string map; the page's own declaration types each value. */
  arguments: Record<string, string>;
  headers: [string, string][];
  /** The synthetic URL's locale segment, which the route needs whether or not the page reads it. */
  language?: string;
}

export interface PagePromptVisibleInput {
  names: string[];
  /** The caller's credential, which the route guards read as a browser's would be. */
  headers: [string, string][];
  language?: string;
}

/** Pages live in the RSC worker, a process apart from the one serving `/mcp`, so the router reaches them through this. */
export interface PagePromptSource {
  list(): Promise<PagePromptEntry[]>;
  /** The listed names whose route guards admit the caller; one that needs an argument is left to the call. */
  visible(input: PagePromptVisibleInput): Promise<string[]>;
  run(input: PagePromptRunInput): Promise<PagePromptRun>;
}
