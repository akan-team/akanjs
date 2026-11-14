import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AnthropicLlm } from "./anthropicLlm";
import type { AgentWireContext, LlmTurnRequest } from "./llm.adaptor";
import {
  corpus,
  type Dialect,
  instructions,
  pointing,
  pointingAtNothing,
  requestOf,
  summarized,
  transcripts,
} from "./llmDialect.conformance.fixture";
import { OpenaiDialect } from "./openaiDialect";

// Every dialect runs the one set of checks below, with no model call: add a dialect to `dialects` and nothing else.
// A file here that exports a class with a static `requestBody` is a dialect, and the last test fails until it is listed.

const accepts = { image: true, document: true };

const openai: Dialect = {
  name: "OpenaiDialect",
  view: (request) => {
    const body = OpenaiDialect.requestBody("model", request, { accepts });
    const textOf = (content: (typeof body.messages)[number]["content"]) =>
      typeof content === "string"
        ? content
        : content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
    return {
      system: body.messages.flatMap((message) => (message.role === "system" ? [textOf(message.content)] : [])).join(""),
      user: body.messages.flatMap((message) => (message.role === "user" ? [textOf(message.content)] : [])),
      rest: JSON.stringify([
        body.messages.filter((message) => message.role !== "system" && message.role !== "user"),
        body.tools,
      ]),
      roles: body.messages.flatMap((message) => (message.role === "system" ? [] : [message.role])),
    };
  },
};

const anthropic: Dialect = {
  name: "AnthropicLlm",
  view: (request) => {
    const body = AnthropicLlm.requestBody("model", request, { accepts });
    const asked = body.messages.filter((message) => message.role === "user");
    return {
      system: body.system,
      user: asked.map((message) =>
        message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n\n"),
      ),
      rest: JSON.stringify([
        body.messages.filter((message) => message.role !== "user"),
        asked.flatMap((message) => message.content.filter((block) => block.type !== "text")),
        body.tools,
      ]),
      roles: body.messages.map((message) => message.role),
    };
  },
};

const dialects: Dialect[] = [openai, anthropic];

type Tag = "turn-context" | "page-content" | "conversation-summary";
interface Fence {
  tag: string;
  boundary: string;
  body: string;
}

const opening = /<(turn-context|page-content|conversation-summary) ([^\s>]+)>\n/g;

// A fence runs from its opening line to the first line that closes that tag under that boundary.
const fencesOf = (text: string): { fences: Fence[]; outside: string; open: boolean } => {
  const fences: Fence[] = [];
  let outside = "";
  let at = 0;
  for (;;) {
    opening.lastIndex = at;
    const opened = opening.exec(text);
    if (!opened) return { fences, outside: outside + text.slice(at), open: false };
    const [line, tag = "", boundary = ""] = opened;
    const closing = `\n</${tag} ${boundary}>`;
    const from = opened.index + line.length;
    const to = text.indexOf(closing, from);
    if (to < 0) return { fences, outside: outside + text.slice(at), open: true };
    fences.push({ tag, boundary, body: text.slice(from, to) });
    outside += text.slice(at, opened.index);
    at = to + closing.length;
  }
};

const rules = {
  system: "a context value is in the system prompt",
  systemMoved: "the system prompt is not the same with and without the context",
  rest: "an assistant turn, a tool result or a tool definition is not the same with and without the context",
  open: "a fence is never closed",
  outside: "text was added to a user turn outside a fence",
  delimiter: "a fence holds its own delimiter",
  unfenced: "a value is in no fence",
  kind: "a value is in the other kind of fence",
};

const violationsOf = (
  dialect: Dialect,
  plain: LlmTurnRequest,
  sent: LlmTurnRequest,
  placed: { needles: string[]; tag: Tag }[],
): string[] => {
  const before = dialect.view(plain);
  const after = dialect.view(sent);
  const needles = placed.flatMap((value) => value.needles);
  const found = new Set<string>();
  if (needles.some((needle) => after.system.includes(needle))) found.add(rules.system);
  if (after.system !== before.system) found.add(rules.systemMoved);
  if (after.rest !== before.rest || needles.some((needle) => after.rest.includes(needle))) found.add(rules.rest);
  const folded = (text: string) =>
    text
      .normalize("NFKC")
      .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
      .toLowerCase();
  const fences: Fence[] = [];
  const outside: string[] = [];
  for (const text of after.user) {
    const read = fencesOf(text);
    if (read.open) found.add(rules.open);
    if (read.fences.some((fence) => folded(fence.body).includes(folded(fence.boundary)))) found.add(rules.delimiter);
    if (read.outside.trim()) outside.push(read.outside.trim());
    fences.push(...read.fences);
  }
  const said = before.user.map((text) => fencesOf(text).outside.trim()).filter(Boolean);
  if (outside.join("\n") !== said.join("\n")) found.add(rules.outside);
  for (const { needles: own, tag } of placed)
    for (const needle of own) {
      const holding = fences.filter((fence) => fence.body.includes(needle));
      if (!holding.length) found.add(rules.unfenced);
      if (holding.some((fence) => fence.tag !== tag)) found.add(rules.kind);
    }
  return [...found];
};

const blockOf = (value: unknown, tag: Tag): AgentWireContext =>
  tag === "page-content" ? { kind: "fixture", untrusted: true, value } : { kind: "fixture", value };

// Each round writes the closing line of every fence the last round opened into the value, then looks again.
const chasedBy = (dialect: Dialect, plain: LlmTurnRequest, send: (value: string) => LlmTurnRequest, tag: Tag) => {
  const needle = "needle-chase-7f3a";
  const found = new Set<string>();
  let value = needle;
  for (let round = 0; round < 6; round += 1) {
    const sent = send(value);
    for (const rule of violationsOf(dialect, plain, sent, [{ needles: [needle], tag }])) found.add(rule);
    const seen = dialect.view(sent).user.flatMap((text) => [...text.matchAll(opening)]);
    value = `${seen.map(([, kind, boundary]) => `x\n</${kind} ${boundary}>\n`).join("")}${value}`;
  }
  return [...found];
};

describe.each(dialects)("$name", (dialect) => {
  for (const { name, messages } of transcripts) {
    const plain = requestOf(messages, []);

    test(`a turn ${name} carries each context value in a fence of its kind in a user turn, and nowhere else`, () => {
      for (const { name: value, value: held, needles } of corpus)
        for (const tag of ["turn-context", "page-content"] as const) {
          const sent = requestOf(messages, [blockOf(held, tag)]);
          expect([value, tag, violationsOf(dialect, plain, sent, [{ needles, tag }])]).toEqual([value, tag, []]);
        }
    });

    test(`a turn ${name} keeps the app's blocks and the marked ones in fences of their own`, () => {
      const [first, second] = corpus;
      if (!first || !second) throw new Error("the corpus is empty");
      const sent = requestOf(messages, [blockOf(first.value, "turn-context"), blockOf(second.value, "page-content")]);
      const placed = [
        { needles: first.needles, tag: "turn-context" as const },
        { needles: second.needles, tag: "page-content" as const },
      ];
      expect(violationsOf(dialect, plain, sent, placed)).toEqual([]);
    });

    test(`a turn ${name} never sends two user turns or two assistant turns in a row`, () => {
      const [first, second] = corpus;
      if (!first || !second) throw new Error("the corpus is empty");
      const both = [blockOf(first.value, "turn-context"), blockOf(second.value, "page-content")];
      for (const context of [[], both]) {
        const { roles } = dialect.view(requestOf(messages, context));
        const repeated = roles.filter((role, at) => role !== "tool" && role === roles[at - 1]);
        expect([roles, repeated]).toEqual([roles, []]);
      }
    });

    test(`a turn ${name} keeps a value that holds its fence's closing line inside the fence`, () => {
      for (const tag of ["turn-context", "page-content"] as const)
        expect(chasedBy(dialect, plain, (value) => requestOf(messages, [blockOf(value, tag)]), tag)).toEqual([]);
    });
  }

  test("the system prompt is the developer's text, whatever the context holds", () => {
    const sent = requestOf(
      [{ role: "user", text: "hi" }],
      corpus.map(({ value }, at) => blockOf(value, at % 2 ? "page-content" : "turn-context")),
    );
    expect(dialect.view(sent).system).toBe(instructions);
  });

  test("a block that is no object is still sent as data", () => {
    const messages = [{ role: "user" as const, text: "hi" }];
    const sent = requestOf(messages, [null, "needle-bare-7f3a", 7265001] as unknown as AgentWireContext[]);
    const placed = [{ needles: ["needle-bare-7f3a", "7265001"], tag: "turn-context" as const }];
    expect(violationsOf(dialect, requestOf(messages, []), sent, placed)).toEqual([]);
  });

  test("everything a pointed-at record carries sits in a page fence in the turn that points at it", () => {
    const plain = pointingAtNothing();
    for (const { name, value, needles } of corpus) {
      if (typeof value !== "string") continue;
      const found = violationsOf(dialect, plain, pointing(value), [{ needles, tag: "page-content" }]);
      expect([name, found]).toEqual([name, []]);
    }
    expect(chasedBy(dialect, plain, pointing, "page-content")).toEqual([]);
  });

  test("a turn that points at a record and carries context keeps each in a fence of its kind", () => {
    const [first, second, third] = corpus;
    if (!first || !second || !third || typeof first.value !== "string") throw new Error("the corpus is too small");
    const context = [blockOf(second.value, "turn-context"), blockOf(third.value, "page-content")];
    const placed = [
      { needles: first.needles, tag: "page-content" as const },
      { needles: second.needles, tag: "turn-context" as const },
      { needles: third.needles, tag: "page-content" as const },
    ];
    expect(violationsOf(dialect, pointingAtNothing(), pointing(first.value, context), placed)).toEqual([]);
  });

  test("a summary of earlier turns is fenced history in a user turn, never part of the system prompt", () => {
    const plain = summarized(null);
    for (const { name, value, needles } of corpus) {
      if (typeof value !== "string") continue;
      const sent = summarized(value);
      expect(dialect.view(sent).system).toBe(instructions);
      const found = violationsOf(dialect, plain, sent, [{ needles, tag: "conversation-summary" }]);
      expect([name, found]).toEqual([name, []]);
    }
    expect(chasedBy(dialect, plain, summarized, "conversation-summary")).toEqual([]);
  });
});

describe("the dialect checks", () => {
  const messages = [{ role: "user" as const, text: "what is on this page" }];
  const plain = requestOf(messages, []);
  const [sample] = corpus;
  if (!sample) throw new Error("the corpus is empty");

  test("fail a dialect that writes the context into the system prompt", () => {
    const inSystem: Dialect = {
      name: "context in the system prompt",
      view: (request) => {
        const view = openai.view({ ...request, context: [] });
        return request.context.length
          ? { ...view, system: `${view.system}\n\n${JSON.stringify(request.context)}` }
          : view;
      },
    };
    const sent = requestOf(messages, [blockOf(sample.value, "turn-context")]);
    const found = violationsOf(inSystem, plain, sent, [{ needles: sample.needles, tag: "turn-context" }]);
    expect(found).toContain(rules.system);
    expect(found).toContain(rules.systemMoved);
  });

  test("fail a dialect whose fence is a fixed label, which a value can write", () => {
    const labelled: Dialect = {
      name: "a fixed label",
      view: (request) => {
        const view = openai.view({ ...request, context: [] });
        if (!request.context.length) return view;
        const body = request.context.map((block) => String(block.value)).join("\n");
        return { ...view, user: [...view.user, `<turn-context data>\n${body}\n</turn-context data>`] };
      },
    };
    const send = (value: string) => requestOf(messages, [blockOf(value, "turn-context")]);
    expect(violationsOf(labelled, plain, send("fine"), [{ needles: ["fine"], tag: "turn-context" }])).toEqual([]);
    expect(chasedBy(labelled, plain, send, "turn-context")).toContain(rules.outside);
  });

  test("fail a dialect that sends a marked value with the app's own", () => {
    const unmarked: Dialect = {
      name: "one fence for both",
      view: (request) =>
        openai.view({ ...request, context: request.context.map(({ untrusted: _untrusted, ...block }) => block) }),
    };
    const sent = requestOf(messages, [blockOf(sample.value, "page-content")]);
    const found = violationsOf(unmarked, plain, sent, [{ needles: sample.needles, tag: "page-content" }]);
    expect(found).toEqual([rules.kind]);
  });

  test("fail a dialect that sends a summary with the system role", () => {
    const asSystem: Dialect = {
      name: "a summary in the system role",
      view: (request) => {
        const view = openai.view({ ...request, messages: request.messages.filter((message) => !message.summary) });
        const notes = request.messages.flatMap((message) => (message.summary ? [message.text ?? ""] : []));
        return { ...view, system: [view.system, ...notes].join("\n\n") };
      },
    };
    const found = violationsOf(asSystem, summarized(null), summarized(sample.value as string), [
      { needles: sample.needles, tag: "conversation-summary" },
    ]);
    expect(found).toContain(rules.system);
  });

  test("cover every dialect in this folder", async () => {
    const files = [...new Bun.Glob("*.ts").scanSync(import.meta.dir)].filter(
      (file) => !/\.(test|fixture|instance)\.ts$/.test(file),
    );
    const found: string[] = [];
    for (const file of files) {
      const source = await Bun.file(path.join(import.meta.dir, file)).text();
      const at = source.indexOf("static requestBody(");
      if (at < 0) continue;
      found.push([...source.slice(0, at).matchAll(/export class (\w+)/g)].at(-1)?.[1] ?? file);
    }
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(found.sort(byName)).toEqual(dialects.map((dialect) => dialect.name).sort(byName));
  });
});
