"use client";
import { isMobileDevice } from "akanjs/client";
import { loadCapacitorSpeechRecognition, loadCapacitorTextToSpeech } from "akanjs/client/capacitor";
import type { VoiceEngine, VoiceHandlers, VoiceListener, VoiceSpeech } from "akanjs/ui";
import { useEffect, useMemo, useState } from "react";

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

const nativeEngine = (lang: string, ready: boolean): VoiceEngine => ({
  available: () => ready,
  listen: (handlers: VoiceHandlers): VoiceListener => {
    let last = "";
    let ended = false;
    const finish = (text: string) => {
      if (ended) return;
      ended = true;
      handlers.onFinal(text);
    };
    void (async () => {
      try {
        const { SpeechRecognition } = await loadCapacitorSpeechRecognition();
        const permission = await SpeechRecognition.requestPermissions();
        if (permission.speechRecognition !== "granted") {
          ended = true;
          handlers.onError(`speechRecognition permission is ${permission.speechRecognition}`);
          return;
        }
        await SpeechRecognition.removeAllListeners();
        await SpeechRecognition.addListener("partialResults", (data) => {
          const text = data.matches?.[0] ?? "";
          if (!text) return;
          last = text;
          handlers.onInterim?.(text);
        });
        // iOS resolves this only when recognition ends; Android resolves it with the matches it heard. Either way
        // the partial results already arrived through the listener, so `last` covers the platform that sends none.
        const result = await SpeechRecognition.start({ language: lang, partialResults: true, popup: false });
        finish(result.matches?.[0] ?? last);
      } catch (error) {
        ended = true;
        handlers.onError(error instanceof Error ? error.message : String(error));
      }
    })();
    return {
      stop: () => {
        void (async () => {
          try {
            const { SpeechRecognition } = await loadCapacitorSpeechRecognition();
            await SpeechRecognition.stop();
          } catch {
            // Nothing to stop; the final below is what the press produced.
          }
          finish(last);
        })();
      },
    };
  },
  speak: (text: string): VoiceSpeech => {
    const { done, promise } = settled();
    void (async () => {
      try {
        const { TextToSpeech } = await loadCapacitorTextToSpeech();
        await TextToSpeech.speak({ text, lang });
      } catch {
        // A device without the plugin stays silent rather than breaking the turn.
      }
      done();
    })();
    return {
      cancel: () => {
        void (async () => {
          try {
            const { TextToSpeech } = await loadCapacitorTextToSpeech();
            await TextToSpeech.stop();
          } catch {
            // Nothing was speaking.
          }
          done();
        })();
      },
      done: promise,
    };
  },
});

/**
 * A `VoiceEngine` over whatever the platform actually has: the browser's own recognition and synthesis on the web,
 * the Capacitor plugins in a WebView — which has neither, on Android or iOS. Hand it to `<Agent.Chat voice={…} />`;
 * when nothing is available `available()` answers false and the chat renders no microphone.
 *
 * Native availability needs an async probe, so it is read once on mount and reported through `available()`.
 */
export const useSpeech = ({ lang }: { lang?: string } = {}) => {
  const [nativeReady, setNativeReady] = useState(false);
  const native = isMobileDevice();
  const locale = lang ?? (typeof navigator === "undefined" ? "en-US" : navigator.language);
  useEffect(() => {
    if (!native) return;
    void (async () => {
      try {
        const { SpeechRecognition } = await loadCapacitorSpeechRecognition();
        const { available } = await SpeechRecognition.available();
        setNativeReady(available);
      } catch {
        setNativeReady(false);
      }
    })();
  }, [native]);
  return useMemo(() => (native ? nativeEngine(locale, nativeReady) : webEngine(locale)), [native, locale, nativeReady]);
};
