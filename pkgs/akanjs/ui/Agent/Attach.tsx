"use client";
import { cn } from "akanjs/client";
import { useRef } from "react";
import { AiOutlineClose, AiOutlinePaperClip } from "react-icons/ai";
import type { MessageAttachment } from "use-agentic";

interface AttachProps {
  className?: string;
  label: string;
  onPick: (files: File[]) => void;
}

export const Attach = ({ className, label, onPick }: AttachProps) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        aria-label={label}
        className={cn("shrink-0 text-foreground/50 hover:text-foreground", className)}
        onClick={() => ref.current?.click()}
        title={label}
        type="button"
      >
        <AiOutlinePaperClip />
      </button>
      <input
        className="hidden"
        multiple
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          // Cleared so picking the same file twice in a row fires a second change event.
          event.target.value = "";
        }}
        ref={ref}
        type="file"
      />
    </>
  );
};

interface ChipsProps {
  className?: string;
  attachments: readonly MessageAttachment[];
  /** Omitted for a sent message: what is already on the wire cannot be taken back. */
  onRemove?: (index: number) => void;
  removeLabel?: string;
}

export const Chips = ({ className, attachments, onRemove, removeLabel }: ChipsProps) => (
  <div className={cn("flex flex-wrap gap-1", className)}>
    {attachments.map((attachment, idx) => (
      <span
        className="flex items-center gap-1 rounded-field bg-muted px-2 py-0.5 text-xs"
        key={`${attachment.name}-${idx}`}
      >
        {attachment.data && attachment.mimeType.startsWith("image/") ? (
          <img
            alt={attachment.name}
            className="size-6 rounded-field object-cover"
            src={`data:${attachment.mimeType};base64,${attachment.data}`}
          />
        ) : null}
        <span className="max-w-32 truncate">{attachment.name}</span>
        {onRemove ? (
          <button
            aria-label={removeLabel}
            className="text-foreground/40 hover:text-foreground"
            onClick={() => onRemove(idx)}
            type="button"
          >
            <AiOutlineClose />
          </button>
        ) : null}
      </span>
    ))}
  </div>
);
