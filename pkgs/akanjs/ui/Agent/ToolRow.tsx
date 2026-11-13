"use client";
import { cn, usePage } from "akanjs/client";
import { type AgentProgressReport, type AgentProgressStep, type ToolCallResult, ToolOutput } from "use-agentic";
import { createOverridable } from "../UiOverride";
import { tokenCount } from "./tokenCount";

export interface ToolRowProps {
  className?: string;
  name: string;
  args?: Record<string, unknown>;
  /** Absent while the call runs. */
  result?: ToolCallResult;
  /** What the running call last reported about itself; never set once it has a result. */
  progress?: AgentProgressReport | null;
}

const payloadOf = ({ result, changes, error }: ToolCallResult) => ({
  ...(result !== undefined ? { result } : {}),
  ...(changes?.length ? { changes } : {}),
  ...(error ? { error } : {}),
});

const stepGlyph = { pending: "○", running: "●", done: "✓", error: "✕" } as const;
const stepTone = {
  pending: "text-foreground/40",
  running: "animate-pulse text-warning",
  done: "text-success",
  error: "text-destructive",
} as const;

interface StepListProps {
  steps: AgentProgressStep[];
}
const StepList = ({ steps }: StepListProps) => {
  const settled = steps.filter((step) => step.status === "done" || step.status === "error").length;
  return (
    <details className="px-2 pb-1">
      <summary className="cursor-pointer font-mono text-[10px] text-foreground/50">
        {settled}/{steps.length}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {steps.map((step) => (
          <li className="flex items-baseline gap-2 text-[10px]" key={step.id}>
            <span className={cn("shrink-0", stepTone[step.status])}>{stepGlyph[step.status]}</span>
            <span className="truncate">{step.label}</span>
            {step.detail ? <span className="truncate text-foreground/50">{step.detail}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
};

export const DefaultToolRow = ({ className, name, args, result, progress }: ToolRowProps) => {
  const { l } = usePage();
  const payload = result ? payloadOf(result) : null;
  const head = (
    <>
      {result ? (
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
  if (progress?.steps?.length)
    return (
      <div className={cn("rounded-field bg-muted", className)}>
        <div className="flex items-baseline gap-2 px-2 py-1">{head}</div>
        <StepList steps={progress.steps} />
      </div>
    );
  if (!payload || !Object.keys(payload).length)
    return <div className={cn("flex items-baseline gap-2 rounded-field bg-muted px-2 py-1", className)}>{head}</div>;
  return (
    <details className={cn("group rounded-field bg-muted", className)}>
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

export default createOverridable("AgentToolRow", DefaultToolRow);
