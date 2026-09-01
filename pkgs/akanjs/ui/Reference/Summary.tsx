import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { docUi } from "./style";

interface SummaryCardProps {
  className?: string;
  label: string;
  value: number | string;
}

export const SummaryCard = ({ className, label, value }: SummaryCardProps) => (
  <div className={cn(docUi.card, "px-4 py-3", className)}>
    <div className={docUi.sectionLabel}>{label}</div>
    <div className="font-bold text-2xl">{value}</div>
  </div>
);

interface SummaryGridProps {
  className?: string;
  children: ReactNode;
}

export const SummaryGrid = ({ className, children }: SummaryGridProps) => (
  <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-4", className)}>{children}</div>
);
