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

/**
 * `tainted`: a result `untrusted` marked, with no `untrusted` any result a tool returned, or a client tool's answer was
 * read earlier in this run or in the messages it resumed from. `client`: the call is to a tool of `clientTools`, whose
 * name may be that of an endpoint this run does not list.
 */
export type AgentLoopApprove = (
  call: AgentWireToolCall,
  state: { tainted: boolean; tool: AgentTool; client?: true },
) => PromiseOrObject<AgentLoopApproval>;

/** What answers a parked call: a page's `run(call)` result or the member's reply. Its `name` is the call's, never sent. */
export type AgentLoopCallAnswer = Omit<AgentWireToolResult, "name">;

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
 * tool or `askUser` was called, and a resume with those messages and its `answer` runs on from it.
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
  /** Tool names; the run sees only those `AgentToolsRole` lists to the account: `/mcp`'s, plus `mcp: "agent"` ones. */
  allow: readonly string[];
  /**
   * The transcript so far, ending in a user message for a new ask or in unanswered calls for a resumed run: your own
   * user messages and what `onMessage` handed over, nothing a client sent. What a client answers goes in `answer`.
   */
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
   * listed beside the endpoint tools and never run here. `approve` is still asked, and sees each as a write whatever
   * `readOnly` it was sent with. An allowed call ends the run as `awaiting` with `client: true`; resume with the
   * browser's result as `answer`, or `{ id, error }` when no page answers. A name an endpoint tool or `openToolkit`
   * holds is dropped. Past 128 tools or 200,000 characters of definitions the run ends with
   * `agent.error.clientToolsRefused`, and its rounds meet the relay's size caps (`AgentRelayPolicy.defaultLimits`).
   */
  clientTools?: AgentTool[];
  /**
   * Lists `askUser({ question, choices?, multiple? })`, the in-page chat's own tool. A call ends the run as `awaiting`
   * with `question: true`; resume with the person's reply as `answer: { id, result }`, or `{ id, error }` when they
   * dismiss it. It never reaches `approve`, counts as no tool call, and `untrusted` never sees its answer. A call with
   * no question is answered with an error instead. A `clientTools` entry by that name is dropped.
   */
  ask?: boolean;
  /**
   * Answers the call the last run parked on with `client` or `question`: the first call of the last batch that
   * nothing answered, and only when it is a client tool's or `askUser`'s. The run names the result after that call,
   * hands it to `onMessage` and runs on. An endpoint tool's call is answered only by running it, so an `answer` that
   * names any other call ends the run with `agent.error.answerRefused` before anything runs; resume without it. It is
   * clipped as a tool's result is, and of its `attachments` only `data` and `text` are kept, never a `url`.
   */
  answer?: AgentLoopCallAnswer;
  /**
   * Summarizes all but the last `keep` messages (6), a batch's results counting as one, once the transcript is
   * estimated at `at` tokens, and also when a round's call fails as `agent.error.contextOverflow`, which is then asked
   * again once. A refusal whose data carries `limit` and `requested`, in any one unit, lowers `at` for the rest of the
   * run to where the request would fit.
   */
  compact?: { at: number; keep?: number };
  /** Asked before every call; without it a `needsConfirm` tool is refused, and so is any write once tainted. */
  approve?: AgentLoopApprove;
  /**
   * Says which endpoint results carry text someone else wrote. Left out, every result of a call that ran taints the
   * run, an error included, so with no `approve` only the batch written before any result may write; `() => false`
   * trusts them all. A client tool's answer always taints and is never shown to it, as a page may name a tool after
   * an endpoint. `askUser`'s answer, `openToolkit`'s and a call the run refused never taint. Sees a
   * result whole, before the 20,000-character clip. A resume re-applies it to stored, clipped results, or with none
   * counts every stored result, a refusal included, and also reads the `tainted` mark on stored messages, so store
   * each message `onMessage` hands over whole.
   */
  untrusted?: (result: AgentWireToolResult) => boolean;
  meta?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Awaited for each message the run appends, before it acts on it; a retried run may hand one over twice. A batch's
   * results arrive one tool message a call, as each call finishes: a run that dies mid-batch has stored those.
   */
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
  | { type: "awaiting"; call: AgentWireToolCall; client?: true; question?: true }
  | { type: "done"; stop: AgentLoopStop; rounds: number }
  | { type: "error"; message: string; error: unknown };
