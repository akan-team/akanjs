"use client";
import { cn, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { ReactNode } from "react";
import { BiHelpCircle } from "react-icons/bi";
import { Tooltip } from "../Tooltip";

export interface LabelProps {
  className?: string;
  label: ReactNode;
  desc?: ReactNode;
  unit?: ReactNode;
  nullable?: boolean;
  mode?: "view" | "edit";
}
export const Label = ({ className, label, desc, unit, nullable, mode = "edit" }: LabelProps) => {
  const { l } = usePage();
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {typeof label === "string" ? capitalize(label) : label}
      {unit ? <span className="animate-fadeIn"> ({unit})</span> : null}
      {desc ? (
        <Tooltip content={desc} variant="info" side="right">
          <span>
            <BiHelpCircle />
          </span>
        </Tooltip>
      ) : null}
      {nullable ? (
        <span className="text-muted-foreground text-sm">{l.trans({ en: "(optional)", ko: "(선택)" })}</span>
      ) : null}
    </span>
  );
};
