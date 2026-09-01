import { cn } from "akanjs/client";
import type { ReactNode, RefObject } from "react";
import { AiOutlineCopy } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { Copy } from "../Copy";
import { docBorder, docDash, docUi } from "./style";

interface PanelProps {
  className?: string;
  bodyClassName?: string;
  label?: string;
  meta?: ReactNode;
  tone?: Parameters<typeof docBorder>[0];
  /** Rendered outside the scrolling body so it can cover the whole panel. */
  overlay?: ReactNode;
  children: ReactNode;
}

export const Panel = ({ className, bodyClassName, label, meta, tone = "muted", overlay, children }: PanelProps) => (
  <div
    className={cn(
      "relative flex min-w-0 flex-col overflow-hidden border transition-colors",
      docUi.panel,
      docBorder(tone),
      className,
    )}
  >
    {label || meta ? (
      <div className="flex items-center gap-2 border-border/70 border-b bg-muted/40 px-3 py-1.5">
        <span className={docUi.sectionLabel}>{label}</span>
        <div className="ml-auto flex items-center gap-1.5">{meta}</div>
      </div>
    ) : null}
    <div className={cn("scrollbar-thin max-h-96 overflow-auto p-3", bodyClassName)}>{children}</div>
    {overlay}
  </div>
);

interface CodeProps {
  className?: string;
  label?: string;
  code: string;
  tone?: PanelProps["tone"];
  meta?: ReactNode;
  placeholder?: string;
  bodyRef?: RefObject<HTMLPreElement | null>;
  overlay?: ReactNode;
}

/**
 * Read-only code surface. A `<pre>` rather than a `<textarea>`: every one of these panels ignored what was typed
 * into it, so the caret and the resize grip were promising an edit that never landed anywhere.
 */
export const Code = ({ className, label, code, tone, meta, placeholder = "—", bodyRef, overlay }: CodeProps) => (
  <Panel
    bodyClassName="max-h-none overflow-visible p-0"
    className={className}
    label={label}
    meta={
      <>
        {meta}
        <Copy text={code}>
          <button className={buttonRecipe({ variant: "ghost", size: "xs" }, "text-foreground/50")} type="button">
            <AiOutlineCopy />
          </button>
        </Copy>
      </>
    }
    overlay={overlay}
    tone={tone}
  >
    <pre
      className="scrollbar-thin max-h-96 min-h-16 overflow-auto p-3 font-mono text-foreground/85 text-xs leading-relaxed"
      ref={bodyRef}
    >
      {code || <span className={docDash}>{placeholder}</span>}
    </pre>
  </Panel>
);
