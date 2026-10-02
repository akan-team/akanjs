import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { KoyoOrder } from "./KoyoOrder";
import { KoyoScript } from "./koyoScript.util";
import { Phone } from "./Phone";
import { AgentPointer, HumanPointer } from "./Pointer";

interface DuetStageProps {
  className?: string;
}
export const DuetStage = ({ className }: DuetStageProps) => {
  const { l } = usePage();
  const { css, still } = KoyoScript.loop();
  const beats = [
    {
      className: "opacity-[var(--duet-b1)]",
      label: l.trans({ en: "Agent fills the form", ko: "에이전트가 폼을 채우고" }),
    },
    { className: "opacity-[var(--duet-b2)]", label: l.trans({ en: "Person approves", ko: "사람이 승인하면" }) },
    {
      className: "opacity-[var(--duet-b3)]",
      label: l.trans({ en: "AI serves it via MCP", ko: "AI가 MCP로 서빙합니다" }),
    },
  ];
  return (
    <div
      className={cn("duet-run-loop relative flex flex-col items-center gap-7 xl:flex-row xl:items-start", className)}
      style={still}
    >
      <style>{css}</style>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-[8%] -bottom-5 -z-10 h-10 rounded-full bg-black/20 blur-xl dark:bg-black/60" />
        <Phone>
          <KoyoOrder>
            <AgentPointer />
            <HumanPointer />
          </KoyoOrder>
        </Phone>
      </div>
      <div className="flex flex-col items-center gap-7 xl:w-56 xl:items-start xl:pt-[2.15rem]">
        <div className="jelly-glass relative w-64 translate-y-[calc((1_-_var(--duet-mcp))*0.75rem)] rounded-2xl px-3.5 py-3 font-mono text-[0.6875rem] opacity-[var(--duet-mcp)] xl:w-full">
          <span className="absolute top-[1.25rem] right-full hidden w-[3.15rem] border-primary/70 border-t border-dashed opacity-[var(--duet-call)] xl:block" />
          <p className="flex items-center gap-2 text-foreground/70">
            <span className="size-1.5 rounded-full bg-primary" />
            Claude Code
            <span className="ml-auto text-foreground/35">MCP</span>
          </p>
          <p className="mt-1 truncate text-foreground/40">→ koyo.example/mcp</p>
          <p className="mt-2 flex items-center gap-1.5 opacity-[var(--duet-call)]">
            <span className="text-primary">›</span>
            serveIcecreamOrder("1043")
            <span className="ml-auto text-success opacity-[var(--duet-served)]">✓</span>
          </p>
        </div>
        <ol className="flex max-w-md flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] xl:flex-col xl:items-start xl:gap-y-3">
          {beats.map(({ className: beatClassName, label }, idx) => (
            <li key={label} className={cn("flex items-center gap-2", beatClassName)}>
              <span className="text-primary">0{idx + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
