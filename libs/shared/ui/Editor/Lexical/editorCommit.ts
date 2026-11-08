"use client";
import type { cnst } from "@libs/shared/client";
import type { EditorContent } from "@libs/shared/common";
import type { EditorState } from "lexical";
import { useCallback, useEffect, useRef } from "react";

import { reconcileAttachments } from "./media";

const changeDebounceMs = 300;

interface EditorCommitOptions {
  onChange: (value: EditorContent) => void;
  attachments?: cnst.File[];
  onAttachmentsChange?: (files: cnst.File[]) => void;
}

export const useEditorCommit = ({ onChange, attachments, onAttachmentsChange }: EditorCommitOptions) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const attachmentsRef = useRef<cnst.File[]>(attachments ?? []);
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  useEffect(() => {
    attachmentsRef.current = attachments ?? [];
  }, [attachments]);
  useEffect(() => {
    onAttachmentsChangeRef.current = onAttachmentsChange;
  }, [onAttachmentsChange]);

  const latestStateRef = useRef<EditorState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(() => {
    const state = latestStateRef.current;
    if (!state) return;
    const json = state.toJSON();
    onChangeRef.current(json as EditorContent);
    if (onAttachmentsChangeRef.current) {
      const next = reconcileAttachments(json, attachmentsRef.current);
      if (next.length !== attachmentsRef.current.length) {
        attachmentsRef.current = next;
        onAttachmentsChangeRef.current(next);
      }
    }
  }, []);

  // `state` is for a writer that produced one without `OnChangePlugin` seeing it: Lexical drops any update whose
  // *previous* state was empty (`prevEditorState.isEmpty()`), so the first write into an empty field never reaches
  // `handleChange`. A person types again and the next keystroke carries the document; an agent writes once.
  // Without one, only a change still waiting on the debounce is committed — a blur that follows no edit writes nothing.
  const flush = useCallback(
    (state?: EditorState) => {
      if (state) latestStateRef.current = state;
      else if (!timerRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      commit();
    },
    [commit],
  );

  const handleChange = useCallback(
    (editorState: EditorState) => {
      latestStateRef.current = editorState;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commit();
      }, changeDebounceMs);
    },
    [commit],
  );

  // The external value replaced the document, so a commit still pending from before would write it back over.
  const onExternalValue = useCallback((state: EditorState) => {
    latestStateRef.current = state;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => () => flush(), [flush]);

  return { attachmentsRef, onAttachmentsChangeRef, flush, handleChange, onExternalValue };
};
