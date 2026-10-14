import type { PageDefinition, PathRoute } from "akanjs/client";
import { Logger, parseSearchParams } from "akanjs/common";
import { getRequestStore } from "akanjs/fetch";
import type { PagePromptEntry, PagePromptRecord, PagePromptRun, PagePromptRunInput } from "../signal/mcp/pagePrompt";

interface RscPagePromptsProps {
  routes: () => PathRoute[];
  run: <T>(request: Request, routeId: string, fn: () => Promise<T>) => Promise<T>;
  defaultLocale: () => string;
}

// Runs the route's render functions without rendering: the returned JSX is never walked, so only the page's own
// `fetch.*` calls run, and they are read off the request scope's query log.
export class RscPagePrompts {
  static readonly logger = new Logger("RscPagePrompts");

  readonly #props: RscPagePromptsProps;
  #cache: { routes: PathRoute[]; entries: Promise<PagePromptEntry[]> } | null = null;

  constructor(props: RscPagePromptsProps) {
    this.#props = props;
  }

  /** Cached against the route array's identity: init and reload replace it, and nothing else changes a page. */
  list(): Promise<PagePromptEntry[]> {
    const routes = this.#props.routes();
    if (this.#cache?.routes === routes) return this.#cache.entries;
    const entries = this.#collect(routes);
    this.#cache = { routes, entries };
    return entries;
  }

  async run(input: PagePromptRunInput): Promise<PagePromptRun> {
    const entry = (await this.list()).find((candidate) => candidate.name === input.name);
    if (!entry) return { ok: false, reason: "unknown", message: `Unknown prompt: ${input.name}.` };
    const route = this.#props.routes().find((candidate) => candidate.path === entry.pattern);
    const definition = await route?.renderPage.getRouteDefinition?.();
    if (!route || !definition)
      return { ok: false, reason: "error", message: `Prompt "${input.name}" lost its route between listing and run.` };
    const params = Object.fromEntries(
      RscPagePrompts.#pathParams(entry.pattern).flatMap((name) =>
        input.arguments[name] === undefined ? [] : [[name, input.arguments[name]]],
      ),
    );
    const searchParams = Object.fromEntries(
      definition.args
        .filter((arg) => arg.kind === "search" && input.arguments[arg.name] !== undefined)
        .map((arg) => [arg.name, RscPagePrompts.#searchValue(arg.list, input.arguments[arg.name] as string)]),
    );
    try {
      definition.resolveArgs({ params, searchParams }, { strict: true });
    } catch (error) {
      return { ok: false, reason: "argument", message: error instanceof Error ? error.message : String(error) };
    }
    const lang = input.language ?? this.#props.defaultLocale();
    const url = RscPagePrompts.#urlOf(entry.pattern, { ...params, lang }, searchParams);
    const request = new Request(url, { headers: input.headers });
    return await this.#props.run(request, route.path, async () => {
      const props = {
        params: { ...params, lang },
        searchParams: parseSearchParams(new URL(url).search),
      };
      try {
        for (const render of [...route.renderRootLayouts, ...route.renderLayouts, route.renderPage])
          await render.render({ ...props, children: null } as never);
      } catch (error) {
        return RscPagePrompts.#refusal(error);
      }
      const records = await Promise.all((getRequestStore()?.queryLog ?? []).map(RscPagePrompts.#settle));
      return { ok: true, url, records };
    });
  }

  async #collect(routes: PathRoute[]): Promise<PagePromptEntry[]> {
    const entries: PagePromptEntry[] = [];
    const owners = new Map<string, string>();
    for (const route of routes) {
      const definition = await route.renderPage.getRouteDefinition?.();
      const meta = definition?.kind === "page" ? (definition as PageDefinition).promptMeta : undefined;
      if (!meta) continue;
      const owner = owners.get(meta.name);
      if (owner)
        throw new Error(`[route-convention] prompt "${meta.name}" is declared by both ${owner} and ${route.path}`);
      owners.set(meta.name, route.path);
      entries.push({ ...meta, pattern: route.path });
    }
    // Alphabetical, like the tool catalogue: a client's slash menu and a prompt cache both key on order.
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  static #pathParams(pattern: string) {
    return pattern
      .split("/")
      .filter((part) => part.startsWith(":"))
      .map((part) => part.slice(1))
      .filter((name) => name !== "lang");
  }

  // A prompt argument is one string, so a list arrives comma-separated; the URL repeats the key like a browser would.
  static #searchValue(list: boolean, raw: string): string | string[] {
    if (!list) return raw;
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  static #urlOf(pattern: string, params: Record<string, string>, searchParams: Record<string, string | string[]>) {
    const pathname = pattern
      .split("/")
      .map((part) => (part.startsWith(":") ? encodeURIComponent(params[part.slice(1)] ?? "") : part))
      .join("/");
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(searchParams))
      for (const item of Array.isArray(value) ? value : [value]) search.append(name, item);
    const query = search.toString();
    return `http://127.0.0.1${pathname}${query ? `?${query}` : ""}`;
  }

  static async #settle(record: {
    key: string;
    args: Record<string, unknown>;
    returns: PagePromptRecord["returns"];
    value: Promise<unknown>;
  }): Promise<PagePromptRecord> {
    const { key, args, returns } = record;
    try {
      return { key, args, returns, value: await record.value };
    } catch (error) {
      return { key, args, returns, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // By digest, not instanceof: the pages bundle carries its own copy of `AkanRedirectError`.
  static #refusal(error: unknown): PagePromptRun {
    const digest = typeof error === "object" && error !== null ? (error as { digest?: unknown }).digest : undefined;
    if (digest === "AKAN_REDIRECT") {
      const location = String((error as { location?: unknown }).location ?? "");
      return {
        ok: false,
        reason: "redirect",
        message: `The page redirects to ${location}: the token's account may not view it, or a sign-in is required.`,
      };
    }
    if (digest === "AKAN_NOT_FOUND")
      return { ok: false, reason: "not-found", message: "The page answers not-found for these arguments." };
    // A guard's refusal (or a miss) of an awaited `fetch.*` arrives as the remote `Err` with its `statusCode`.
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    if (status === 401 || status === 403)
      return { ok: false, reason: "forbidden", message: `A query the screen makes refused the caller (${status}).` };
    if (status === 404)
      return { ok: false, reason: "not-found", message: "A document the screen reads does not exist." };
    RscPagePrompts.logger.warn(
      `page prompt body threw: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
    );
    return { ok: false, reason: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
