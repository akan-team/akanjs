import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { Friend } from "../Jelly";
import { CodeText } from "./CodeText";

interface AlertProps {
  children: ReactNode;
  type?: "info" | "warning" | "error" | "success";
  className?: string;
  bodyClassName?: string;
}

const alertStyles = {
  info: { tint: "tint-info", friend: "planet" },
  warning: { tint: "tint-warning", friend: "moon" },
  error: { tint: "tint-destructive", friend: "comet" },
  success: { tint: "tint-success", friend: "rocket" },
} as const;

export const Alert = ({ children, type = "info", className, bodyClassName }: AlertProps) => {
  const { tint, friend } = alertStyles[type];
  return (
    <div
      role="alert"
      className={cn("jelly-callout my-5 flex items-start gap-3 rounded-2xl py-3.5 pr-4 pl-3", tint, className)}
    >
      <Friend name={friend} className="-my-1 size-9 shrink-0" interactive={false} still />
      <div className={cn("min-w-0 flex-1 pt-px text-foreground leading-relaxed", bodyClassName)}>
        <CodeText>{children}</CodeText>
      </div>
    </div>
  );
};
