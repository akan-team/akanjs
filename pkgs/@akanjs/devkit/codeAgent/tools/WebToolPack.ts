import { isIP } from "node:net";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { type CodeAgentProfile, codeAgentClip } from "akanjs/common";
import { Type } from "typebox";
import { DeepSeekWeb } from "./DeepSeekWeb";

export interface WebToolPackOptions {
  profile: CodeAgentProfile;
  /** Serves search after any key-named provider, and reads public pages to Markdown ahead of a direct fetch. */
  deepseek?: DeepSeekWeb | undefined;
}

interface SearchProvider {
  name: string;
  envKey: string;
  search(key: string, query: string, count: number): Promise<string>;
}

interface WebSearcher {
  name: string;
  search(query: string, count: number, signal?: AbortSignal): Promise<string>;
}

interface WebPage {
  status: number;
  ok: boolean;
  title: string;
  text: string;
}

// web_search only with a provider key set: a tool that can never work costs prompt tokens and invites retries.
export class WebToolPack {
  static readonly pageChars = 10_000;
  static readonly maxResults = 10;
  static readonly #rememberedPages = 16;
  readonly #options: WebToolPackOptions;
  // A continuation reads the snapshot its first page came from; a fresh read always refetches, since a local dev
  // page changes between edits.
  readonly #pages = new Map<string, WebPage>();

  constructor(options: WebToolPackOptions) {
    this.#options = options;
  }

  static providers: SearchProvider[] = [
    {
      name: "brave",
      envKey: "BRAVE_API_KEY",
      search: async (key, query, count) => {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
        const response = await fetch(url, { headers: { "x-subscription-token": key, accept: "application/json" } });
        const body = (await response.json()) as {
          web?: { results?: { title: string; url: string; description: string }[] };
        };
        return (body.web?.results ?? []).map((r) => `- ${r.title}\n  ${r.url}\n  ${r.description}`).join("\n");
      },
    },
    {
      name: "tavily",
      envKey: "TAVILY_API_KEY",
      search: async (key, query, count) => {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ api_key: key, query, max_results: count }),
        });
        const body = (await response.json()) as { results?: { title: string; url: string; content: string }[] };
        return (body.results ?? []).map((r) => `- ${r.title}\n  ${r.url}\n  ${r.content}`).join("\n");
      },
    },
  ];

  /** Names the session allowlist must carry. Empty when the profile, or the environment, offers nothing. */
  names() {
    const names: string[] = [];
    if (this.#options.profile.tools.web.fetch) names.push("web_fetch");
    if (this.#options.profile.tools.web.search && this.#searcher()) names.push("web_search");
    return names;
  }

  extension(): InlineExtension | undefined {
    if (!this.names().length) return undefined;
    return { name: "akan-web", factory: (pi: ExtensionAPI) => this.#register(pi) };
  }

  #register(pi: ExtensionAPI) {
    if (this.#options.profile.tools.web.fetch) this.#registerFetch(pi);
    const searcher = this.#searcher();
    if (this.#options.profile.tools.web.search && searcher) this.#registerSearch(pi, searcher);
  }

  #registerFetch(pi: ExtensionAPI) {
    const allowHosts = this.#options.profile.network.allowHosts;
    pi.registerTool({
      name: "web_fetch",
      label: "Fetch",
      description: `Fetch a URL and return its readable text, ${WebToolPack.pageChars} characters at a time. A longer page ends with the offset that continues it.`,
      promptSnippet: "web_fetch: fetch a URL and return its readable text",
      parameters: Type.Object({
        url: Type.String({ description: "Absolute http(s) URL." }),
        offset: Type.Optional(Type.Number({ description: "Character offset a previous call named, to read on." })),
      }),
      execute: async (_id, params, signal) => {
        const refusal = WebToolPack.#refuseHost(params.url, allowHosts);
        if (refusal) return { content: [{ type: "text", text: refusal }], details: undefined, isError: true };
        const offset = Math.max(0, Math.floor(params.offset ?? 0));
        const cached = offset ? this.#pages.get(params.url) : undefined;
        const page = cached ?? (await this.#read(params.url, signal));
        if (page.ok) this.#remember(params.url, page);
        return {
          content: [{ type: "text", text: WebToolPack.#window(params.url, page, offset) }],
          details: undefined,
          isError: !page.ok,
        };
      },
    });
  }

  #registerSearch(pi: ExtensionAPI, searcher: WebSearcher) {
    const hint =
      searcher.name === "deepseek"
        ? ` Keep the query within ${DeepSeekWeb.maxQueryChars} characters; site:, -site: and quoted phrases work.`
        : "";
    pi.registerTool({
      name: "web_search",
      label: "Search",
      description: `Search the web (${searcher.name}) and return the top results as title, url and summary.${hint}`,
      promptSnippet: "web_search: search the web and return titles, urls and snippets",
      parameters: Type.Object({
        query: Type.String(),
        count: Type.Optional(
          Type.Number({ description: `How many results, default 5, at most ${WebToolPack.maxResults}.` }),
        ),
      }),
      execute: async (_id, params, signal) => {
        const count = Math.min(Math.max(Math.round(params.count ?? 5), 1), WebToolPack.maxResults);
        try {
          const results = await searcher.search(params.query, count, signal);
          return {
            content: [{ type: "text", text: codeAgentClip(results || "(no results)", WebToolPack.pageChars) }],
            details: undefined,
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: message }], details: undefined, isError: true };
        }
      },
    });
  }

  #searcher(): WebSearcher | undefined {
    const provider = WebToolPack.providers.find((entry) => !!process.env[entry.envKey]);
    if (provider)
      return {
        name: provider.name,
        search: (query, count) => provider.search(process.env[provider.envKey] ?? "", query, count),
      };
    const deepseek = this.#options.deepseek;
    return deepseek
      ? { name: "deepseek", search: (query, count, signal) => deepseek.search(query, count, signal) }
      : undefined;
  }

  async #read(url: string, signal?: AbortSignal): Promise<WebPage> {
    const deepseek = this.#options.deepseek;
    if (deepseek && !WebToolPack.#isLocal(new URL(url).hostname)) {
      try {
        const page = await deepseek.fetch(url, signal);
        return { status: 200, ok: true, title: page.title, text: page.content };
      } catch (error: unknown) {
        if (signal?.aborted) throw error;
      }
    }
    const response = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    return { status: response.status, ok: response.ok, title: "", text: WebToolPack.#readable(await response.text()) };
  }

  #remember(url: string, page: WebPage) {
    this.#pages.delete(url);
    this.#pages.set(url, page);
    const oldest = this.#pages.keys().next().value;
    if (this.#pages.size > WebToolPack.#rememberedPages && oldest) this.#pages.delete(oldest);
  }

  static #window(url: string, page: WebPage, offset: number) {
    const head = [`${page.status} ${url}`, page.title].filter(Boolean).join("\n");
    const total = page.text.length;
    if (offset && offset >= total)
      return `${head}\n\nOffset ${offset} is past the end; the page has ${total} characters.`;
    const end = Math.min(offset + WebToolPack.pageChars, total);
    const rest = end < total ? `\n\n[characters ${offset}–${end} of ${total}; offset ${end} reads on]` : "";
    return `${head}\n\n${page.text.slice(offset, end)}${rest}`;
  }

  // DeepSeek's servers cannot reach these, and an intranet name has no business leaving the machine.
  static #isLocal(hostname: string) {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const family = isIP(host);
    if (family === 6) return host === "::1" || /^(f[cd]|fe[89ab])/.test(host);
    if (family === 4) {
      const [a = 0, b = 0] = host.split(".").map(Number);
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      );
    }
    return !host.includes(".") || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host);
  }

  static #refuseHost(url: string, allowHosts: string[] | undefined) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return `"${url}" is not an absolute URL.`;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "Only http and https URLs can be fetched.";
    if (allowHosts?.length && !allowHosts.includes(parsed.hostname))
      return `This profile only allows ${allowHosts.join(", ")}.`;
    return undefined;
  }

  /** Enough to read a documentation page; a full HTML parser is not worth a dependency for that. */
  static #readable(html: string) {
    return html
      .replace(/<script[\s\S]*?<\/script[^<>]*>/gi, " ")
      .replace(/<style[\s\S]*?<\/style[^<>]*>/gi, " ")
      .replace(/<[^<>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
