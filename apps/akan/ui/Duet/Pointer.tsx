import { cn } from "akanjs/client";

interface ArrowProps {
  className?: string;
}
export const AgentArrow = ({ className }: ArrowProps) => {
  return (
    <i
      aria-hidden="true"
      className={cn(
        "block h-5 w-3.5 bg-primary drop-shadow-md [clip-path:polygon(0_0,0_72%,24%_55%,40%_92%,58%_84%,42%_48%,70%_46%)]",
        className,
      )}
    />
  );
};

export const HumanArrow = ({ className }: ArrowProps) => {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 24"
      strokeWidth={1.4}
      strokeLinejoin="round"
      className={cn("h-6 w-4 fill-foreground stroke-background drop-shadow-md", className)}
    >
      <path d="M1.5 1.5v17.2l4.3-4.1 3 6.6 2.7-1.2-3-6.5h6z" />
    </svg>
  );
};

interface PointerProps {
  className?: string;
}
export const AgentPointer = ({ className }: PointerProps) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-30 translate-x-[calc(var(--duet-ax)*1rem)] translate-y-[calc(var(--duet-ay)*1rem)] opacity-[var(--duet-a-on)]",
        className,
      )}
    >
      <AgentArrow className="absolute top-0 left-0 opacity-[calc(1_-_var(--duet-a-think))]" />
      <b className="absolute -top-4 -left-4 size-8 scale-[calc(0.2_+_0.8*var(--duet-a-tap))] rounded-full border-2 border-primary opacity-[calc(min(1,var(--duet-a-tap)*20)*(1_-_var(--duet-a-tap))*0.9)]" />
      <b className="absolute -top-[0.5625rem] -left-[0.5625rem] size-[1.125rem] animate-spin rounded-full border-2 border-primary/25 border-t-primary opacity-[var(--duet-a-think)]" />
    </span>
  );
};

export const HumanPointer = ({ className }: PointerProps) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-30 translate-x-[calc(var(--duet-hx)*1rem)] translate-y-[calc(var(--duet-hy)*1rem)] opacity-[var(--duet-h-on)]",
        className,
      )}
    >
      <HumanArrow className="absolute -top-px -left-px origin-top-left scale-[calc(1_-_0.18*var(--duet-h-press))]" />
    </span>
  );
};
