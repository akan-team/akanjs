import { describe, expect, spyOn, test } from "bun:test";
import { Logger } from "akanjs/common";
import { LlmOverflow } from "./llmOverflow";

describe("LlmOverflow.match", () => {
  test("reads the window and the prompt out of each provider's own sentence", () => {
    expect(LlmOverflow.match("prompt is too long: 213462 tokens > 200000 maximum")).toEqual({
      limit: 200_000,
      requested: 213_462,
    });
    expect(
      LlmOverflow.match(
        "This endpoint's maximum context length is 131072 tokens. However, you requested about 140,000 tokens",
      ),
    ).toEqual({ limit: 131_072, requested: 140_000 });
    expect(LlmOverflow.match("Input length (265330) exceeds model's maximum context length (262144).")).toEqual({
      limit: 262_144,
      requested: 265_330,
    });
    expect(
      LlmOverflow.match("The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)"),
    ).toEqual({ limit: 1_048_575, requested: 1_196_265 });
    expect(
      LlmOverflow.match("This model's maximum prompt length is 131072 but the request contains 537812 tokens"),
    ).toEqual({ limit: 131_072, requested: 537_812 });
  });

  test("an overflow that names no number is still one", () => {
    expect(LlmOverflow.match("context_length_exceeded")).toEqual({});
    expect(LlmOverflow.match("Please reduce the length of the messages or completion.")).toEqual({});
  });

  test("a quota is not a window, even in the same words", () => {
    expect(LlmOverflow.match("Rate limit reached: too many tokens per minute, prompt is too long for your tier")).toBe(
      null,
    );
    expect(LlmOverflow.match("Incorrect API key provided")).toBe(null);
  });
});

describe("LlmOverflow.refusal", () => {
  test("answers every other refusal with the provider and status, and logs the provider's sentence", () => {
    const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      const error = LlmOverflow.refusal(
        "https://api.openai.com/v1",
        401,
        "Incorrect API key provided: sk-ab***wxyz",
      ) as Error & {
        data?: Record<string, unknown>;
      };
      expect(error.message).toBe("agent.error.llmRequestFailed");
      expect(error.data).toEqual({ provider: "api.openai.com", status: "401" });
      expect(JSON.stringify(error)).not.toContain("sk-ab");
      expect(warn).toHaveBeenCalledWith(
        "api.openai.com refused a turn with status 401: Incorrect API key provided: sk-ab***wxyz",
      );
    } finally {
      warn.mockRestore();
    }
  });
});

describe("LlmOverflow.failed", () => {
  test("logs a failure once: a refusal it classified stays at its own warning, an overflow warns, any other is an error", () => {
    const lines: [string, string][] = [];
    const logger = {
      warn: (line: string) => lines.push(["warn", line]),
      error: (line: string) => lines.push(["error", line]),
    };
    const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      LlmOverflow.failed(logger, "Anthropic", LlmOverflow.refusal("https://api.anthropic.com/v1", 400, "bad tools"));
      LlmOverflow.failed(logger, "Anthropic", LlmOverflow.declined("https://api.anthropic.com/v1", "cyber"));
      LlmOverflow.failed(
        logger,
        "Anthropic",
        LlmOverflow.refusal("https://api.anthropic.com/v1", 400, "prompt is too long: 213462 tokens > 200000 maximum"),
      );
      LlmOverflow.failed(logger, "Anthropic", new TypeError("fetch failed"));
    } finally {
      warn.mockRestore();
    }
    expect(lines.map(([level]) => level)).toEqual(["warn", "error"]);
    expect(lines[1]?.[1]).toBe("Anthropic turn failed: fetch failed");
  });
});
