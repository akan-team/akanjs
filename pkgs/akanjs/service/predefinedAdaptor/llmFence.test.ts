import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { LlmFence } from "./llmFence";

const scripted = (...digests: string[]) => {
  const left = [...digests];
  return () => left.shift() ?? "ffffffff";
};

describe("LlmFence.boundaryOf", () => {
  test("is the same for the same body, and moves on from a delimiter the body holds", () => {
    expect(LlmFence.boundaryOf("a record title")).toBe(LlmFence.boundaryOf("a record title"));
    expect(LlmFence.boundaryOf("x abcd1234 y", scripted("abcd1234", "0f0f0f0f"))).toBe("0f0f0f0f");
  });

  test("moves on from a delimiter the body holds in another case or width", () => {
    expect(LlmFence.boundaryOf("x ABCD1234 y", scripted("abcd1234", "0f0f0f0f"))).toBe("0f0f0f0f");
    expect(LlmFence.boundaryOf("x ａｂｃｄ１２３４ y", scripted("abcd1234", "0f0f0f0f"))).toBe("0f0f0f0f");
    expect(LlmFence.boundaryOf("x Ａbcd１234 y", scripted("abcd1234", "ABCD1234", "0f0f0f0f"))).toBe("0f0f0f0f");
  });

  test("moves on from a delimiter the body holds with characters that do not show between its letters", () => {
    for (const hidden of ["\u200b", "\u200d", "\u00ad", "\u2060", "\ufeff", "\u{e0061}"]) {
      const body = `x ab${hidden}cd${hidden}${hidden}1234 y`;
      expect([hidden, LlmFence.boundaryOf(body, scripted("abcd1234", "0f0f0f0f"))]).toEqual([hidden, "0f0f0f0f"]);
    }
  });

  test("is not a digest of the body alone, so the body's writer cannot work it out ahead", () => {
    const body = "a record title";
    const plain = [createHash("sha256"), createHash("sha1"), createHash("md5")].map((hash) =>
      hash.update(body).digest("hex").slice(0, 8),
    );
    expect(plain).not.toContain(LlmFence.boundaryOf(body));
    expect(LlmFence.boundaryOf(body)).toMatch(/^[0-9a-f]{8}$/);
  });
});
