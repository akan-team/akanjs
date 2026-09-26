import { afterEach, describe, expect, test } from "bun:test";
import { codeAgentPresets } from "akanjs/common";
import { CodeRunner } from "./code.runner";

afterEach(() => {
  delete process.env.AKAN_CODE_CAN_PROMPT;
});

describe("CodeRunner.canPrompt", () => {
  test("a pod prompts only when a host is on the wire, and the env overrides either way", () => {
    const pod = codeAgentPresets.pod("/w");
    expect(CodeRunner.canPrompt(pod, false)).toBe(false);
    expect(CodeRunner.canPrompt(pod, true)).toBe(true);
    process.env.AKAN_CODE_CAN_PROMPT = "0";
    expect(CodeRunner.canPrompt(pod, true)).toBe(false);
    process.env.AKAN_CODE_CAN_PROMPT = "1";
    expect(CodeRunner.canPrompt(pod, false)).toBe(true);
  });
});
