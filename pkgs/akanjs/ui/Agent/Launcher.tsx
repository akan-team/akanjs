"use client";
import { cn } from "akanjs/client";
import type { Ref } from "react";
import { createOverridable } from "../UiOverride";

export interface LauncherProps {
  className?: string;
  label: string;
  /** The chord that opens the chat, shown on hover. Null until the platform is known, which needs the client. */
  hotkey?: { label: string; keys: string } | null;
  /** Messages that arrived while the panel was closed, so a finished turn is not silent. */
  unread: number;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export const DefaultLauncher = ({ className, label, hotkey, unread, onOpen, buttonRef }: LauncherProps) => (
  <button
    aria-expanded={false}
    aria-haspopup="dialog"
    aria-keyshortcuts={hotkey?.keys}
    aria-label={unread ? `${label} (${unread})` : label}
    data-agent-ui=""
    className={cn(
      "group/agent relative flex size-12 items-center justify-center rounded-full border border-primary/20 bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105",
      className,
    )}
    onClick={onOpen}
    ref={buttonRef}
    type="button"
  >
    {hotkey ? (
      <kbd className="pointer-events-none absolute right-full mr-3 hidden rounded-field border border-border bg-background px-2 py-0.5 font-mono text-foreground/50 text-xs opacity-0 shadow-sm group-hover/agent:opacity-100 group-focus-visible/agent:opacity-100 md:block">
        {hotkey.label}
      </kbd>
    ) : null}
    {unread ? (
      <span
        aria-hidden="true"
        className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-warning font-semibold text-[10px] text-warning-foreground"
      >
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null}
    <svg className="size-7" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M40 18 C43.6 43.6 54.4 54.4 80 58 C54.4 61.6 43.6 72.4 40 98
       C36.4 72.4 25.6 61.6 0 58 C25.6 54.4 36.4 43.6 40 18 Z"
      />
      <path
        fill="currentColor"
        d="M80 2 C81.8 14.8 87.2 20.2 100 22 C87.2 23.8 81.8 29.2 80 42
       C78.2 29.2 72.8 23.8 60 22 C72.8 20.2 78.2 14.8 80 2 Z"
      />
    </svg>
  </button>
);

export const Launcher = createOverridable("AgentLauncher", DefaultLauncher);
