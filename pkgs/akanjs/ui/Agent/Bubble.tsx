"use client";
import { cn, usePage } from "akanjs/client";
import { memo } from "react";
import { type AgentProgressReport, AgentSession, type ChatMessage, type ToolCallResult, ToolOutput } from "use-agentic";
import { createOverridable } from "../UiOverride";
import { Chips } from "./Attach";
import Markdown from "./Markdown";
import { tokenCount } from "./tokenCount";

export interface BubbleProps {
  className?: string;
  message: ChatMessage;
  /** What the call still running last reported about itself, so a slow tool says what it is doing. */
  progress?: (AgentProgressReport & { callId: string }) | null;
  /**
   * Results by call id, gathered across the transcript. A call and its result are two wire messages — the model
   * needs both — but they are one thing that happened, so the call's own row resolves in place instead of the
   * name appearing again as a second row.
   */
  results?: ReadonlyMap<string, ToolCallResult>;
}

interface RowProps {
  name: string;
  args?: Record<string, unknown>;
  result?: ToolCallResult;
  progress?: AgentProgressReport | null;
}

/** What the row shows when it is opened: everything the model was handed that the one line could not fit. */
const payloadOf = ({ result, changes, error }: ToolCallResult) => ({
  ...(result !== undefined ? { result } : {}),
  ...(changes?.length ? { changes } : {}),
  ...(error ? { error } : {}),
});

/**
 * The arguments ride along because two calls of one tool are the same row otherwise — two searches, one name.
 *
 * A settled row opens: the estimated token cost is on the line, and the value itself is one click below it. Both
 * are there because a tool result is the one part of a transcript neither the user nor the app author sees — it is
 * the app's own return value, sized for a screen and not for a model's window, and a conversation that fills up
 * after four messages is answered by *which* row cost a million tokens and nothing else.
 */
const Row = ({ name, args, result, progress }: RowProps) => {
  const { l } = usePage();
  const payload = result ? payloadOf(result) : null;
  const head = (
    <>
      {result ? (
        // A glyph is the whole status, so it carries the word a screen reader reads in its place.
        <span
          aria-label={l(result.error ? "base.agentToolFailed" : "base.agentToolDone")}
          className={cn("shrink-0 text-[10px]", result.error ? "text-destructive" : "text-success")}
          role="img"
        >
          {result.error ? "✕" : "✓"}
        </span>
      ) : (
        <span
          aria-label={l("base.agentToolRunning")}
          className="size-1.5 shrink-0 animate-pulse rounded-full bg-warning"
          role="img"
        />
      )}
      <span className="shrink-0 font-mono text-xs">{name}</span>
      {progress ? (
        <span className="truncate text-[10px] text-foreground/60">
          {progress.message}
          {progress.total ? ` ${progress.done ?? 0}/${progress.total}` : ""}
        </span>
      ) : null}
      {!progress && args && Object.keys(args).length ? (
        <span className="truncate font-mono text-[10px] text-foreground/50">{JSON.stringify(args)}</span>
      ) : null}
      {result?.error ? <span className="truncate text-[10px] text-destructive">{result.error}</span> : null}
      <span className="ml-auto flex shrink-0 items-baseline gap-2 text-[10px] text-foreground/40">
        {result?.changes?.length ? <span>Δ {result.changes.length}</span> : null}
        {result ? <span>{l("base.agentTokens", { count: tokenCount(ToolOutput.tokensOf(result)) })}</span> : null}
      </span>
    </>
  );
  if (!payload || !Object.keys(payload).length)
    return <div className="flex items-baseline gap-2 rounded-field bg-muted px-2 py-1">{head}</div>;
  return (
    <details className="group rounded-field bg-muted">
      <summary
        aria-label={l("base.agentToolResult")}
        className="flex cursor-pointer items-baseline gap-2 px-2 py-1"
        title={l("base.agentToolResult")}
      >
        <span className="shrink-0 text-[8px] text-foreground/40 transition-transform group-open:rotate-90">▶</span>
        {head}
      </summary>
      <pre className="scrollbar-thin max-h-64 overflow-auto whitespace-pre-wrap break-all border-foreground/5 border-t px-2 py-1.5 font-mono text-[10px] text-foreground/70">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
};

interface AskProps {
  args?: Record<string, unknown>;
  result: ToolCallResult;
}

/**
 * A settled `askUser` reads as the exchange it was — the question, then what the user answered — instead of as a
 * tool row. An unsettled one renders nothing here: the question card below the transcript is holding it, and the
 * text would otherwise sit on screen twice.
 */
const Ask = ({ args, result }: AskProps) => {
  const answered = (Array.isArray(result.result) ? result.result : [result.result])
    .filter((one): one is string => typeof one === "string" && !!one)
    .join(", ");
  return (
    <div className="flex flex-col gap-1">
      <p className="rounded-box border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
        {typeof args?.question === "string" ? args.question : ""}
      </p>
      {answered ? (
        <span className="max-w-[85%] self-end rounded-box bg-primary/10 px-3 py-1 text-sm">{answered}</span>
      ) : null}
      {!answered && result.error ? (
        <span className="self-end text-[10px] text-foreground/50">{result.error}</span>
      ) : null}
    </div>
  );
};

const Content = ({ className, message, progress, results }: BubbleProps) => {
  const { l } = usePage();
  // Collapsed through `details` rather than state: both halves stay rendered, and what compaction replaced is
  // there to read without being the loudest thing in the transcript.
  if (message.summary)
    return (
      <details className={cn("rounded-box border border-border bg-muted/60 px-3 py-2", className)}>
        <summary className="cursor-pointer text-foreground/50 text-xs">{l("base.agentSummary")}</summary>
        <p className="mt-2 whitespace-pre-wrap text-foreground/70 text-xs">{message.text}</p>
      </details>
    );
  if (message.role === "tool")
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {(message.toolResults ?? []).map((result) => (
          <Row key={result.id} name={result.name} result={result} />
        ))}
      </div>
    );
  if (message.role === "user")
    return (
      <div className={cn("flex max-w-[85%] flex-col items-end gap-1 self-end", className)}>
        {message.attachments?.length ? <Chips attachments={message.attachments} className="justify-end" /> : null}
        {message.text ? (
          <p className="whitespace-pre-wrap rounded-box bg-primary/10 px-3 py-2 text-sm">{message.text}</p>
        ) : null}
      </div>
    );
  const isDrafting = !message.text && !message.toolCalls?.length && !message.error;
  return (
    <div className={cn("flex max-w-[85%] flex-col gap-1 self-start", className)}>
      {message.text ? <Markdown className="text-sm">{message.text}</Markdown> : null}
      {(message.toolCalls ?? []).flatMap((call) => {
        const result = results?.get(call.id);
        if (call.name !== AgentSession.askUserTool.name)
          return [
            <Row
              key={call.id}
              args={call.args}
              name={call.name}
              progress={!result && progress?.callId === call.id ? progress : null}
              result={result}
            />,
          ];
        return result ? [<Ask key={call.id} args={call.args} result={result} />] : [];
      })}
      {message.error ? <p className="text-destructive text-xs">{message.error}</p> : null}
      {isDrafting ? <span className="size-2 animate-pulse rounded-full bg-foreground/30" /> : null}
    </div>
  );
};

/**
 * Memoized because the transcript re-renders on every streamed delta and on every keystroke in the composer, and
 * a settled bubble re-parses its markdown for nothing each time. The props are compared by identity, so the caller
 * hands the same `results` map and `progress` value to every row — which is why only the rows that actually
 * changed re-render.
 *
 * A component bound to the `AgentBubble` slot replaces the memoized default, so it carries its own `memo`.
 */
export const DefaultBubble = memo(Content);

export default createOverridable("AgentBubble", DefaultBubble);
