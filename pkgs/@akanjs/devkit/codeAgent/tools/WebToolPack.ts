import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { type CodeAgentProfile, codeAgentClip, codeAgentOutputChars } from "akanjs/common";
import { Type } from "typebox";

export interface WebToolPackOptions {
  profile: CodeAgentProfile;
}

interface SearchProvider {
  name: string;
  envKey: string;
  search(key: string, query: string, count: number): Promise<string>;
}

// web_search only with a provider key set: a tool that can never work costs prompt tokens and invites retries.
export class WebToolPack {
  readonly #options: WebToolPackOptions;

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
    if (this.#options.profile.tools.web.search && WebToolPack.#provider()) names.push("web_search");
    return names;
  }

  extension(): InlineExtension | undefined {
    if (!this.names().length) return undefined;
    return { name: "akan-web", factory: (pi: ExtensionAPI) => this.#register(pi) };
  }

  #register(pi: ExtensionAPI) {
    if (this.#options.profile.tools.web.fetch) this.#registerFetch(pi);
    const provider = WebToolPack.#provider();
    if (this.#options.profile.tools.web.search && provider) this.#registerSearch(pi, provider);
  }

  #registerFetch(pi: ExtensionAPI) {
    const allowHosts = this.#options.profile.network.allowHosts;
    pi.registerTool({
      name: "web_fetch",
      label: "Fetch",
      description: "Fetch a URL and return its readable text. HTML is stripped to text; the result is truncated.",
      promptSnippet: "web_fetch: fetch a URL and return its readable text",
      parameters: Type.Object({ url: Type.String({ description: "Absolute http(s) URL." }) }),
      execute: async (_id, params) => {
        const refusal = WebToolPack.#refuseHost(params.url, allowHosts);
        if (refusal) return { content: [{ type: "text", text: refusal }], details: undefined, isError: true };
        const response = await fetch(params.url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
        const text = WebToolPack.#readable(await response.text());
        return {
          content: [
            { type: "text", text: `${response.status} ${params.url}\n\n${codeAgentClip(text, codeAgentOutputChars)}` },
          ],
          details: undefined,
          isError: !response.ok,
        };
      },
    });
  }

  #registerSearch(pi: ExtensionAPI, provider: SearchProvider) {
    pi.registerTool({
      name: "web_search",
      label: "Search",
      description: `Search the web (${provider.name}) and return the top results as title, url and snippet.`,
      promptSnippet: "web_search: search the web and return titles, urls and snippets",
      parameters: Type.Object({
        query: Type.String(),
        count: Type.Optional(Type.Number({ description: "How many results, default 5." })),
      }),
      execute: async (_id, params) => {
        const key = process.env[provider.envKey] ?? "";
        const results = await provider.search(key, params.query, params.count ?? 5);
        return {
          content: [{ type: "text", text: codeAgentClip(results || "(no results)", codeAgentOutputChars) }],
          details: undefined,
        };
      },
    });
  }

  static #provider() {
    return WebToolPack.providers.find((provider) => !!process.env[provider.envKey]);
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
