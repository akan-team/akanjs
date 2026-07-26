"use client";
import { cn } from "akanjs/client";
import { useState } from "react";

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

/**
 * 순수 Tailwind 스위치 (`<button role="switch">`). daisyui `toggle`/`swap` 대체.
 * `<button>` 이라 포커스·Space/Enter 토글이 네이티브로 제공된다. controlled/uncontrolled 모두 지원.
 */
export const Switch = ({
  checked,
  defaultChecked,
  disabled,
  onChange,
  className,
  variant = "primary",
}: SwitchProps) => {
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internal;
  const state = isChecked ? "checked" : "unchecked";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      disabled={disabled}
      data-state={state}
      onClick={() => {
        if (disabled) return;
        const next = !isChecked;
        if (!isControlled) setInternal(next);
        onChange?.(next);
      }}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        onClass[variant],
        className,
      )}
    >
      <span
        data-state={state}
        className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-[22px]"
      />
    </button>
  );
};
