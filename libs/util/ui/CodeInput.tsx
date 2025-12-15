"use client";
import { clsx } from "@akanjs/client";
import { useEffect, useRef } from "react";

interface CodeInputProps {
  unitStyle?: "box" | "underline";
  className?: string;
  unitClassName?: string;
  maxNum: number;
  value: string;
  autoComplete?: boolean;
  onChange: (value: string) => void;
  onComplete?: () => void;
}
export const CodeInput = ({
  className,
  unitStyle = "box",
  unitClassName,
  maxNum,
  value,
  autoComplete = true,
  onChange,
  onComplete,
}: CodeInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultUnitClassName =
    unitStyle === "box" ? "border border-gray-300 rounded-sm items-center" : "border-b border-gray-300 items-end pb-2";
  const Box = ({ indexNum, children }) => {
    return (
      <div
        className={clsx(
          "flex h-16 w-full justify-center  text-2xl duration-150",
          defaultUnitClassName,
          unitClassName,
          indexNum === value.length ? "border-primary" : "border-gray-300"
        )}
      >
        {children}
      </div>
    );
  };
  useEffect(() => {
    if (!inputRef.current || !autoComplete) return;
    if (value.length === maxNum) {
      inputRef.current.blur();
      onComplete?.();
    }
  }, [value]);

  return (
    <div className={clsx("relative   flex items-center  justify-center gap-2", className)}>
      {Array(maxNum)
        .fill("")
        .map((_, i) => {
          return (
            <Box key={i} indexNum={i}>
              {value[i]}
            </Box>
          );
        })}

      <input
        type="tel"
        autoFocus
        ref={inputRef}
        value={value}
        maxLength={maxNum}
        max={maxNum}
        onChange={(e) => {
          if (e.target.value.length > maxNum) return;
          onChange(e.target.value);
        }}
        className={`absolute size-full border-none text-transparent caret-transparent  outline-hidden focus:outline-hidden`}
      />
    </div>
  );
};
