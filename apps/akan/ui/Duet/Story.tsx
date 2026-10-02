import { cn } from "akanjs/client";
import type { CSSProperties, ReactNode } from "react";

const storyClass = {
  screen: { track: "duet-track-screen", run: "duet-run-screen" },
  server: { track: "duet-track-server", run: "duet-run-server" },
} as const;

interface StoryProps {
  className?: string;
  id: string;
  timeline: keyof typeof storyClass;
  css: string;
  still: CSSProperties;
  header: ReactNode;
  steps: ReactNode[];
  stage: ReactNode;
}
export const Story = ({ className, id, timeline, css, still, header, steps, stage }: StoryProps) => {
  return (
    <section
      id={id}
      className={cn("relative scroll-mt-[var(--akanjs-header-offset)]", storyClass[timeline].track, className)}
    >
      <style>{css}</style>
      <div
        className={cn(
          "duet-frame mx-auto grid w-full max-w-7xl gap-x-16 gap-y-5 px-6 [align-content:safe_center] [grid-template-areas:'head'_'stage'_'steps'] lg:grid-cols-2 lg:gap-y-10 lg:px-8 lg:[grid-template-areas:'head_stage'_'steps_stage']",
          storyClass[timeline].run,
        )}
        style={still}
      >
        <div className="min-w-0 [grid-area:head] lg:self-end">{header}</div>
        <div className="flex min-w-0 justify-center [grid-area:stage] lg:items-center">{stage}</div>
        <ol className="duet-stack min-w-0 [grid-area:steps] lg:self-start">
          {steps.map((step, idx) => (
            <li key={idx} className="duet-caption min-w-0" style={{ "--n": idx + 1 } as CSSProperties}>
              <p className="font-mono text-primary text-xs tracking-[0.2em]">
                0{idx + 1}
                <span className="text-foreground/30"> / 0{steps.length}</span>
              </p>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
