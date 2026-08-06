import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { BiCheckCircle, BiErrorCircle, BiInfoCircle, BiStopCircle } from "react-icons/bi";

interface AlertProps {
  children: ReactNode;
  type?: "info" | "warning" | "error" | "success";
  className?: string;
  bodyClassName?: string;
}

const alertStyles = {
  info: { surface: "border-info/30 bg-info/10", icon: "text-info", Icon: BiInfoCircle },
  warning: { surface: "border-warning/30 bg-warning/10", icon: "text-warning", Icon: BiStopCircle },
  error: { surface: "border-destructive/30 bg-destructive/10", icon: "text-destructive", Icon: BiErrorCircle },
  success: { surface: "border-success/30 bg-success/10", icon: "text-success", Icon: BiCheckCircle },
} as const;

export const Alert = ({ children, type = "info", className, bodyClassName }: AlertProps) => {
  const { surface, icon, Icon } = alertStyles[type];
  return (
    <div role="alert" className={cn("my-4 flex items-start gap-3 rounded-lg border p-4", surface, className)}>
      <Icon className={cn("mt-0.5 shrink-0 text-xl", icon)} />
      <div className={cn("min-w-0 flex-1 text-foreground leading-relaxed", bodyClassName)}>{children}</div>
    </div>
  );
};
