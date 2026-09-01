"use client";
import { cn } from "akanjs/client";
import { type ReactElement, useEffect, useState } from "react";
import { FaCheck } from "react-icons/fa";
import { MdContentCopy } from "react-icons/md";

export interface ClipboardProps {
  text?: string;
  clipboardMessage?: string;
  className?: string;
}
export const Clipboard = ({ text, className }: ClipboardProps): ReactElement => {
  const [isCopied, setIsCopied] = useState(false);
  useEffect(() => {
    if (isCopied) {
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  }, [isCopied]);

  const handleCopy = async () => {
    if (!text) return;
    // 예시로 "복사할 텍스트"를 복사합니다
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
  };
  return (
    <button
      onClick={async () => {
        await handleCopy();
      }}
      className={cn(
        "flex size-6 items-center justify-center rounded-field bg-foreground/10 text-foreground transition-colors hover:bg-foreground/20",
        className,
      )}
    >
      <FaCheck
        className={cn("absolute size-4 transition-opacity duration-300", isCopied ? "opacity-100" : "opacity-0")}
      />
      <MdContentCopy
        className={cn("absolute size-4 transition-opacity duration-300", isCopied ? "opacity-0" : "opacity-100")}
      />
    </button>
  );
};
