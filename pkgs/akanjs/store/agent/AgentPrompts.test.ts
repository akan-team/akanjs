import { beforeAll, describe, expect, test } from "bun:test";
import { Translator } from "akanjs/client/translator";
import type { SerializedSignal } from "akanjs/signal";
import { AgentPrompts } from "./AgentPrompts";

const signals: Record<string, SerializedSignal> = {
  task: {
    endpoint: {
      reviewTask: {
        type: "prompt",
        args: [
          { type: "param", name: "taskId", refName: "ID" },
          { type: "search", name: "focus", refName: "String", nullable: true },
        ],
        returns: { refName: "Any", arrDepth: 1 },
      },
      startTask: {
        type: "mutation",
        args: [{ type: "param", name: "taskId", refName: "ID" }],
        returns: { refName: "Any" },
      },
      planWeek: { type: "prompt", args: [], returns: { refName: "Any", arrDepth: 1 } },
    },
  } as unknown as SerializedSignal,
};

beforeAll(() => {
  Translator.setActiveLocale("en");
  Translator.seed("en", {
    task: { signal: { reviewTask: { desc: { t: "Review a task and suggest next steps" } } } },
  } as never);
});

describe("AgentPrompts", () => {
  test("lists only prompt endpoints, with required flags and dictionary descriptions", () => {
    const prompts = new AgentPrompts(signals).list();
    expect(prompts.map((prompt) => prompt.name)).toEqual(["planWeek", "reviewTask"]);
    const review = prompts[1];
    expect(review.description).toBe("Review a task and suggest next steps");
    expect(review.args).toEqual([
      { name: "taskId", required: true },
      { name: "focus", required: false },
    ]);
  });

  test("parses a slash command into name and positional args", () => {
    expect(AgentPrompts.parseCommand("/reviewTask t1  urgent")).toEqual({
      name: "reviewTask",
      args: ["t1", "urgent"],
    });
    expect(AgentPrompts.parseCommand("/planWeek")).toEqual({ name: "planWeek", args: [] });
    expect(AgentPrompts.parseCommand("plain text")).toBeNull();
    expect(AgentPrompts.parseCommand("/bad!")).toBeNull();
    expect(AgentPrompts.parseCommand("/reviewTask free-form arg!")).toEqual({
      name: "reviewTask",
      args: ["free-form", "arg!"],
    });
  });

  test("normalizes a prompt result into chat messages, one per protocol content kind", () => {
    expect(AgentPrompts.messagesOf("Just review it.")).toEqual([{ role: "user", text: "Just review it." }]);
    expect(
      AgentPrompts.messagesOf([
        { role: "user", content: { type: "text", text: "Review this." } },
        {
          role: "user",
          content: {
            type: "resource",
            resource: { uri: "akan://task/1", mimeType: "application/json", text: '{"id":"1"}' },
          },
        },
        { role: "assistant", content: { type: "resource_link", uri: "akan://task/2", name: "next" } },
        { role: "user", content: { type: "image", data: "abc", mimeType: "image/png" } },
      ]),
    ).toEqual([
      { role: "user", text: "Review this." },
      { role: "user", text: '[resource akan://task/1]\n{"id":"1"}' },
      { role: "assistant", text: "[link next: akan://task/2]" },
      { role: "user", attachments: [{ name: "image.png", mimeType: "image/png", data: "abc" }] },
    ]);
  });
});

describe("AgentPrompts.parseCommand", () => {
  test("splits on whitespace and keeps a quoted argument whole", () => {
    expect(AgentPrompts.parseCommand("/reviewTask t1 urgent")).toEqual({ name: "reviewTask", args: ["t1", "urgent"] });
    expect(AgentPrompts.parseCommand('/reviewTask t1 "the whole sentence"')).toEqual({
      name: "reviewTask",
      args: ["t1", "the whole sentence"],
    });
    expect(AgentPrompts.parseCommand("/reviewTask 'single quoted'")).toEqual({
      name: "reviewTask",
      args: ["single quoted"],
    });
    expect(AgentPrompts.parseCommand("/planWeek")).toEqual({ name: "planWeek", args: [] });
    expect(AgentPrompts.parseCommand("not a command")).toBeNull();
  });

  test("an explicitly empty argument is an argument", () => {
    expect(AgentPrompts.parseCommand('/reviewTask t1 ""')).toEqual({ name: "reviewTask", args: ["t1", ""] });
  });
});
