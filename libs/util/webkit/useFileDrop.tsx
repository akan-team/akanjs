"use client";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { matchesAccept } from "../common/matchesAccept";

interface FileDropOptions {
  accept?: string;
  multiple?: boolean;
  limit?: number;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
  onReject?: () => void;
}

export const useFileDrop = ({ accept, multiple, limit, disabled, onFiles, onReject }: FileDropOptions) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const take = (files: FileList | null, { isDrop }: { isDrop: boolean }) => {
    if (disabled || !files?.length) return;
    const candidates = Array.from(files);
    //? The picker already honours `accept`; a drop does not, so only dropped files are filtered here.
    const accepted = isDrop ? candidates.filter((file) => matchesAccept(file, accept)) : candidates;
    if (accepted.length < candidates.length) onReject?.();
    const taken = accepted.slice(0, Math.min(multiple ? accepted.length : 1, limit ?? accepted.length));
    if (!taken.length) return;
    const transfer = new DataTransfer();
    for (const file of taken) transfer.items.add(file);
    onFiles(transfer.files);
  };
  const hold = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return {
    isDragging,
    inputRef,
    openPicker: () => {
      const input = inputRef.current;
      if (!input || disabled) return;
      //? Without clearing, picking the same file again fires no change event.
      input.value = "";
      input.click();
    },
    onInputChange: (event: ChangeEvent<HTMLInputElement>) => {
      take(event.currentTarget.files, { isDrop: false });
    },
    dropProps: {
      onDragEnter: (event: DragEvent) => {
        hold(event);
        if (!disabled) setIsDragging(true);
      },
      onDragOver: (event: DragEvent) => {
        hold(event);
        if (!disabled) setIsDragging(true);
      },
      onDragLeave: (event: DragEvent) => {
        hold(event);
        setIsDragging(false);
      },
      onDrop: (event: DragEvent) => {
        hold(event);
        setIsDragging(false);
        take(event.dataTransfer.files, { isDrop: true });
      },
    },
  };
};
