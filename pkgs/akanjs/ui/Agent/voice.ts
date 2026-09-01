/** A recognition run in progress. `stop` ends it; a final result may still arrive after. */
export interface VoiceListener {
  stop: () => void;
}

/** One utterance being spoken. `cancel` is barge-in; `done` resolves when it finished or was cancelled. */
export interface VoiceSpeech {
  cancel: () => void;
  done: Promise<void>;
}

export interface VoiceHandlers {
  /** Partial text while the user is still speaking. An engine without interim results simply never calls it. */
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}

/**
 * The seam a voice engine fills — one contract, whatever is behind it: the browser's own recognition, a cloud
 * STT/TTS pair, or a native plugin. The engine speaks and listens; **the framework owns the policy** — when to
 * listen, what to speak, sentence chunking, barge-in, and whether a reply is spoken at all.
 *
 * Shaped as a subscription rather than `listen(): Promise<string>` on purpose. A promise fits push-to-talk and
 * nothing else, and continuous listening could then only arrive as a breaking change; this shape carries both, so
 * hands-free is a later policy decision instead of a later contract.
 *
 * `listen` must be reachable from the click that starts it: microphone permission and, on iOS, the first
 * `speechSynthesis` utterance are both gated on a user gesture.
 */
export interface VoiceEngine {
  listen: (handlers: VoiceHandlers) => VoiceListener;
  /** One sentence at a time, already stripped of markdown. The framework queues; the engine speaks. */
  speak: (text: string) => VoiceSpeech;
  /** Answering false hides the controls — a screen that cannot listen should not offer a microphone. */
  available?: () => boolean;
}

const fenced = /^ {0,3}(?:```|~~~)/;
const tableRow = /^\s*\|/;
const horizontalRule = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const lineMarkers = /^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d{1,9}[.)]\s+)/;
const image = /!\[([^\]]*)\]\([^)]*\)/g;
const link = /\[([^\]]*)\]\([^)]*\)/g;
const emphasis = /(\*\*\*|\*\*|\*|___|__|_|~~)/g;
const inlineCode = /`([^`]*)`/g;

/**
 * What of a model's answer should be read aloud.
 *
 * Code blocks, tables, and rules are dropped rather than spoken: a fence read character by character is noise,
 * and a table read cell by cell is worse than silence — in push-to-talk the user is looking at the screen that
 * already renders both. Inline code keeps its content, because that is usually a name worth hearing.
 *
 * Monotonic over a growing source, which is what lets the reader below track one offset: new text never changes
 * how earlier text was rendered, since a fence marker always arrives before the lines it swallows.
 */
export const speechText = (markdown: string): string => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (fenced.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || tableRow.test(line) || horizontalRule.test(line)) continue;
    const plain = line
      .replace(lineMarkers, "")
      .replace(image, "$1")
      .replace(link, "$1")
      .replace(inlineCode, "$1")
      .replace(emphasis, "");
    kept.push(plain);
  }
  return kept.join("\n");
};

/** A terminator counts only with whitespace behind it, so `1.5` is not a sentence and a stream is never cut early. */
const sentenceEnd = /[.!?。！？…]+\s|\n/g;

/**
 * Reads an assistant answer aloud as it streams in, one sentence at a time.
 *
 * Sentence-at-a-time rather than delta-at-a-time because a delta cuts words in half, and whole-message-at-a-time
 * because that waits for the turn to end. The offset is over `speechText` output, not the raw source, so a code
 * block that arrives mid-answer costs nothing.
 */
export class VoiceReader {
  readonly #engine: () => VoiceEngine | undefined;
  #queue: string[] = [];
  #current: VoiceSpeech | null = null;
  #offset = 0;

  constructor(engine: () => VoiceEngine | undefined) {
    this.#engine = engine;
  }

  get speaking() {
    return !!this.#current;
  }

  /** Call with the whole answer so far, as often as it changes; already-spoken text is never repeated. */
  feed(source: string) {
    this.#chunk(source, false);
  }

  /**
   * The turn ended: the last sentence has no whitespace behind it and would otherwise never be spoken. It still
   * splits what is left, because a whole answer that arrived in one render must not be read as one long utterance.
   */
  flush(source: string) {
    this.#chunk(source, true);
  }

  /**
   * A line that is not part of the answer being tracked — the question or approval the loop parked on. It joins
   * the same queue, so it is spoken after the sentence in flight rather than over it, and Stop still cancels it.
   */
  say(text: string) {
    this.#enqueue(speechText(text));
    this.#pump();
  }

  cancel() {
    this.#queue = [];
    this.#current?.cancel();
    this.#current = null;
  }

  reset() {
    this.cancel();
    this.#offset = 0;
  }

  #chunk(source: string, final: boolean) {
    const text = speechText(source);
    // A shorter answer than last time is a different answer — a retry, or a transcript that was cleared.
    if (text.length < this.#offset) this.reset();
    const pending = text.slice(this.#offset);
    sentenceEnd.lastIndex = 0;
    let cut = 0;
    for (let match = sentenceEnd.exec(pending); match; match = sentenceEnd.exec(pending)) {
      const end = match.index + match[0].length;
      this.#enqueue(pending.slice(cut, end));
      cut = end;
    }
    if (final) {
      this.#enqueue(pending.slice(cut));
      cut = pending.length;
    }
    this.#offset += cut;
    this.#pump();
  }

  #enqueue(chunk: string) {
    const text = chunk.trim();
    if (text) this.#queue.push(text);
  }

  #pump() {
    if (this.#current || !this.#queue.length) return;
    const engine = this.#engine();
    if (!engine) {
      this.#queue = [];
      return;
    }
    const next = this.#queue.shift() as string;
    const speech = engine.speak(next);
    this.#current = speech;
    void speech.done.then(() => {
      if (this.#current !== speech) return;
      this.#current = null;
      this.#pump();
    });
  }
}
