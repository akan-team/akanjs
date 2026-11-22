import { describe, expect, test } from "bun:test";
import { type CodeAgentProfile, type CodeAgentQuestion, codeAgentPresets } from "akanjs/common";
import { AskToolPack } from "./AskToolPack";

interface RegisteredTool {
  name: string;
  description: string;
  execute: (
    id: string,
    params: { questions?: unknown[] },
  ) => Promise<{ content: { text?: string }[]; isError?: boolean }>;
}

const mount = (
  profile: CodeAgentProfile,
  answer: (question: Omit<CodeAgentQuestion, "questionId">) => string | undefined,
) => {
  const asked: Omit<CodeAgentQuestion, "questionId">[] = [];
  const pack = new AskToolPack({
    profile,
    ask: async (question) => {
      asked.push(question);
      return answer(question);
    },
  });
  const tools: RegisteredTool[] = [];
  const extension = pack.extension();
  if (extension && "factory" in extension)
    extension.factory({ registerTool: (spec: RegisteredTool) => tools.push(spec) } as never);
  return { pack, tool: tools[0], asked };
};

const local = codeAgentPresets.local("/repo");
const pod = codeAgentPresets.pod("/repo");

const one = (patch: Record<string, unknown> = {}) => ({
  question: "Which database?",
  options: [{ label: "Postgres" }, { label: "SQLite", recommended: true }],
  ...patch,
});

describe("ask_user", () => {
  test("it is published only where somebody can answer", () => {
    expect(mount(local, () => "x").pack.names()).toEqual(["ask_user"]);
    expect(mount(pod, () => "x").pack.names()).toEqual([]);
    expect(mount(pod, () => "x").tool).toBeUndefined();
  });

  test("a question reaches the wire with its options, and the answer comes back as the label", async () => {
    const { tool, asked } = mount(local, () => "SQLite");
    const result = await tool?.execute("t", { questions: [one()] });
    expect(asked[0]).toMatchObject({
      prompt: "Which database?",
      kind: "select",
      options: [
        { key: "0", label: "Postgres" },
        { key: "1", label: "SQLite", recommended: true },
      ],
    });
    expect(result?.content[0]?.text).toContain("→ SQLite");
  });

  test("a header is folded into the prompt, because the wire carries one line", async () => {
    const { tool, asked } = mount(local, () => "a");
    await tool?.execute("t", { questions: [one({ header: "Storage" })] });
    expect(asked[0]?.prompt).toBe("Storage — Which database?");
  });

  test("several questions are asked in order, one at a time", async () => {
    const { tool, asked } = mount(local, (question) => (question.prompt.includes("database") ? "SQLite" : "Yes"));
    const result = await tool?.execute("t", {
      questions: [one(), { question: "Run migrations now?", options: [{ label: "Yes" }, { label: "No" }] }],
    });
    expect(asked.map((entry) => entry.prompt)).toEqual(["Which database?", "Run migrations now?"]);
    expect(result?.content[0]?.text).toContain("Which database?\n→ SQLite");
    expect(result?.content[0]?.text).toContain("Run migrations now?\n→ Yes");
  });

  test("more questions than fit on a screen are cut rather than drawn over the transcript", async () => {
    const { tool, asked } = mount(local, () => "a");
    await tool?.execute("t", { questions: Array.from({ length: 7 }, (_, at) => one({ question: `Q${at}?` })) });
    expect(asked).toHaveLength(AskToolPack.maxQuestions);
  });

  test("a skipped question says so, and says what to do about it", async () => {
    const { tool } = mount(local, () => undefined);
    const result = await tool?.execute("t", { questions: [one()] });
    expect(result?.content[0]?.text).toContain("skipped");
    expect(result?.content[0]?.text).toContain("decide this yourself");
  });

  test("free text is offered unless the model turns it off", async () => {
    const { tool, asked } = mount(local, () => "a");
    await tool?.execute("t", { questions: [one(), one({ freeText: false })] });
    expect(asked[0]?.freeText).toBe(true);
    expect(asked[1]?.freeText).toBe(false);
  });

  test("a question with no options asks for prose", async () => {
    const { tool, asked } = mount(local, () => "because of the index");
    await tool?.execute("t", { questions: [{ question: "Why is it slow?" }] });
    expect(asked[0]?.kind).toBe("text");
    expect(asked[0]?.options).toBeUndefined();
  });

  test("multi-select travels as itself", async () => {
    const { tool, asked } = mount(local, () => "a, b");
    await tool?.execute("t", { questions: [one({ multiSelect: true })] });
    expect(asked[0]?.multiSelect).toBe(true);
  });

  test("asking nothing is a mistake, not an empty answer", async () => {
    const { tool } = mount(local, () => "a");
    expect((await tool?.execute("t", { questions: [] }))?.isError).toBe(true);
  });
});
