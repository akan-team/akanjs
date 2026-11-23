import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { codeAgentClip } from "akanjs/common";

interface DeepSeekSearchResult {
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
  date?: string | null;
}

export interface DeepSeekPage {
  title: string;
  content: string;
}

export class DeepSeekWeb {
  static readonly baseUrl = "https://api.deepseek.com/v1/tools";
  static readonly maxQueryChars = 128;
  static readonly summaryChars = 600;
  // Only a successful call is billed, so a retry costs nothing. Search has no fallback and waits out every transient
  // status; fetch waits only on its quota and otherwise falls back to a direct read, which beats DeepSeek's 504.
  static readonly #retryable: { [tool in "search" | "fetch"]: number[] } = {
    search: [408, 429, 500, 502, 503, 504],
    fetch: [429],
  };
  static readonly #attempts = 3;

  readonly #key: string;
  readonly #baseUrl: string;

  constructor(key: string, baseUrl = DeepSeekWeb.baseUrl) {
    this.#key = key;
    this.#baseUrl = baseUrl;
  }

  /** Undefined behind a proxy, where the runtime holds only a placeholder and the real key stays with the host. */
  static async fromRuntime(runtime: ModelRuntime, proxied: boolean) {
    if (proxied) return undefined;
    const key = (await runtime.getAuth("deepseek").catch(() => undefined))?.auth.apiKey;
    return key ? new DeepSeekWeb(key) : undefined;
  }

  async search(query: string, count: number, signal?: AbortSignal) {
    if ([...query].length > DeepSeekWeb.maxQueryChars)
      throw new Error(`DeepSeek search takes at most ${DeepSeekWeb.maxQueryChars} characters; shorten the query.`);
    const body = await this.#call<{ results?: DeepSeekSearchResult[] }>("search", { query, count }, 20_000, signal);
    const byUrl = new Map<string, DeepSeekSearchResult>();
    for (const result of body.results ?? []) {
      const url = DeepSeekWeb.#cleanUrl(result.url);
      if (!byUrl.has(url)) byUrl.set(url, { ...result, url });
    }
    return [...byUrl.values()]
      .map((result) => {
        const date = result.date ? ` · ${result.date.slice(0, 10)}` : "";
        const summary = DeepSeekWeb.unescape(result.summary || result.snippet || "")
          .replace(/\s+/g, " ")
          .trim();
        return `- ${result.title}\n  ${result.url}${date}\n  ${codeAgentClip(summary, DeepSeekWeb.summaryChars)}`;
      })
      .join("\n");
  }

  async fetch(url: string, signal?: AbortSignal): Promise<DeepSeekPage> {
    const page = await this.#call<{ title?: string; content?: string }>("fetch", { url }, 30_000, signal);
    return { title: page.title ?? "", content: DeepSeekWeb.unescape(page.content ?? "") };
  }

  // Fetch escapes every ASCII punctuation mark, structure included (`\#\# Title`, `foo\(\)`), which costs tokens
  // and garbles code. Undone only when nearly all punctuation is escaped, so a page already clean keeps its `\.`.
  static unescape(markdown: string) {
    const escaped = markdown.match(/\\[!-/:-@[-`{-~]/g)?.length ?? 0;
    const punctuation = markdown.match(/[!-/:-@[-`{-~]/g)?.length ?? 0;
    if (!escaped || escaped < (punctuation - escaped) / 2) return markdown;
    return markdown.replace(/\\([!-/:-@[-`{-~])/g, "$1");
  }

  async #call<T>(tool: "search" | "fetch", body: object, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`${this.#baseUrl}/${tool}`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return (await response.json()) as T;
      if (!DeepSeekWeb.#retryable[tool].includes(response.status) || attempt >= DeepSeekWeb.#attempts) {
        const error = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
        throw new Error(
          `DeepSeek ${tool} answered ${response.status}: ${error?.error?.message ?? response.statusText}`,
        );
      }
      await DeepSeekWeb.#wait(DeepSeekWeb.#delayOf(response, attempt), signal);
    }
  }

  static #delayOf(response: Response, attempt: number) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1000 * 2 ** (attempt - 1);
  }

  static #wait(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  /** Drops the tracking parameters and the bare `#1` chunk marker DeepSeek appends to result URLs. */
  static #cleanUrl(url: string) {
    try {
      const parsed = new URL(url);
      for (const name of [...parsed.searchParams.keys()]) if (name.startsWith("utm_")) parsed.searchParams.delete(name);
      if (/^#\d+$/.test(parsed.hash)) parsed.hash = "";
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
