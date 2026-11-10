import type { PromiseOrObject } from "akanjs/base";
import { Err } from "akanjs/dictionary";
import { AgentMeter } from "./agentMeter";
import type { LlmTurnRequest } from "./predefinedAdaptor/llm.adaptor";

/** One relayed turn, the same object from the request policy through the quota to the usage report. */
export interface AgentTurnContext {
  /** Fresh per turn, so a quota hold and the usage that settles it pair up without guessing. */
  id: string;
  /** The turn's HTTP request headers, Authorization and Cookie included; empty for a turn no request carried. */
  headers: Headers;
  /** What the account middleware resolved for this call, as the access guard saw it; `null` for an anonymous one. */
  account: unknown;
  ip: string | null;
  /** Set on an `agentService.loop` round: `id` is one per run, `round` counts its model calls from 1. */
  loop?: { id: string; round: number };
  /** The loop request's `meta`, copied as given; only server code sets it, so it may key billing. */
  meta?: Record<string, string>;
}

/** @deprecated Use `AgentTurnContext`; `apply` still takes this shape and gives it a fresh `id` and empty `headers`. */
export interface AgentRequestContext {
  account: unknown;
  ip: string | null;
}

export type AgentRequestPolicy = (
  request: LlmTurnRequest,
  context: AgentTurnContext,
) => PromiseOrObject<LlmTurnRequest>;

export interface AgentRequestLimits {
  messages: number;
  tools: number;
  context: number;
  /** Text of every message, tool and context entry and the instructions, attachments aside. */
  chars: number;
  /** Attachment content as it travels: base64 `data` and `text`, summed over the whole history. */
  attachmentChars: number;
}

//? The browser writes the whole request: the access guard decides who spends the key, and only this decides on what.
export class AgentRelayPolicy {
  //? Past what the in-page agent sends and what a provider takes in one request, so a correct client never meets one.
  static readonly defaultLimits: Readonly<AgentRequestLimits> = {
    messages: 5_000,
    tools: 512,
    context: 256,
    chars: 8_000_000,
    attachmentChars: 64 * 1024 * 1024,
  };
  static #policy: AgentRequestPolicy | null = null;

  /**
   * `null` restores the default, `capped(defaultLimits)` on relayed turns only; `(request) => request` relays every
   * request untouched.
   */
  static use(policy: AgentRequestPolicy | null) {
    AgentRelayPolicy.#policy = policy;
  }

  static async apply(
    request: LlmTurnRequest,
    context: AgentTurnContext | AgentRequestContext,
  ): Promise<LlmTurnRequest> {
    const policy = AgentRelayPolicy.#policy ?? AgentRelayPolicy.#defaultPolicy;
    return await policy(request, "id" in context ? context : AgentMeter.turnOf(context.account, { ip: context.ip }));
  }

  //? The caps bound what a browser may write; a loop round is assembled by server code from its own tool results.
  static readonly #defaultPolicy: AgentRequestPolicy = (request, context) =>
    context.loop ? request : AgentRelayPolicy.capped(request);

  static capped(request: LlmTurnRequest, limits: Partial<AgentRequestLimits> = {}): LlmTurnRequest {
    const limit = { ...AgentRelayPolicy.defaultLimits, ...limits };
    const { messages, tools, context } = request;
    const counted = [messages.length <= limit.messages, tools.length <= limit.tools, context.length <= limit.context];
    if (counted.includes(false) || AgentRelayPolicy.#attachmentCharsOf(request) > limit.attachmentChars)
      AgentRelayPolicy.#refuse();
    if (AgentRelayPolicy.#charsOf(request) > limit.chars) AgentRelayPolicy.#refuse();
    return request;
  }

  static #refuse(): never {
    throw new Err("agent.error.requestRefused", undefined, { statusCode: 413 });
  }

  static #attachmentCharsOf({ messages }: LlmTurnRequest) {
    let chars = 0;
    for (const message of messages)
      for (const attachment of message.attachments ?? [])
        chars += (attachment.data?.length ?? 0) + (attachment.text?.length ?? 0);
    return chars;
  }

  static #charsOf({ messages, tools, context, instructions }: LlmTurnRequest) {
    const textOf = (value: unknown) => JSON.stringify(value)?.length ?? 0;
    let chars = instructions?.length ?? 0;
    for (const { attachments: _attachments, ...message } of messages) chars += textOf(message);
    return chars + textOf(tools) + textOf(context);
  }
}
