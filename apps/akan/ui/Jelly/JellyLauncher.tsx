"use client";
import { cn } from "akanjs/client";
import type { LauncherProps } from "akanjs/ui";
import { JellyStar } from "./JellyStar";

export const JellyLauncher = ({ className, label, hotkey, unread, onOpen, buttonRef }: LauncherProps) => {
  return (
    <button
      aria-expanded={false}
      aria-haspopup="dialog"
      aria-keyshortcuts={hotkey?.keys}
      aria-label={unread ? `${label} (${unread})` : label}
      className={cn("group/agent relative flex size-16 cursor-pointer items-center justify-center", className)}
      data-agent-ui=""
      onClick={onOpen}
      ref={buttonRef}
      type="button"
    >
      {hotkey ? (
        <kbd className="pointer-events-none absolute right-full mr-2 hidden rounded-full bg-card px-2.5 py-1 font-mono text-foreground/55 text-xs opacity-0 shadow-sm group-hover/agent:opacity-100 group-focus-visible/agent:opacity-100 md:block">
          {hotkey.label}
        </kbd>
      ) : null}
      <span className="block size-full transition-transform duration-700 ease-jelly group-hover/agent:scale-110 group-active/agent:scale-90 group-active/agent:duration-100">
        <span className="jelly-breathe group-hover/agent:jelly-wobble block size-full">
          <JellyStar />
        </span>
      </span>
      {unread ? (
        <span
          aria-hidden="true"
          className="jelly tint-accent absolute top-0 right-0 flex size-5 items-center justify-center rounded-full font-bold text-[10px] text-accent-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  );
};
