import { beforeAll, describe, expect, mock, test } from "bun:test";

type Result = { isFinal: boolean; 0: { transcript: string } };

/** The browser objects the web engine reaches for, driven from the test. */
const speech = {
  recognitions: [] as FakeRecognition[],
  spoken: [] as string[],
  cancelled: 0,
  ctor: true,
  synth: true,
  get synthesis() {
    if (!speech.synth) return undefined;
    return {
      speak: (utterance: { text: string; onend: (() => void) | null }) => {
        speech.spoken.push(utterance.text);
        utterance.onend?.();
      },
      cancel: () => {
        speech.cancelled += 1;
      },
    };
  },
};

class FakeRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  started = 0;
  stopped = 0;
  onresult: ((event: { resultIndex: number; results: { length: number; [at: number]: Result } }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    speech.recognitions.push(this);
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  /** What a browser sends: one result list, the tail of which may still be interim. */
  hear(transcript: string, isFinal: boolean) {
    const results = { length: 1, 0: { isFinal, 0: { transcript } } };
    this.onresult?.({ resultIndex: 0, results });
  }
}

let useSpeech: typeof import("./useSpeech").useSpeech;

beforeAll(async () => {
  mock.module("react", () => ({
    useState: <T,>(initial: T) => [initial, () => {}],
    useEffect: () => {},
    useMemo: <T,>(factory: () => T) => factory(),
  }));
  mock.module("akanjs/client", () => ({ isMobileDevice: () => false }));
  mock.module("akanjs/client/capacitor", () => ({
    loadCapacitorSpeechRecognition: async () => ({}),
    loadCapacitorTextToSpeech: async () => ({}),
  }));
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.window = {
    get SpeechRecognition() {
      return speech.ctor ? FakeRecognition : undefined;
    },
    get speechSynthesis() {
      return speech.synthesis;
    },
  };
  scope.SpeechSynthesisUtterance = class {
    lang = "";
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly text: string) {}
  };
  scope.navigator = { language: "ko-KR" };
  ({ useSpeech } = await import("./useSpeech"));
});

const engineOf = () => {
  speech.recognitions = [];
  speech.spoken = [];
  speech.cancelled = 0;
  speech.ctor = true;
  speech.synth = true;
  return useSpeech();
};

const handlersOf = () => {
  const interim: string[] = [];
  const final: string[] = [];
  const errors: string[] = [];
  return {
    interim,
    final,
    errors,
    handlers: {
      onInterim: (text: string) => interim.push(text),
      onFinal: (text: string) => final.push(text),
      onError: (message: string) => errors.push(message),
    },
  };
};

describe("useSpeech on the web", () => {
  test("reports interim text while speaking and the final result once", () => {
    const engine = engineOf();
    const { interim, final, handlers } = handlersOf();
    engine.listen(handlers);
    const recognition = speech.recognitions[0];
    expect(recognition.started).toBe(1);
    expect(recognition.interimResults).toBe(true);
    // One press is one utterance, so the browser's own silence timeout ends it.
    expect(recognition.continuous).toBe(false);
    expect(recognition.lang).toBe("ko-KR");
    recognition.hear("보여", false);
    recognition.hear("보여줘", false);
    expect(interim).toEqual(["보여", "보여줘"]);
    recognition.hear("작업 목록 보여줘", true);
    expect(final).toEqual(["작업 목록 보여줘"]);
    // A second result after the final one is not a second answer.
    recognition.hear("again", true);
    expect(final).toEqual(["작업 목록 보여줘"]);
  });

  test("recognition ending on its own still reports, so the microphone cannot stay lit", () => {
    const engine = engineOf();
    const { final, handlers } = handlersOf();
    engine.listen(handlers);
    const recognition = speech.recognitions[0];
    recognition.hear("half a sentence", false);
    recognition.onend?.();
    expect(final).toEqual(["half a sentence"]);
  });

  test("a press with nothing said is not an error the user hears about", () => {
    const engine = engineOf();
    const { final, errors, handlers } = handlersOf();
    engine.listen(handlers);
    speech.recognitions[0].onerror?.({ error: "no-speech" });
    expect(errors).toEqual([]);
    expect(final).toEqual([""]);
  });

  test("a real failure is reported and no final result is invented", () => {
    const engine = engineOf();
    const { final, errors, handlers } = handlersOf();
    engine.listen(handlers);
    const recognition = speech.recognitions[0];
    recognition.onerror?.({ error: "not-allowed" });
    expect(errors).toEqual(["not-allowed"]);
    recognition.onend?.();
    expect(final).toEqual([]);
  });

  test("stop ends the run through the browser", () => {
    const engine = engineOf();
    const { handlers } = handlersOf();
    const listener = engine.listen(handlers);
    listener.stop();
    expect(speech.recognitions[0].stopped).toBe(1);
  });

  test("speaking resolves when the utterance ends, and cancel reaches the synthesizer", async () => {
    const engine = engineOf();
    const utterance = engine.speak("Two words.");
    await utterance.done;
    expect(speech.spoken).toEqual(["Two words."]);
    engine.speak("Cancelled.").cancel();
    expect(speech.cancelled).toBe(1);
  });

  test("a browser without recognition is unavailable, and one without synthesis stays silent", async () => {
    const engine = engineOf();
    expect(engine.available?.()).toBe(true);
    speech.ctor = false;
    expect(engine.available?.()).toBe(false);
    const { errors, handlers } = handlersOf();
    engine.listen(handlers);
    expect(errors).toHaveLength(1);
    speech.synth = false;
    // No synthesis is not a failure: the answer is simply not read aloud.
    await engine.speak("nothing happens").done;
    expect(speech.spoken).toEqual([]);
  });
});
