import { describe, expect, test } from "bun:test";
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
});
