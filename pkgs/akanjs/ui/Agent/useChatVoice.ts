"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentSession } from "use-agentic";
import { type VoiceEngine, type VoiceListener, VoiceReader } from "./voice";

interface ChatVoiceSetup {
  session: AgentSession;
  engine?: VoiceEngine;
  /** The chat's own version snapshot — every transcript change re-runs the reading policy. */
  version: number;
  onTranscript: (text: string) => void;
  onFailed: () => void;
}

/**
 * The chat's speech policy, which is the framework's and not the engine's: one utterance per press, the
 * transcript landing in the composer to be corrected, barge-in on the next press or on Stop, and a reply read
 * aloud **only when the ask arrived by voice** — a typed question never turns the speakers on.
 *
 * A question or an approval the loop parked on is read too, and only in that same case: the loop stops there,
 * and a voice user staring at a card they were never told about is a conversation that simply ends.
 */
export const useChatVoice = ({ session, engine, version, onTranscript, onFailed }: ChatVoiceSetup) => {
  const [listening, setListening] = useState(false);
  // Always-latest: the engine a hook returns may be a new object each render, and the reader outlives them all.
  const held = useRef<VoiceEngine | undefined>(engine);
  held.current = engine;
  const listener = useRef<VoiceListener | null>(null);
  const reader = useRef<VoiceReader | null>(null);
  reader.current ??= new VoiceReader(() => held.current);
  /** Set while the draft came from the microphone, consumed by the send that carries it. */
  const byVoice = useRef(false);
  /** The assistant message being read aloud. Null means this turn is not one to read. */
  const spoken = useRef<{ at: number } | null>(null);
  /** The parked card already announced, so a question is not re-read on every transcript change. */
  const announced = useRef<string | null>(null);
  const heard = useRef(0);
  useEffect(() => {
    const speaker = reader.current;
    // A shorter transcript is a cleared or retried one — /new must not leave the last answer still being read.
    if (session.messages.length < heard.current) {
      speaker?.reset();
      spoken.current = null;
    }
    heard.current = session.messages.length;
    if (!speaker) return;
    const parked = session.pendingQuestion ?? session.pendingApproval;
    if (!parked) announced.current = null;
    else if (spoken.current && announced.current !== parked.callId) {
      announced.current = parked.callId;
      speaker.say("question" in parked ? parked.question : parked.message);
    }
    const reading = spoken.current;
    if (!reading) return;
    const at = session.messages.findLastIndex(
      (message) => message.role === "assistant" && !message.local && !!message.text,
    );
    if (at < 0) return;
    // A later answer in the same turn is a new one to read from the start; a tool row between them is skipped.
    if (at !== reading.at) {
      speaker.reset();
      reading.at = at;
    }
    const text = session.messages[at].text ?? "";
    if (session.isRunning) speaker.feed(text);
    else {
      speaker.flush(text);
      spoken.current = null;
    }
  }, [version]);
  useEffect(
    () => () => {
      listener.current?.stop();
      reader.current?.cancel();
    },
    [],
  );
  /** One press is one utterance, so the engine is told to stop even when it reported a final result itself. */
  const endListening = () => {
    const running = listener.current;
    listener.current = null;
    running?.stop();
    setListening(false);
  };
  const silence = () => {
    reader.current?.cancel();
    spoken.current = null;
  };
  return {
    listening,
    /** A screen that cannot listen renders no microphone — the rule that publishes no tool for a missing control. */
    canListen: !!engine && (engine.available?.() ?? true),
    silence,
    /** Called by the send that opens a turn: only an ask that arrived by voice is answered out loud. */
    take: () => {
      spoken.current = byVoice.current ? { at: -1 } : null;
      byVoice.current = false;
    },
    /** The draft was consumed by something that is not a new turn — an answer to a question the agent asked. */
    drop: () => {
      byVoice.current = false;
    },
    toggle: () => {
      if (listener.current) {
        endListening();
        return;
      }
      const voiceEngine = held.current;
      if (!voiceEngine) return;
      // Pressing the microphone is barge-in: what is being read stops, so the two are never heard at once.
      silence();
      listener.current = voiceEngine.listen({
        onInterim: onTranscript,
        onFinal: (text) => {
          onTranscript(text);
          byVoice.current = true;
          endListening();
        },
        onError: (message) => {
          // The reason is for whoever is debugging a permission prompt; the user gets one sentence they can act on.
          console.warn(`[akan] voice input failed: ${message}`);
          onFailed();
          endListening();
        },
      });
      setListening(true);
    },
  };
};
