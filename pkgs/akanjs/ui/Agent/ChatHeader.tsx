"use client";
import { usePage } from "akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineClear, AiOutlineClose } from "react-icons/ai";
import { tokenCount } from "./tokenCount";

export interface ChatHeaderProps {
  title?: ReactNode;
  running: boolean;
  context: { used: number; compactAt?: number };
  controls?: ReactNode;
  onClear?: () => void;
  onClose?: () => void;
}

// The `data-slot` names are a contract: an app restyles a part through them, never through the markup's shape.
export const ChatHeader = ({ title, running, context, controls, onClear, onClose }: ChatHeaderProps) => {
  const { l } = usePage();
  return (
    <header className="flex items-center gap-2 border-border border-b px-4 py-3" data-slot="agent-header">
      <span className="font-semibold text-sm" data-slot="agent-title">
        {title ?? l("base.agent")}
      </span>
      {running ? <span className="size-2 animate-pulse rounded-full bg-primary" data-slot="agent-running" /> : null}
      {context.used ? (
        <span
          className="shrink-0 whitespace-nowrap text-[10px] text-foreground/40"
          title={context.compactAt ? l("base.agentCompactsAt", { limit: tokenCount(context.compactAt) }) : undefined}
        >
          {context.compactAt
            ? l("base.agentTokensOf", { count: tokenCount(context.used), limit: tokenCount(context.compactAt) })
            : l("base.agentTokens", { count: tokenCount(context.used) })}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        {controls}
        {onClear ? (
          <button
            aria-label={l("base.agentClear")}
            className="text-foreground/50 hover:text-foreground"
            onClick={onClear}
            type="button"
          >
            <AiOutlineClear />
          </button>
        ) : null}
        {onClose ? (
          <button
            aria-label={l("base.cancel")}
            className="text-foreground/50 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <AiOutlineClose />
          </button>
        ) : null}
      </span>
    </header>
  );
};
