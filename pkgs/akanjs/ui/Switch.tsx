"use client";
import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "akanjs/client";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  /** 켜짐 상태 색. daisyui `toggle-accent/toggle-primary` 대체. */
  variant?: "primary" | "accent" | "success";
}

const onClass = {
  primary: "data-[state=checked]:bg-primary",
  accent: "data-[state=checked]:bg-accent",
  success: "data-[state=checked]:bg-success",
};

/** Radix 기반 스위치. daisyui `toggle`/`swap` 대체. */
export const Switch = ({
  checked,
  defaultChecked,
  disabled,
  onChange,
  className,
  variant = "primary",
}: SwitchProps) => (
  <RadixSwitch.Root
    checked={checked}
    defaultChecked={defaultChecked}
    disabled={disabled}
    onCheckedChange={onChange}
    className={cn(
      "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      onClass[variant],
      className,
    )}
  >
    <RadixSwitch.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-[22px]" />
  </RadixSwitch.Root>
);
