"use client";
import { cn } from "akanjs/client";
import { StoreRegistry } from "akanjs/store";
import { type AgentBridge, AgentContext, ensureStoreSurface, type SerializedStoreState } from "akanjs/store/agent";
import { type ReactNode, useRef, useState } from "react";
import { type AgentCall, AgenticSurface, type PublishedTool, type SurfaceView } from "use-agentic";
import { buttonRecipe } from "../recipe";

// Exported so declaration emit can name it through the `Agent` namespace object in `index.ts`.
export interface DockProps {
  className?: string;
  /** Defaults to the app's own. */
  bridge?: AgentBridge;
  /** Defaults to the whole screen's; pass a zone's own to inspect it. */
  surface?: AgenticSurface;
  open?: boolean;
}

export const Dock = ({ className, bridge, surface, open = false }: DockProps) => {
  const held = useRef<{ bridge: AgentBridge; surface: AgenticSurface } | null>(null);
  held.current ??= { bridge: bridge ?? ensureStoreSurface().bridge, surface: surface ?? AgenticSurface.shared };
  const agent = held.current.bridge;
  const view = held.current.surface;
  const [ran, setRan] = useState(0);
  const liveKeys = StoreRegistry.instance.liveKeys;
  const { tools } = view.snapshot();
  const stateEntries = Object.entries(agent.state).sort(([a], [b]) => {
    const [liveA, liveB] = [liveKeys.has(a), liveKeys.has(b)];
    if (liveA !== liveB) return liveA ? -1 : 1;
    return a < b ? -1 : 1;
  });
  // Production visitors never see this: it lists every published tool and can run them by hand.
  if (process.env.AKAN_PUBLIC_ENV === "main") return null;
  return (
    <aside
      data-agent-ui=""
      className={cn(
        "scrollbar-thin fixed right-4 bottom-4 z-50 flex max-h-[70vh] w-80 flex-col gap-2 overflow-y-auto rounded-box border border-border bg-background/95 p-3 shadow-lg",
        className,
      )}
    >
      <h2 className="font-semibold text-sm">Agent</h2>
      <Section count={tools.length} open={open} title="Tools">
        {tools.map((tool) => (
          <Tool key={tool.name} onRun={() => setRan(ran + 1)} surface={view} tool={tool} />
        ))}
      </Section>
      <Section count={Object.keys(agent.state).length} title="State">
        {stateEntries.map(([name, entry]) => (
          <StateKey bridge={agent} entry={entry} key={name} live={liveKeys.has(name)} name={name} />
        ))}
      </Section>
      <Section count={liveKeys.size} title="Context">
        <Context />
      </Section>
      <Section count={agent.refusals.length} title="Withheld">
        {agent.refusals.map((refusal) => (
          <div className="flex flex-col" key={refusal.key}>
            <span className="truncate font-mono text-xs">{refusal.key}</span>
            <span className="text-[10px] text-foreground/50">{refusal.reason}</span>
          </div>
        ))}
      </Section>
      <Section count={view.transcript.length} open title="Transcript">
        <Transcript calls={view.transcript} />
      </Section>
    </aside>
  );
};

interface SectionProps {
  className?: string;
  title: string;
  count: number;
  children: ReactNode;
  open?: boolean;
}

export function Section({ className, title, count, children, open }: SectionProps) {
  return (
    <details className={cn("group rounded-box bg-muted", className)} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-foreground/50 text-xs">{count}</span>
        <span className="ml-auto text-foreground/40 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="flex flex-col gap-1 px-3 pb-3">{children}</div>
    </details>
  );
}

interface TranscriptProps {
  className?: string;
  calls: readonly AgentCall[];
}

export function Transcript({ className, calls }: TranscriptProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {calls.map((call, idx) => (
        <div className="flex flex-col rounded-field bg-background/60 px-2 py-1" key={idx}>
          <div className="flex items-baseline gap-2">
            <span className="truncate font-mono text-xs">{call.name}</span>
            <span className="ml-auto shrink-0 text-[10px] text-foreground/40">
              {call.at.toISOString().slice(11, 19)}
            </span>
          </div>
          <span className="truncate font-mono text-[10px] text-foreground/50">{JSON.stringify(call.args)}</span>
          {call.error ? <span className="text-[10px] text-destructive">{call.error}</span> : null}
        </div>
      ))}
    </div>
  );
}

interface ToolProps {
  className?: string;
  surface: SurfaceView;
  tool: PublishedTool;
  onRun: () => void;
}

export function Tool({ className, surface, tool, onRun }: ToolProps) {
  const [args, setArgs] = useState("{}");
  const [error, setError] = useState("");
  const properties = (tool.parameters as { properties?: unknown } | undefined)?.properties ?? {};
  const run = async () => {
    setError("");
    try {
      await surface.call(tool.name, JSON.parse(args) as Record<string, unknown>);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
    onRun();
  };
  return (
    <details className={cn("rounded-field bg-background/60 px-2 py-1", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="truncate font-mono text-xs">{tool.name}</span>
        {tool.needsConfirm ? <span className="shrink-0 text-[10px] text-foreground/40">confirm</span> : null}
      </summary>
      <div className="flex flex-col gap-2 py-2">
        {tool.description ? <p className="text-foreground/70 text-xs">{tool.description}</p> : null}
        <pre className="overflow-x-auto rounded-field bg-muted p-2 text-[10px] leading-tight">
          {JSON.stringify(properties, null, 2)}
        </pre>
        <textarea
          className="w-full rounded-field bg-muted p-2 font-mono text-xs"
          rows={2}
          value={args}
          onChange={(event) => setArgs(event.target.value)}
        />
        {/* `buttonRecipe`, not `Button`: this developer surface does not read the app runtime through `usePage()`. */}
        <button className={buttonRecipe({ size: "xs" })} onClick={run} type="button">
          Run
        </button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </details>
  );
}

interface StateKeyProps {
  className?: string;
  bridge: AgentBridge;
  name: string;
  entry: SerializedStoreState;
  live?: boolean;
}

// Masking happens on read, so a key holding an object no model claims refuses here, not in the catalogue.
export function StateKey({ className, bridge, name, entry, live }: StateKeyProps) {
  const [shown, setShown] = useState("");
  const read = () => {
    try {
      setShown(JSON.stringify(bridge.read(name), null, 2));
    } catch (thrown) {
      setShown(thrown instanceof Error ? thrown.message : String(thrown));
    }
  };
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <button className="flex items-center gap-2 text-left" type="button" onClick={read}>
        <span className="truncate font-mono text-xs">{name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-foreground/40">
          {live ? "live · " : ""}
          {entry.refName ? `${entry.refName}.${entry.modelType ?? ""}` : entry.type}
          {entry.derived ? " · derived" : ""}
        </span>
      </button>
      {shown ? (
        <pre className="scrollbar-thin max-h-40 overflow-auto rounded-field bg-muted p-2 text-[10px] leading-tight">
          {shown}
        </pre>
      ) : null}
    </div>
  );
}

interface ContextProps {
  className?: string;
}

export function Context({ className }: ContextProps) {
  const [shown, setShown] = useState("");
  // Production visitors never see the turn snapshot — tool names, guides, and the assembled context.
  if (process.env.AKAN_PUBLIC_ENV === "main") return null;
  const assemble = () => {
    try {
      const { guides, tools } = AgenticSurface.shared.snapshot();
      const context = AgentContext.of().blocks(AgenticSurface.shared);
      const assembled = {
        tools: tools.map((tool) => tool.name),
        ...(guides.length ? { guides } : {}),
        context,
      };
      setShown(JSON.stringify(assembled, null, 2));
    } catch (thrown) {
      setShown(thrown instanceof Error ? thrown.message : String(thrown));
    }
  };
  return (
    <div className={className}>
      <button className={buttonRecipe({ size: "xs" })} onClick={assemble} type="button">
        Assemble
      </button>
      {shown ? (
        <pre className="scrollbar-thin mt-2 max-h-60 overflow-auto rounded-field bg-background/60 p-2 text-[10px] leading-tight">
          {shown}
        </pre>
      ) : null}
    </div>
  );
}
