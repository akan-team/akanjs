"use client";
import { cn, usePage } from "akanjs/client";
import { type KeyboardEvent, type RefObject, useEffect } from "react";
import type { AgentSession, MessageAttachment } from "use-agentic";
import { Button } from "../Button";
import { inputRecipe } from "../recipe";
import { createOverridable, useUiRecipe } from "../UiOverride";
import { Attach, Chips } from "./Attach";
import { Mic } from "./Mic";

export interface ComposerProps {
  className?: string;
  session: AgentSession;
  draft: string;
  attached: readonly MessageAttachment[];
  /** Absent when the screen cannot listen — the same rule as publishing no tool for a control that is not drawn. */
  mic?: { listening: boolean; onToggle: () => void };
  onDraft: (text: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFiles: (files: File[]) => void;
  onRemoveFile: (idx: number) => void;
  onSend: () => void;
  onStop: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

/** Where the box stops growing and starts scrolling: a chat composer is a paragraph at most. */
const maxComposerHeight = 128;

/** What the user writes with: the staged files above, and the controls that send or stop below them. */
export const DefaultComposer = ({
  className,
  session,
  draft,
  attached,
  mic,
  onDraft,
  onKeyDown,
  onFiles,
  onRemoveFile,
  onSend,
  onStop,
  inputRef,
}: ComposerProps) => {
  const { l } = usePage();
  const surface = useUiRecipe("input") ?? inputRecipe;
  useEffect(() => {
    const area = inputRef?.current;
    if (!area) return;
    // Measured from a collapsed box: `scrollHeight` reports the content plus whatever height the box already has,
    // so without the reset the composer only ever grows.
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, maxComposerHeight)}px`;
  }, [draft, inputRef]);
  return (
    <div className={cn("flex flex-col gap-2 border-foreground/5 border-t p-3", className)}>
      {attached.length ? (
        <Chips attachments={attached} onRemove={onRemoveFile} removeLabel={l("base.agentAttachRemove")} />
      ) : null}
      <div className="flex items-end gap-2">
        {mic ? (
          <Mic className="pb-2" label={l("base.agentListen")} listening={mic.listening} onToggle={mic.onToggle} />
        ) : null}
        <Attach className="pb-2" label={l("base.agentAttach")} onPick={onFiles} />
        <textarea
          className={surface({ kind: "area", size: "sm" }, "max-h-32 flex-1 resize-none py-1.5")}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const pasted = [...event.clipboardData.files];
            if (!pasted.length) return;
            event.preventDefault();
            onFiles(pasted);
          }}
          placeholder={session.pendingQuestion ? l("base.agentAnswer") : l("base.agentPlaceholder")}
          ref={inputRef}
          rows={1}
          value={draft}
        />
        {/* A parked question is not a turn to stop: the loop is waiting on the card, and the card has its own out. */}
        {session.isRunning && !session.pendingQuestion ? (
          <Button onClick={onStop} size="sm" variant="outline">
            {l("base.stop")}
          </Button>
        ) : (
          <Button disabled={!draft.trim() && !attached.length} onClick={onSend} size="sm">
            {l("base.send")}
          </Button>
        )}
      </div>
    </div>
  );
};

export const Composer = createOverridable("AgentComposer", DefaultComposer);
