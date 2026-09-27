"use client";
import type { VoiceEngine, VoiceHandlers, VoiceListener, VoiceSpeech } from "akanjs/ui";
import { useMemo } from "react";

interface RecognitionResult {
  isFinal: boolean;
  0?: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

/** Not in lib.dom under the prefixed name, and the unprefixed one is absent in the browsers that need it. */
const recognitionCtor = (): (new () => Recognition) | undefined => {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};

const settled = () => {
  let done: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    done = resolve;
  });
  return { done, promise };
};

const webEngine = (lang: string): VoiceEngine => ({
  available: () => !!recognitionCtor(),
  listen: (handlers: VoiceHandlers): VoiceListener => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      handlers.onError("SpeechRecognition is unavailable in this browser.");
      return { stop: () => {} };
    }
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    // One press is one utterance; the browser's own silence timeout ends it.
    recognition.continuous = false;
    let last = "";
    let ended = false;
    const finish = (text: string) => {
      if (ended) return;
      ended = true;
      handlers.onFinal(text);
    };
    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let at = event.resultIndex; at < event.results.length; at += 1) {
        const result = event.results[at];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final) finish(final);
      else if (interim) {
        last = interim;
        handlers.onInterim?.(interim);
      }
    };
    recognition.onerror = (event) => {
      // A press with nothing said, or one the caller stopped, is not a failure worth telling the user about.
      if (event.error === "no-speech" || event.error === "aborted") {
        finish(last);
        return;
      }
      ended = true;
      handlers.onError(event.error);
    };
    // Recognition also ends on its own; without this the microphone would look like it is still listening.
    recognition.onend = () => finish(last);
    recognition.start();
    return {
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // Already stopped — `stop` throws rather than answering in some engines.
          finish(last);
        }
      },
    };
  },
  speak: (text: string): VoiceSpeech => {
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!synth) return { cancel: () => {}, done: Promise.resolve() };
    const { done, promise } = settled();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onend = () => done();
    utterance.onerror = () => done();
    synth.speak(utterance);
    return {
      cancel: () => {
        synth.cancel();
        done();
      },
      done: promise,
    };
  },
});

/**
 * A `VoiceEngine` over the browser's own recognition and synthesis. Hand it to `<Agent.Chat voice={…} />`; where the
 * engine has none (most app WebViews) `available()` answers false and the chat renders no microphone.
 */
export const useSpeech = ({ lang }: { lang?: string } = {}) => {
  const locale = lang ?? (typeof navigator === "undefined" ? "en-US" : navigator.language);
  return useMemo(() => webEngine(locale), [locale]);
};
