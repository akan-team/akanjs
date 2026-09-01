"use client";
import { useRef, useState } from "react";
import type { ChatMessage } from "use-agentic";

/** What a restored transcript can still offer the arrows: the asks themselves, newest last. */
const asked = (messages: readonly ChatMessage[], cap: number) =>
  messages
    .flatMap((message) => (message.role === "user" && !message.summary && message.text ? [message.text] : []))
    .slice(-cap);

/**
 * ↑ walks back through what was sent, ↓ forward, and 0 is the draft it was walked away from. A single-line input
 * does nothing of its own with the vertical arrows, so recall is free to take them.
 *
 * Seeded from the transcript rather than starting empty, because a persisted chat restores the conversation and
 * losing only "what I just typed" across a reload is the one gap a user notices.
 */
export const useDraftRecall = (messages: readonly ChatMessage[]) => {
  const cap = 30;
  const sent = useRef<string[] | null>(null);
  if (!sent.current) sent.current = asked(messages, cap);
  const walked = sent.current;
  const stashed = useRef("");
  const [at, setAt] = useState(0);
  return {
    has: !!walked.length,
    remember: (text: string) => {
      const history = sent.current ?? [];
      if (history[history.length - 1] !== text) sent.current = [...history, text].slice(-cap);
      setAt(0);
    },
    /** Answers the draft to show, or null when the walk cannot go that way. */
    step: (delta: number, draft: string): string | null => {
      const history = sent.current ?? [];
      const next = Math.max(0, Math.min(at + delta, history.length));
      if (next === at) return null;
      if (!at) stashed.current = draft;
      setAt(next);
      return next ? history[history.length - next] : stashed.current;
    },
  };
};
