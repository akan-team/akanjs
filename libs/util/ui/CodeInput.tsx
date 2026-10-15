"use client";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useRef } from "react";

interface CodeBoxProps {
  className?: string;
  isActive: boolean;
  children: ReactNode;
}
const CodeBox = ({ className, isActive, children }: CodeBoxProps) => {
  return (
    <div
      className={cn(
        "flex h-16 w-full justify-center text-2xl duration-150",
        className,
        isActive ? "border-primary" : "border-border",
      )}
    >
      {children}
    </div>
  );
};

interface CodeInputProps {
  className?: string;
  unitStyle?: "box" | "underline";
  unitClassName?: string;
  maxNum: number;
  value: string;
  submitOnComplete?: boolean;
  onChange: (value: string) => void;
  onComplete?: () => void;
}
export const CodeInput = ({
  className,
  unitStyle = "box",
  unitClassName,
  maxNum,
  value,
  submitOnComplete = true,
  onChange,
  onComplete,
}: CodeInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultUnitClassName =
    unitStyle === "box" ? "border border-border rounded-sm items-center" : "border-b border-border items-end pb-2";
  useEffect(() => {
    if (!inputRef.current || !submitOnComplete) return;
    if (value.length === maxNum) {
      inputRef.current.blur();
      onComplete?.();
    }
  }, [value]);

  return (
    <div className={cn("relative flex items-center justify-center gap-2", className)}>
      {Array(maxNum)
        .fill("")
        .map((_, i) => {
          return (
            <CodeBox key={i} className={cn(defaultUnitClassName, unitClassName)} isActive={i === value.length}>
              {value[i]}
            </CodeBox>
          );
        })}

      <input
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        ref={inputRef}
        value={value}
        maxLength={maxNum}
        onChange={(e) => {
          if (e.target.value.length > maxNum) return;
          onChange(e.target.value);
        }}
        className="absolute size-full border-none text-transparent caret-transparent outline-hidden focus:outline-hidden"
      />
    </div>
  );
};
