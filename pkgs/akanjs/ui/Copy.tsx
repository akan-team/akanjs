"use client";
import { ShellState, usePage } from "akanjs/client";
import { cloneElement, isValidElement, type MouseEvent, type ReactElement, type ReactNode } from "react";

export interface CopyProps {
  /** Defaults to an empty string. */
  text?: string;
  /** Defaults to a localized "Copied". */
  copyMessage?: string;
  children: ReactNode;
}

const writeClipboardText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

export const Copy = ({ text, copyMessage, children }: CopyProps) => {
  const { l } = usePage();
  const handleCopy = async () => {
    await writeClipboardText(text ?? "");
    ShellState.showMessage({
      content: copyMessage ?? l.trans({ en: "Copied", ko: "복사되었습니다" }),
      type: "success",
    });
  };

  if (isValidElement<{ onClick?: (event: MouseEvent) => void | Promise<void> }>(children)) {
    const child = children as ReactElement<{ onClick?: (event: MouseEvent) => void | Promise<void> }>;
    return cloneElement(child, {
      onClick: async (event: MouseEvent) => {
        await child.props.onClick?.(event);
        await handleCopy();
      },
    });
  }

  return (
    <span
      onClick={() => {
        void handleCopy();
      }}
    >
      {children}
    </span>
  );
};
