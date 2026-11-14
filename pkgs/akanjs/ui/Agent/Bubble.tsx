"use client";
import { cn, usePage } from "akanjs/client";
import { memo } from "react";
import { type AgentProgressReport, AgentSession, type ChatMessage, type ToolCallResult } from "use-agentic";
import { createOverridable } from "../UiOverride";
import { Chips } from "./Attach";
import Markdown from "./Markdown";
import { ReferenceChips } from "./Refer";
import ToolRow from "./ToolRow";

export interface BubbleProps {
  className?: string;
  message: ChatMessage;
  /** What the running call last reported about itself. */
  progress?: (AgentProgressReport & { callId: string }) | null;
  /** Results by call id across the transcript, so a call's own row resolves in place. */
  results?: ReadonlyMap<string, ToolCallResult>;
}

interface AskProps {
  args?: Record<string, unknown>;
  result: ToolCallResult;
}

// Settled only: an unsettled ask is already on screen as the question card below the transcript.
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
          <ToolRow key={result.id} name={result.name} result={result} />
        ))}
      </div>
    );
  if (message.role === "user")
    return (
      <div className={cn("flex max-w-[85%] flex-col items-end gap-1 self-end", className)}>
        {message.attachments?.length ? <Chips attachments={message.attachments} className="justify-end" /> : null}
        {message.references?.length ? <ReferenceChips className="justify-end" references={message.references} /> : null}
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
            <ToolRow
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

/** Memoized on prop identity; a component bound to the `AgentBubble` slot replaces it and carries its own `memo`. */
export const DefaultBubble = memo(Content);

export default createOverridable("AgentBubble", DefaultBubble);
