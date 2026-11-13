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

/** `description` is the one line the model reads, in `openToolkit`'s own description, to decide whether to open it. */
export interface AgentLoopToolkit {
  description: string;
  tools: readonly string[];
}

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

/**
 * `awaiting`: `approve` deferred a call, and a resume with the messages `onMessage` stored asks it again; or a client
 * tool was called, and a resume with its result appended runs on from it.
 */
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
  /**
   * Named groups of `allow` the model adds with `openToolkit({ name })`, a tool this run lists beside them; a tool in no
   * toolkit is listed every round. An opened toolkit's tools are listed from the next round on, `allow` still capping
   * them, and stay open across a resume and a compaction. `openToolkit` is never asked about and counts as no tool call.
   */
  toolkits?: Record<string, AgentLoopToolkit>;
  /**
   * The tools of a screen a connected browser has open (`AgentClientTools.list()` in `akanjs/ui`): client input,
   * listed beside the endpoint tools and never run here. `approve` is still asked. An allowed call ends the run as
   * `awaiting` with `client: true`; append the browser's result, or an error when no page answers, and resume. A name
   * an endpoint tool or `openToolkit` holds is dropped.
   */
  clientTools?: AgentTool[];
  /** Summarizes all but the last `keep` messages (6) once the transcript is estimated at `at` tokens. */
  compact?: { at: number; keep?: number };
  /** Asked before every call; without it a `needsConfirm` tool is refused, and so is any write once tainted. */
  approve?: AgentLoopApprove;
  /**
   * Sees a result whole, before the 20,000-character clip. A resume re-applies it to stored, clipped results and also
   * reads the `tainted` mark on stored messages, so store each message `onMessage` hands over whole.
   */
  untrusted?: (result: AgentWireToolResult) => boolean;
  meta?: Record<string, string>;
  signal?: AbortSignal;
  /** Awaited for each message the run appends, before it acts on it; a retried run may hand one over twice. */
  onMessage?: (message: AgentWireMessage) => PromiseOrObject<void>;
}

/**
 * `account` is a snapshot the server resolved; `principal` is a server-stored id `option.setAgentAccountResolver`
 * resolves at the start and before every round, so a revoked one stops the run. Either one missing or falsy ends the
 * run as `unauthorized`: there is no anonymous run.
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
  | { type: "awaiting"; call: AgentWireToolCall; client?: true }
  | { type: "done"; stop: AgentLoopStop; rounds: number }
  | { type: "error"; message: string; error: unknown };
