import { Translator } from "akanjs/client";
import { parseAkanI18nEnv } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import type { PromptContent, PromptMessage, PromptResult, SerializedSignal } from "akanjs/signal";
import type { ChatMessage } from "use-agentic";

export interface AgentPrompt {
  name: string;
  refName: string;
  description?: string;
  args: { name: string; required: boolean }[];
}

/**
 * The user-invokable `prompt()` endpoints of the mounted app, read off the serialized signals the client already
 * holds — the same catalogue MCP lists them from, so a chat needs no listing endpoint. Guards are not evaluated
 * here: a prompt's own GET enforces them at call time, and the refusal lands in the transcript like any failure.
 */
export class AgentPrompts {
  static of(): AgentPrompts {
    return new AgentPrompts(FetchClient.sharedSerializedSignal);
  }

  readonly #signals: Record<string, SerializedSignal>;

  constructor(signals: Record<string, SerializedSignal>) {
    this.#signals = signals;
  }

  list(): AgentPrompt[] {
    const prompts: AgentPrompt[] = [];
    for (const [refName, signal] of Object.entries(this.#signals))
      for (const [name, endpoint] of Object.entries(signal.endpoint)) {
        if (endpoint.type !== "prompt") continue;
        prompts.push({
          name,
          refName,
          ...(this.#description(refName, name) ? { description: this.#description(refName, name) } : {}),
          args: (endpoint.args ?? []).map((arg) => ({
            name: arg.name,
            required: !(arg.nullable ?? arg.type === "search"),
          })),
        });
      }
    return prompts.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  find(name: string): AgentPrompt | null {
    return this.list().find((prompt) => prompt.name === name) ?? null;
  }

  /** `/name arg1 "an arg with spaces"` — positional because a prompt's arguments are flat strings by protocol. */
  static parseCommand(draft: string): { name: string; args: string[] } | null {
    const match = /^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(draft.trim());
    if (!match) return null;
    return { name: match[1], args: AgentPrompts.#args(match[2] ?? "") };
  }

  /**
   * Whitespace separates arguments, and quotes are how a sentence stays one of them — a prompt taking a single
   * `String` is the common case, and splitting "plan the week" into three arguments fills the second parameter
   * with the second word.
   */
  static #args(rest: string): string[] {
    const args: string[] = [];
    for (const token of rest.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) args.push(token[1] ?? token[2] ?? token[3]);
    return args;
  }

  /** The messages a prompt returns become the user's turn, the way an MCP client sends a `prompts/get` result. */
  static messagesOf(result: PromptResult): ChatMessage[] {
    if (typeof result === "string") return [{ role: "user", text: result }];
    return result.map((message) => AgentPrompts.#messageOf(message));
  }

  /**
   * A binary block becomes an attachment. It used to become the string `[image]`, which a model reads as having
   * been shown a picture — so a prompt built with `Msg.imageOf` produced confident answers about bytes that never
   * left the server. The other block types are text already and stay text.
   */
  static #messageOf(message: PromptMessage): ChatMessage {
    const { role, content } = message;
    if (content.type !== "image" && content.type !== "audio") return { role, text: AgentPrompts.textOf(content) };
    const name = AgentPrompts.#binaryName(content.mimeType);
    return { role, attachments: [{ name, mimeType: content.mimeType, data: content.data }] };
  }

  /** `Msg.image` carries no filename — the protocol has nowhere to put one — so the type is the label. */
  static #binaryName(mimeType: string) {
    const [kind, subtype] = mimeType.split("/");
    return subtype ? `${kind}.${subtype.split("+")[0]}` : mimeType;
  }

  static textOf(content: PromptContent): string {
    if (content.type === "text") return content.text;
    if (content.type === "resource") return `[resource ${content.resource.uri}]\n${content.resource.text}`;
    if (content.type === "resource_link") return `[link ${content.name}: ${content.uri}]`;
    return `[${content.type}]`;
  }

  #description(refName: string, name: string) {
    return this.#text(`${refName}.signal.${name}.desc`) ?? this.#text(`${refName}.signal.${name}`);
  }

  #text(key: string) {
    const locale = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
    const text = Translator.translateByLocale(locale, key);
    // A missing key comes back as the key itself, which is the only signal the translator gives.
    return text === key ? undefined : text;
  }
}
