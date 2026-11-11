import type { PromiseOrObject } from "akanjs/base";
import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type {
  AgentWireContext,
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
  LlmUsage,
} from "../predefinedAdaptor/llm.adaptor";

export type AgentLoopApproval = "allow" | "defer" | { deny: string };

/** `tainted`: a result `untrusted` marked was read earlier in this run, or in the messages it resumed from. */
export type AgentLoopApprove = (
  call: AgentWireToolCall,
  state: { tainted: boolean; tool: AgentTool },
) => PromiseOrObject<AgentLoopApproval>;

export interface AgentLoopBudget {
  /** Input and output tokens summed over this run's model calls, compactions included. */
  tokens?: number;
  toolCalls?: number;
  /**
   * Like `signal`, also ends a run stuck in a tool or in `approve`. `callAs` cannot cancel a call: the run stops waiting
   * and answers it with an error saying it may still finish, so a resume does not run it again, and the endpoint runs
   * on unreported.
   */
  wallMs?: number;
}

/** `awaiting`: `approve` deferred a call; resume with the messages `onMessage` stored and it is asked again. */
export type AgentLoopStop =
  | "end"
  | "maxRounds"
  | "budget"
  | "aborted"
  | "length"
  | "quota"
  | "unauthorized"
  | "awaiting";

export interface AgentLoopOptions {
  /** Tool names; the run sees only those the account may also see on `/mcp`. */
  allow: readonly string[];
  /** The transcript so far, ending in a user message for a new ask or in unanswered calls for a resumed run. */
  messages: AgentWireMessage[];
  /** With no `preamble` either, a short neutral prompt stands in, as each adaptor's own fallback is about a screen. */
  instructions?: string;
  /** Prepended to `instructions`; there is none by default, as the in-page preamble is about a screen. */
  preamble?: string;
  context?: AgentWireContext[];
  model?: string;
  maxRounds?: number;
  budget?: AgentLoopBudget;
  /** Summarizes all but the last `keep` messages (6) once the transcript is estimated at `at` tokens. */
  compact?: { at: number; keep?: number };
  /** Asked before every call; without it a `needsConfirm` tool is refused, and so is any write once tainted. */
  approve?: AgentLoopApprove;
  /** Must judge a result by what it holds, as a resume re-applies it to stored results to rebuild the taint. */
  untrusted?: (result: AgentWireToolResult) => boolean;
  meta?: Record<string, string>;
  signal?: AbortSignal;
  /** Awaited for each message the run appends, before it acts on it; a retried run may hand one over twice. */
  onMessage?: (message: AgentWireMessage) => PromiseOrObject<void>;
}

/**
 * `account` is a snapshot the server resolved; `principal` is a server-stored id `option.setAgentAccountResolver`
 * resolves at the start and before every round, so a revoked one stops the run.
 */
export type AgentLoopRequest = AgentLoopOptions &
  ({ account: unknown; principal?: undefined } | { principal: string; account?: undefined });

export type AgentLoopEvent =
  | { type: "text"; delta: string; round: number }
  | { type: "toolCall"; call: AgentWireToolCall; round: number }
  | { type: "toolResult"; result: AgentWireToolResult; round: number }
  | { type: "usage"; usage: LlmUsage; model?: string; round: number }
  /**
   * The first `replaced` messages of the transcript as it stands, `onMessage`'s included, are now `summary`. Store it
   * whole: its `tainted` carries the run's taint across a resume.
   */
  | { type: "compacted"; replaced: number; summary: AgentWireMessage }
  | { type: "awaiting"; call: AgentWireToolCall }
  | { type: "done"; stop: AgentLoopStop; rounds: number }
  | { type: "error"; message: string; error: unknown };
