import { readFile } from "node:fs/promises";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CodeAgentProfile } from "akanjs/common";
import { akanCodeDefaultModel } from "./akanCodeModel";

interface PreparedRequest {
  model: { provider: string; baseUrl?: string };
  options: { apiKey?: string };
}

type PrepareRequest = (model: unknown, options?: Record<string, unknown>) => Promise<PreparedRequest>;

export interface CodeAgentProxyOptions {
  baseUrl: string;
  providers: string[];
  tokenFile?: string;
  token?: string;
}

/**
 * Routes every model request through a host's LLM proxy, so a pod never holds a provider key: the host mints a
 * short-lived token, writes it to a file, and rotates it there while the worker keeps running.
 *
 * `baseUrl` may carry `{provider}` for a proxy that fronts several providers under one host.
 */
export class CodeAgentProxy {
  static readonly placeholderKey = "akan-code-proxy";

  readonly baseUrl: string;
  readonly providers: string[];
  readonly #tokenFile?: string;
  readonly #token?: string;

  constructor({ baseUrl, providers, tokenFile, token }: CodeAgentProxyOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.providers = providers;
    this.#tokenFile = tokenFile;
    this.#token = token;
    if (!tokenFile && !token)
      throw new Error("AKAN_CODE_PROXY_URL needs AKAN_CODE_PROXY_TOKEN_FILE or AKAN_CODE_PROXY_TOKEN");
  }

  static fromEnv(profile?: CodeAgentProfile): CodeAgentProxy | null {
    const baseUrl = process.env.AKAN_CODE_PROXY_URL?.trim() || profile?.network.proxyBaseUrl;
    if (!baseUrl) return null;
    const providers = (process.env.AKAN_CODE_PROXY_PROVIDERS ?? akanCodeDefaultModel.provider)
      .split(",")
      .map((provider) => provider.trim())
      .filter(Boolean);
    return new CodeAgentProxy({
      baseUrl,
      providers,
      tokenFile: process.env.AKAN_CODE_PROXY_TOKEN_FILE?.trim() || undefined,
      token: process.env.AKAN_CODE_PROXY_TOKEN?.trim() || undefined,
    });
  }

  baseUrlFor(provider: string) {
    return this.baseUrl.replaceAll("{provider}", provider);
  }

  //* Read per request, not cached: the host rotates a token that outlives no single turn, and a worker holding the
  //* first one would start failing half an hour into a session it is still running.
  async token() {
    if (!this.#tokenFile) return this.#token ?? "";
    const token = (await readFile(this.#tokenFile, "utf8")).trim();
    if (!token) throw new Error(`${this.#tokenFile} is empty`);
    return token;
  }

  /**
   * `prepareRequest` is the one path every stream, completion, compaction and cache-warm request takes, which is
   * why it is wrapped rather than the public stream methods. It is private in the engine's typings, so its
   * absence after an engine upgrade fails here at boot instead of sending a request with no key.
   */
  async apply(runtime: ModelRuntime) {
    const target = runtime as unknown as { prepareRequest?: PrepareRequest };
    const original = target.prepareRequest?.bind(runtime);
    if (!original) throw new Error("The model runtime no longer exposes prepareRequest; update CodeAgentProxy");
    for (const provider of this.providers) await runtime.setRuntimeApiKey(provider, CodeAgentProxy.placeholderKey);
    target.prepareRequest = async (model, options = {}) => {
      const apiKey = await this.token();
      const prepared = await original(model, { ...options, apiKey });
      return {
        ...prepared,
        model: { ...prepared.model, baseUrl: this.baseUrlFor(prepared.model.provider) },
        options: { ...prepared.options, apiKey },
      };
    };
  }
}
