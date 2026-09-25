import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { docUi } from "./style";

interface ToolbarProps {
  className?: string;
  children: ReactNode;
}

export const Toolbar = ({ className, children }: ToolbarProps) => (
  <div className={cn(docUi.card, "flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3", className)}>{children}</div>
);

interface ToolbarFieldProps {
  className?: string;
  label: string;
  children: ReactNode;
}

export const ToolbarField = ({ className, label, children }: ToolbarFieldProps) => (
  <div className={cn("flex min-w-0 items-center gap-2", className)}>
    <span className={docUi.sectionLabel}>{label}</span>
    {children}
  </div>
);

interface SectionProps {
  className?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Titled band with a rule running to the edge, so a long document reads as sections rather than as one list. */
export const Section = ({ className, title, action, children }: SectionProps) => (
  <section className={cn("flex flex-col gap-3", className)}>
    <div className="flex items-center gap-3">
      <h2 className={docUi.sectionTitle}>{title}</h2>
      <div className="h-px flex-1 bg-border" />
      {action}
    </div>
    {children}
  </section>
);
