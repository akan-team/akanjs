import { describe, expect, test } from "bun:test";
import { speechText, type VoiceEngine, VoiceReader } from "./voice";

const engineOf = () => {
  const spoken: string[] = [];
  let settle: (() => void) | null = null;
  const engine: VoiceEngine = {
    listen: () => ({ stop: () => {} }),
    speak: (text) => {
      spoken.push(text);
      let done: () => void = () => {};
      const promise = new Promise<void>((resolve) => {
        done = resolve;
      });
      settle = done;
      return { cancel: done, done: promise };
    },
  };
  /** Ends the utterance being spoken, the way a real engine's `done` resolves. */
  const finish = async () => {
    settle?.();
    settle = null;
    await Promise.resolve();
    await Promise.resolve();
  };
  return { engine, spoken, finish };
};

describe("speechText", () => {
  test("drops what is worse than silence and keeps what is worth hearing", () => {
    const source = [
      "# Heading",
      "Call `removeTask` to **remove** it.",
      "```ts",
      "const x = 1;",
      "```",
      "- first item",
      "| a | b |",
      "---",
      "See [the docs](https://x.dev/a).",
    ].join("\n");
    expect(speechText(source)).toBe(
      ["Heading", "Call removeTask to remove it.", "first item", "See the docs."].join("\n"),
    );
  });

  test("stays monotonic while an answer streams in", () => {
    const whole = "One sentence. Then a fence:\n```\ncode\n```\nAnd the end.";
    let previous = "";
    for (let at = 1; at <= whole.length; at += 1) {
      const now = speechText(whole.slice(0, at));
      // A fence marker always arrives before the lines it swallows, so earlier output never changes.
      if (!now.startsWith(previous.slice(0, Math.min(previous.length, now.length)))) throw new Error(now);
      previous = now;
    }
    expect(speechText(whole)).toBe("One sentence. Then a fence:\nAnd the end.");
  });
});

describe("VoiceReader", () => {
  test("speaks one complete sentence at a time and never repeats one", async () => {
    const { engine, spoken, finish } = engineOf();
    const reader = new VoiceReader(() => engine);
    reader.feed("First one.");
    // No whitespace behind the terminator yet, so it may still be `First one.5` — nothing is spoken.
    expect(spoken).toEqual([]);
    reader.feed("First one. Second");
    expect(spoken).toEqual(["First one."]);
    reader.feed("First one. Second one. Third");
    // Still one: the queue waits for the utterance in flight.
    expect(spoken).toEqual(["First one."]);
    await finish();
    expect(spoken).toEqual(["First one.", "Second one."]);
    await finish();
    expect(spoken).toEqual(["First one.", "Second one."]);
    reader.flush("First one. Second one. Third one.");
    expect(spoken).toEqual(["First one.", "Second one.", "Third one."]);
  });

  test("flush speaks the tail that has no whitespace behind it", () => {
    const { engine, spoken } = engineOf();
    const reader = new VoiceReader(() => engine);
    reader.feed("Only one sentence.");
    expect(spoken).toEqual([]);
    reader.flush("Only one sentence.");
    expect(spoken).toEqual(["Only one sentence."]);
  });

  test("cancel drops the queue and the utterance in flight", async () => {
    const { engine, spoken, finish } = engineOf();
    const reader = new VoiceReader(() => engine);
    reader.feed("One. Two. Three. ");
    expect(spoken).toEqual(["One."]);
    expect(reader.speaking).toBe(true);
    reader.cancel();
    expect(reader.speaking).toBe(false);
    await finish();
    expect(spoken).toEqual(["One."]);
  });

  test("a shorter answer than last time starts over instead of reading from the old offset", async () => {
    const { engine, spoken, finish } = engineOf();
    const reader = new VoiceReader(() => engine);
    reader.feed("A long first answer. And more of it. ");
    await finish();
    await finish();
    expect(spoken).toEqual(["A long first answer.", "And more of it."]);
    reader.feed("Short. ");
    expect(spoken).toEqual(["A long first answer.", "And more of it.", "Short."]);
  });

  test("with no engine there is nothing to speak and nothing to throw", () => {
    const reader = new VoiceReader(() => undefined);
    reader.feed("Anything at all. ");
    reader.flush("Anything at all. ");
    expect(reader.speaking).toBe(false);
  });
});
