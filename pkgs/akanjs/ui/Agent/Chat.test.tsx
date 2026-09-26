import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AgentRunner, ChatMessage, MessageAttachment, ToolCallRequest } from "use-agentic";

let lib: typeof import("use-agentic");
let DefaultChat: typeof import("./Chat").DefaultChat;
let Chat: typeof import("./Chat").default;
let Guide: typeof import("./Guide").Guide;
let UiOverrideProvider: typeof import("../UiOverride").UiOverrideProvider;

const runtimeFetch: Record<string, unknown> = {};

const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});

/**
 * Imported after the environment is set, not before: `./Chat` reaches the `akanjs/store` barrel, whose `baseSt`
 * calls `getEnv()` while the module is still evaluating. Same pattern as Dock.test.ts.
 */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "chattest";
  process.env.AKAN_PUBLIC_REPO_NAME = "chattest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: runtimeFetch });
  const { FetchClient } = await import("akanjs/fetch");
  new FetchClient("http://chattest", {}, { task: { endpoint: {} } } as never);
  lib = await import("use-agentic");
  ({ DefaultChat, default: Chat } = await import("./Chat"));
  ({ Guide } = await import("./Guide"));
  ({ UiOverrideProvider } = await import("../UiOverride"));
});

/** The chat portals to the body, so the query scope is the body — and the host goes with the unmount. */
const mount = (node: ReactNode) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    container: document.body,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

type Turn = { text?: string; toolCall?: ToolCallRequest };
const scripted = (...turns: Turn[]): AgentRunner => {
  let index = 0;
  return {
    async *run() {
      const turn = turns[Math.min(index, turns.length - 1)];
      index += 1;
      if (turn.toolCall) {
        yield { type: "toolCall", ...turn.toolCall };
        yield { type: "done", stop: "toolUse" };
        return;
      }
      if (turn.text) yield { type: "text", delta: turn.text };
      yield { type: "done", stop: "end" };
    },
  };
};

const untilFlushed = async (done: () => boolean) => {
  for (let i = 0; i < 100 && !done(); i += 1) await Promise.resolve();
};

/** A transcript already in storage, which is how a test opens a chat on messages nothing had to run to produce. */
const stored = (...messages: ChatMessage[]) => ({
  load: () => messages,
  save: () => {},
  clear: () => {},
});

/** A turn slot that puts what it was handed where the DOM can be read, so a re-render cannot double-count it. */
const stepsSkin = {
  AgentSteps: ({ messages, isRunning }: { messages: readonly ChatMessage[]; isRunning: boolean }) => (
    <div data-running={isRunning ? "yes" : "no"} data-skin="steps">
      {messages.map((message, idx) => (
        <span key={idx}>{message.text ?? `[${message.role}]`}</span>
      ))}
    </div>
  ),
};

const turns = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-skin="steps"]')];

/**
 * happy-dom dispatch never reaches React's synthetic handlers, so the composer is driven through its props — and
 * they are re-read every time, because each keystroke renders a new closure over the draft.
 */
const composer = (container: HTMLElement) => {
  const field = () => container.querySelector<HTMLTextAreaElement>("textarea");
  const props = () => {
    const input = field();
    const key = Object.keys(input ?? {}).find((name) => name.startsWith("__reactProps$")) ?? "";
    return (input as unknown as Record<string, Record<string, (event: unknown) => void>>)[key];
  };
  return {
    value: () => field()?.value ?? "",
    type: (value: string) => act(() => props().onChange({ target: { value } })),
    // The caret is stated rather than read: the handler reads it to decide whether a vertical arrow belongs to
    // recall or to the textarea, and happy-dom does not track a selection through a props-driven keystroke.
    press: (key: string, options: { shiftKey?: boolean; caret?: number } = {}) =>
      act(() => {
        const value = field()?.value ?? "";
        const at = options.caret ?? value.length;
        props().onKeyDown({
          key,
          shiftKey: !!options.shiftKey,
          preventDefault: () => {},
          nativeEvent: {},
          currentTarget: { value, selectionStart: at, selectionEnd: at },
        });
      }),
    paste: (files: File[]) => act(() => props().onPaste({ clipboardData: { files }, preventDefault: () => {} })),
  };
};

/** A voice engine the test drives: `partial`/`say` are what a real engine's recognition callbacks do. */
const voiceOf = () => {
  const spoken: string[] = [];
  let handlers: {
    onInterim?: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (message: string) => void;
  } | null = null;
  return {
    spoken,
    listening: () => !!handlers,
    partial: (text: string) => handlers?.onInterim?.(text),
    say: (text: string) => handlers?.onFinal(text),
    fail: (message: string) => handlers?.onError(message),
    engine: {
      listen: (given: NonNullable<typeof handlers>) => {
        handlers = given;
        return {
          stop: () => {
            handlers = null;
          },
        };
      },
      speak: (text: string) => {
        spoken.push(text);
        return { cancel: () => {}, done: Promise.resolve() };
      },
    },
  };
};

const menuRows = (container: HTMLElement) =>
  [...container.querySelectorAll("button")]
    .map((button) => button.textContent ?? "")
    .filter((text) => text.startsWith("/"));

describe("Agent.Chat", () => {
  test("opens from the launcher into the composer", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat />
      </lib.AgentProvider>,
    );
    const launcher = container.querySelector<HTMLButtonElement>('button[aria-label="base.agent"]');
    expect(launcher).toBeTruthy();
    // data-agent-ui is what keeps the chat out of readScreen.
    expect(launcher?.hasAttribute("data-agent-ui")).toBe(true);
    expect(container.innerHTML).not.toContain("base.agentPlaceholder");
    act(() => launcher?.click());
    expect(container.innerHTML).toContain("base.agentPlaceholder");
    expect(container.innerHTML).toContain("base.agentIntro");
    expect(container.querySelector("aside")?.hasAttribute("data-agent-ui")).toBe(true);
    unmount();
  });

  test("opens from the platform shortcut and shows it on the launcher", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat />
      </lib.AgentProvider>,
    );
    const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    expect(container.querySelector("kbd")?.textContent).toBe(apple ? "⌘L" : "Ctrl+L");
    expect(container.querySelector("button")?.getAttribute("aria-keyshortcuts")).toBe(apple ? "Meta+L" : "Control+L");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true }));
    });
    expect(container.innerHTML).not.toContain("base.agentPlaceholder");
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "l",
          metaKey: apple,
          ctrlKey: !apple,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(container.innerHTML).toContain("base.agentPlaceholder");
    unmount();
  });

  test("renders the transcript the session accumulates", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "All done." }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("fill the form");
    });
    expect(container.innerHTML).toContain("fill the form");
    expect(container.innerHTML).toContain("All done.");
    unmount();
  });

  test("gates a confirmed tool behind the approval card and runs it on approve", async () => {
    let ran = 0;
    const surface = new lib.AgenticSurface();
    surface.registerTool([], {
      name: "removeThing",
      confirm: true,
      run: () => {
        ran += 1;
      },
    });
    const session = new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "removeThing", args: {} } }, { text: "Removed." }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    let sendDone: Promise<void> = Promise.resolve();
    await act(async () => {
      sendDone = session.send("remove it");
      await untilFlushed(() => !!session.pendingApproval);
    });
    expect(ran).toBe(0);
    expect(container.innerHTML).toContain("Run removeThing?");
    const approve = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("base.approve"));
    expect(approve).toBeTruthy();
    await act(async () => {
      approve?.click();
      await sendDone;
    });
    expect(ran).toBe(1);
    expect(container.innerHTML).toContain("Removed.");
    expect(container.innerHTML).not.toContain("base.approve");
    unmount();
  });

  test("asks the user through the question card and hands the pick back as the tool result", async () => {
    const session = new lib.AgentSession(
      new lib.AgenticSurface(),
      scripted(
        { toolCall: { id: "q1", name: "askUser", args: { question: "Which theme?", choices: ["Dark", "Light"] } } },
        { text: "Applied." },
      ),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    let sendDone: Promise<void> = Promise.resolve();
    await act(async () => {
      sendDone = session.send("set the theme");
      await untilFlushed(() => !!session.pendingQuestion);
    });
    // The card holds the question while it is pending, so the text is on screen once, not twice.
    expect(container.innerHTML.split("Which theme?").length - 1).toBe(1);
    const dark = [...container.querySelectorAll("button")].find((button) => button.textContent === "Dark");
    expect(dark).toBeTruthy();
    await act(async () => {
      dark?.click();
      await sendDone;
    });
    expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].result).toBe("Dark");
    // A settled ask reads as the exchange it was, so the tool's name never surfaces as a row.
    expect(container.innerHTML).not.toContain("askUser");
    expect(container.innerHTML).toContain("Which theme?");
    expect(container.innerHTML).toContain("Applied.");
    unmount();
  });

  test("a question with no choices is answered in the card's own input", async () => {
    const session = new lib.AgentSession(
      new lib.AgenticSurface(),
      scripted(
        { toolCall: { id: "q1", name: "askUser", args: { question: "What should I name it?" } } },
        { text: "Named." },
      ),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    let sendDone: Promise<void> = Promise.resolve();
    await act(async () => {
      sendDone = session.send("name the draft");
      await untilFlushed(() => !!session.pendingQuestion);
    });
    // One input, not two: the card holds the picks and the composer is the free-text answer.
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    const input = container.querySelector('textarea[placeholder="base.agentAnswer"]');
    const propsKey = Object.keys(input ?? {}).find((key) => key.startsWith("__reactProps$")) ?? "";
    const props = (input as unknown as Record<string, { onChange: (event: unknown) => void }>)[propsKey];
    act(() => props.onChange({ target: { value: "Spring plan" } }));
    const send = [...container.querySelectorAll("button")].find((button) => button.textContent === "base.send");
    await act(async () => {
      send?.click();
      await sendDone;
    });
    expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].result).toBe("Spring plan");
    expect(container.innerHTML).toContain("Named.");
    unmount();
  });

  test("a multi-pick question confirms the whole selection at once", async () => {
    const session = new lib.AgentSession(
      new lib.AgenticSurface(),
      scripted(
        {
          toolCall: {
            id: "q1",
            name: "askUser",
            args: { question: "Which columns?", choices: ["Name", "Status", "Owner"], multiple: true },
          },
        },
        { text: "Shown." },
      ),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    let sendDone: Promise<void> = Promise.resolve();
    await act(async () => {
      sendDone = session.send("choose columns");
      await untilFlushed(() => !!session.pendingQuestion);
    });
    const pick = (label: string) =>
      [...container.querySelectorAll("button")].find((button) => button.textContent === label);
    act(() => pick("Name")?.click());
    act(() => pick("Owner")?.click());
    await act(async () => {
      pick("base.ok")?.click();
      await sendDone;
    });
    expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].result).toEqual([
      "Name",
      "Owner",
    ]);
    expect(container.innerHTML).toContain("Shown.");
    unmount();
  });

  test("shows one row per tool call, resolved in place instead of repeated as a result", async () => {
    const surface = new lib.AgenticSurface();
    surface.registerTool([], { name: "searchDocs", run: () => [{ href: "/docs/core/routing" }] });
    const session = new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "searchDocs", args: { query: "routing" } } }, { text: "Found it." }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("find the routing docs");
    });
    // The call and its result are two wire messages — the model needs both — and one row on screen.
    expect(session.messages.filter((message) => message.toolCalls?.length || message.toolResults?.length)).toHaveLength(
      2,
    );
    expect(container.innerHTML.split("searchDocs").length - 1).toBe(1);
    expect(container.innerHTML).toContain("✓");
    // Two calls of one tool differ only by their arguments, so the row carries them.
    expect(container.innerHTML).toContain("routing");
    expect(container.innerHTML).toContain("Found it.");
    unmount();
  });

  test("a slow tool says what it is doing on its own row until it resolves", async () => {
    const surface = new lib.AgenticSurface();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    surface.registerTool([], {
      name: "uploadImages",
      run: async () => {
        lib.AgentProgress.report("resizing", { done: 1, total: 3 });
        await held;
        return "uploaded";
      },
    });
    const session = new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "uploadImages", args: { count: 3 } } }, { text: "Uploaded." }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    let sendDone: Promise<void> = Promise.resolve();
    await act(async () => {
      sendDone = session.send("upload the images");
      await untilFlushed(() => !!session.progress);
    });
    expect(container.innerHTML).toContain("resizing");
    expect(container.innerHTML).toContain("1/3");
    await act(async () => {
      release();
      await sendDone;
    });
    // The report is for the wait: once the row resolves it goes back to naming the call.
    expect(container.innerHTML).not.toContain("resizing");
    expect(container.innerHTML).toContain("uploadImages");
    expect(container.innerHTML).toContain("Uploaded.");
    unmount();
  });

  test("a mounted Guide layers its text into the turn's instructions", async () => {
    const requests: { instructions?: string }[] = [];
    const runner: AgentRunner = {
      async *run(request) {
        requests.push({ instructions: request.instructions });
        yield { type: "text", delta: "ok" };
        yield { type: "done", stop: "end" };
      },
    };
    const session = new lib.AgentSession(new lib.AgenticSurface(), runner, { instructions: "App framing." });
    const { unmount } = mount(
      <lib.AgentProvider session={session}>
        <Guide instructions="This subtree edits the weekly plan." />
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("hi");
    });
    expect(requests[0].instructions).toBe("App framing.\n\nThis subtree edits the weekly plan.");
    unmount();
  });

  test("resolves an _overrides AgentChat slot in place of the default", () => {
    const Branded = ({ title }: { title?: string }) => <div data-skin="brand">{title ?? "branded"}</div>;
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <UiOverrideProvider value={{ AgentChat: Branded }}>
          <Chat title="HELLO" />
        </UiOverrideProvider>
      </lib.AgentProvider>,
    );
    expect(container.innerHTML).toContain('data-skin="brand"');
    expect(container.innerHTML).toContain("HELLO");
    expect(container.querySelector('button[aria-label="base.agent"]')).toBeNull();
    unmount();
  });

  test("takes the open state from the props when the app drives it, and asks before changing it", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const asked: boolean[] = [];
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat onOpenChange={(next) => asked.push(next)} open={false} />
      </lib.AgentProvider>,
    );
    const launcher = document.body.querySelector<HTMLButtonElement>('button[aria-label="base.agent"]');
    act(() => launcher?.click());
    // The panel stays closed because the prop still says closed: the app owns the state, and only heard the ask.
    expect(asked).toEqual([true]);
    expect(document.body.querySelector("aside")).toBeNull();
    unmount();
    expect(container).toBeDefined();
  });

  test("draws no launcher when the app says it has its own", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat launcher={false} />
      </lib.AgentProvider>,
    );
    expect(document.body.querySelector('button[aria-label="base.agent"]')).toBeNull();
    expect(document.body.querySelector("aside")).toBeNull();
    unmount();
  });

  test("renders the app's own intro and header controls in place of, and beside, the built-in ones", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen header={<span>HEADER</span>} intro={<span>STARTERS</span>} />
      </lib.AgentProvider>,
    );
    expect(container.innerHTML).toContain("STARTERS");
    expect(container.innerHTML).not.toContain("base.agentIntro");
    expect(container.querySelector("header")?.textContent).toContain("HEADER");
    unmount();
  });

  test("chrome={false} drops the whole header bar, leaving the transcript and composer", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat chrome={false} defaultOpen header={<span>HEADER</span>} inline />
      </lib.AgentProvider>,
    );
    expect(container.querySelector("header")).toBeNull();
    expect(container.innerHTML).not.toContain("HEADER");
    expect(container.querySelector("textarea")).not.toBeNull();
    unmount();
  });

  test("a panel the app controls without listening draws no close button instead of an inert one", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat inline open />
      </lib.AgentProvider>,
    );
    expect(container.querySelector('button[aria-label="base.cancel"]')).toBeNull();
    unmount();
    const heard: boolean[] = [];
    const listening = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat inline onOpenChange={(next) => heard.push(next)} open />
      </lib.AgentProvider>,
    );
    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="base.cancel"]');
    act(() => close?.click());
    expect(heard).toEqual([false]);
    listening.unmount();
  });

  test("defaultDraft opens with the composer already written in, and sends nothing on its own", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultDraft="summarize this page" defaultOpen />
      </lib.AgentProvider>,
    );
    expect(container.querySelector("textarea")?.value).toBe("summarize this page");
    expect(session.messages).toEqual([]);
    unmount();
  });

  test("Shift+Enter writes a newline instead of sending, and the arrows then belong to the textarea", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("first ask");
    await act(async () => {
      input.press("Enter");
    });
    input.type("line one");
    input.press("Enter", { shiftKey: true });
    // Nothing was sent, and the draft is still the user's to finish.
    expect(input.value()).toBe("line one");
    input.type("line one\nline two");
    // A caret on the second line: the arrow moves within the text, so recall may not take it.
    input.press("ArrowUp");
    expect(input.value()).toBe("line one\nline two");
    // On the first line it is recall's again.
    input.press("ArrowUp", { caret: 3 });
    expect(input.value()).toBe("first ask");
    unmount();
  });

  test("resolves a part slot, so a skin replaces the transcript without replacing the loop", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "done" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <UiOverrideProvider value={{ AgentBubble: ({ message }) => <p data-skin="bubble">{message.text}</p> }}>
          <DefaultChat defaultOpen />
        </UiOverrideProvider>
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("ask");
    });
    expect(container.innerHTML).toContain('data-skin="bubble"');
    expect(container.innerHTML).toContain("ask");
    // The composer, the launcher and the loop are the default's still: one slot replaced one part.
    expect(container.innerHTML).toContain("base.agentPlaceholder");
    unmount();
  });

  test("hands one agent turn to the AgentSteps slot, and leaves the user's own messages beside it", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }), {
      history: stored(
        { role: "assistant", text: "Earlier they asked about routing.", summary: true },
        { role: "user", text: "find it" },
        { role: "assistant", text: "Looking.", toolCalls: [{ id: "c1", name: "searchDocs", args: {} }] },
        { role: "tool", toolResults: [{ id: "c1", name: "searchDocs", result: "ok" }] },
        { role: "assistant", text: "Found it." },
        { role: "user", text: "thanks" },
        { role: "assistant", text: "Any time." },
      ),
    });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <UiOverrideProvider value={stepsSkin}>
          <DefaultChat defaultOpen />
        </UiOverrideProvider>
      </lib.AgentProvider>,
    );
    // Three turns: a transcript whose head is a compaction summary opens one without a user message to start it,
    // and the tool message is in none of them — its result is already drawn by the call row that claims it.
    expect(turns(container).map((turn) => [...turn.children].map((step) => step.textContent))).toEqual([
      ["Earlier they asked about routing."],
      ["Looking.", "Found it."],
      ["Any time."],
    ]);
    // The user's own messages are not in a turn, and the rest of the panel is the default's still.
    expect(container.innerHTML).toContain("find it");
    expect(container.innerHTML).toContain("thanks");
    expect(container.innerHTML).toContain("base.agentPlaceholder");
    unmount();
  });

  test("marks only the turn that is still running, and stops marking it once the turn settles", async () => {
    const gates = [0, 1].map(() => {
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { held, release };
    });
    let started = 0;
    const runner: AgentRunner = {
      async *run() {
        const gate = gates[Math.min(started, gates.length - 1)];
        started += 1;
        yield { type: "text", delta: `turn ${started}` };
        await gate.held;
        yield { type: "done", stop: "end" };
      },
    };
    const session = new lib.AgentSession(new lib.AgenticSurface(), runner);
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <UiOverrideProvider value={stepsSkin}>
          <DefaultChat defaultOpen />
        </UiOverrideProvider>
      </lib.AgentProvider>,
    );
    const running = () => turns(container).map((turn) => turn.getAttribute("data-running"));
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = session.send("first");
      await untilFlushed(() => session.messages.some((message) => message.text === "turn 1"));
    });
    expect(running()).toEqual(["yes"]);
    await act(async () => {
      gates[0].release();
      await first;
    });
    expect(running()).toEqual(["no"]);
    let second: Promise<void> = Promise.resolve();
    await act(async () => {
      second = session.send("second");
      await untilFlushed(() => session.messages.some((message) => message.text === "turn 2"));
    });
    // The turn that settled stays settled: only the last one is the one the session is working on.
    expect(running()).toEqual(["no", "yes"]);
    await act(async () => {
      gates[1].release();
      await second;
    });
    expect(running()).toEqual(["no", "no"]);
    unmount();
  });

  test("the default turn draws the same flat bubbles, adding no element of its own", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }), {
      history: stored(
        { role: "user", text: "ask" },
        { role: "assistant", text: "Working." },
        { role: "assistant", text: "Done." },
      ),
    });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    // One transcript child per message, exactly as before a turn was a group: the default is a Fragment, not a box.
    const log = container.querySelector('[role="log"]');
    expect([...(log?.children ?? [])].map((child) => child.textContent)).toEqual(["ask", "Working.", "Done."]);
    unmount();
  });

  test("groups a restored transcript by the same boundary, with the turn folded to one assistant message", () => {
    // What a host storing rows of its own hands back: the calls are folded into the assistant's text, so a
    // restored turn is assistant text and nothing else. The boundary is the user message either way.
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }), {
      history: stored(
        { role: "user", text: "find it" },
        { role: "assistant", text: "Found it.\n\n[called: searchDocs]" },
        { role: "user", text: "thanks" },
        { role: "assistant", text: "Any time." },
      ),
    });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <UiOverrideProvider value={stepsSkin}>
          <DefaultChat defaultOpen />
        </UiOverrideProvider>
      </lib.AgentProvider>,
    );
    const groups = turns(container);
    expect(groups.map((turn) => turn.children.length)).toEqual([1, 1]);
    expect(groups[0]?.textContent).toContain("[called: searchDocs]");
    expect(groups[1]?.textContent).toContain("Any time.");
    unmount();
  });

  test("hands a fenced block to the AgentCode slot with the language the fence named", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "```ts\nconst x = 1;\n```" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <UiOverrideProvider
          value={{ AgentCode: ({ lang, text }) => <pre data-skin={`code-${lang ?? "none"}`}>{text}</pre> }}
        >
          <DefaultChat defaultOpen />
        </UiOverrideProvider>
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("show me");
    });
    expect(container.innerHTML).toContain('data-skin="code-ts"');
    expect(container.innerHTML).toContain("const x = 1;");
    unmount();
  });

  test("leaves the page subtree for the overlay layer, and stays in flow when inline", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const render = (node: ReactNode) => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      act(() => root.render(node));
      return {
        host,
        drop: () => {
          act(() => root.unmount());
          host.remove();
        },
      };
    };
    const floating = render(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    // Dialog's modal portals to the body, so a z-index declared under `#pageContainers` (isolation: isolate)
    // could never beat it — the chat has to leave the page subtree, not merely outrank the modal.
    expect(floating.host.querySelector("aside")).toBeNull();
    expect(document.body.querySelector("aside")?.className).toContain("z-[150]");
    floating.drop();

    const inline = render(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen inline />
      </lib.AgentProvider>,
    );
    expect(inline.host.querySelector("aside")?.className).not.toContain("fixed");
    inline.drop();
  });

  test("the / menu offers this chat's own commands", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    composer(container).type("/");
    const rows = menuRows(container);
    expect(rows.map((row) => row.split("base.")[0])).toEqual([
      "/new",
      "/retry",
      "/compact",
      "/copy",
      "/help",
      "/tools",
    ]);
    unmount();
  });

  test("/new empties a transcript that is still running", async () => {
    const session = new lib.AgentSession(
      new lib.AgenticSurface(),
      scripted({ toolCall: { id: "c1", name: "unknown", args: {} } }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("do a thing");
    });
    expect(container.innerHTML).toContain("do a thing");
    const input = composer(container);
    input.type("/new");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.messages.length === 0);
    });
    expect(session.messages).toEqual([]);
    expect(container.innerHTML).toContain("base.agentIntro");
    unmount();
  });

  test("the vertical arrows walk back through what was sent and forward again", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "sure" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    for (const text of ["first ask", "second ask"]) {
      input.type(text);
      await act(async () => {
        input.press("Enter");
        await untilFlushed(() => !session.isRunning);
      });
    }
    input.type("half-written");
    input.press("ArrowUp");
    expect(input.value()).toBe("second ask");
    input.press("ArrowUp");
    expect(input.value()).toBe("first ask");
    input.press("ArrowUp");
    expect(input.value()).toBe("first ask");
    input.press("ArrowDown");
    expect(input.value()).toBe("second ask");
    // Back at the bottom the draft that was walked away from is still there.
    input.press("ArrowDown");
    expect(input.value()).toBe("half-written");
    unmount();
  });
  test("/compact folds the transcript into one summary the transcript renders as its own block", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "notes about it all" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("summarize this");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning);
    });
    input.type("/compact");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.messages.some((message) => message.summary));
    });
    expect(container.innerHTML).toContain("base.agentSummary");
    expect(container.innerHTML).toContain("base.agentCompacted");
    // The summary is not a user bubble: it stands in for the exchange above it, which is gone.
    expect(container.innerHTML).not.toContain("summarize this");
    unmount();
  });

  test("a settled tool row opens onto what the tool returned, with its token cost on the line", async () => {
    const surface = new lib.AgenticSurface();
    surface.registerTool([], { name: "readState", run: () => ({ rows: ["alpha", "beta"] }) });
    const session = new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "readState", args: { key: "rowsInList" } } }, { text: "Two rows." }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("read the rows");
    });
    const row = [...container.querySelectorAll("details")].find((one) => one.textContent?.includes("readState"));
    // The value the model was handed is the one thing a transcript never showed, and it is what fills a window.
    expect(row?.querySelector("pre")?.textContent).toContain("alpha");
    expect(row?.textContent).toContain("base.agentTokens");
    // The header measures against the point it compacts at, which the default ceiling always gives it.
    expect(container.querySelector("header")?.textContent).toContain("base.agentTokensOf");
    unmount();
  });

  test("the transcript says it is summarizing while the summary is being written", async () => {
    let release: ((summary: string) => void) | null = null;
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }), {
      compact: { summarize: () => new Promise<string>((resolve) => (release = resolve)) },
    });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("something to summarize");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning);
    });
    input.type("/compact");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.isCompacting);
    });
    expect(container.innerHTML).toContain("base.agentSummarizing");
    await act(async () => {
      release?.("notes");
      await untilFlushed(() => !session.isCompacting);
    });
    expect(container.innerHTML).not.toContain("base.agentSummarizing");
    unmount();
  });

  test("a pasted file is staged as a chip and rides the message it is sent with", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "a chart" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.paste([new File(["abc"], "q3.png", { type: "image/png" })]);
      await untilFlushed(() => container.innerHTML.includes("q3.png"));
    });
    expect(container.innerHTML).toContain("q3.png");
    input.type("what does this say?");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(session.messages[0]).toEqual({
      role: "user",
      text: "what does this say?",
      attachments: [{ name: "q3.png", mimeType: "image/png", data: btoa("abc") }],
    });
    // Staged files leave with the draft, so the next turn cannot re-send them.
    expect(container.querySelector('button[aria-label="base.agentAttachRemove"]')).toBeNull();
    unmount();
  });

  test("a file no built-in reader handles is named in the transcript instead of staged", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      composer(container).paste([new File(["%PDF"], "spec.pdf", { type: "application/pdf" })]);
      await untilFlushed(() => session.messages.length > 0);
    });
    expect(session.messages[0]).toEqual({
      role: "assistant",
      text: "base.agentAttachUnsupported",
      local: true,
    });
    expect(container.querySelector('button[aria-label="base.agentAttachRemove"]')).toBeNull();
    unmount();
  });

  test("a chip for an attachment naming no type renders its name instead of taking the transcript down", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      void session.send([
        {
          role: "user",
          text: "what is this?",
          attachments: [{ name: "photo.heic", mimeType: null as unknown as string, data: btoa("abc") }],
        },
      ]);
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(container.innerHTML).toContain("photo.heic");
    unmount();
  });

  test("an image attached by address renders its thumbnail, the shape a reader that uploads produces", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      void session.send([
        {
          role: "user",
          text: "what is this?",
          attachments: [{ name: "hero.jpg", mimeType: "image/jpeg", url: "https://cdn/hero.jpg", ref: "file_7" }],
        },
      ]);
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(container.querySelector('img[src="https://cdn/hero.jpg"]')).not.toBeNull();
    unmount();
  });

  test("the app's own reader is what makes a pdf attachable, and runs ahead of the built-in", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "read it" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat
          attach={async (file) => ({ name: file.name, mimeType: "application/pdf", text: "page one" })}
          defaultOpen
        />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.paste([new File(["%PDF"], "spec.pdf", { type: "application/pdf" })]);
      await untilFlushed(() => container.innerHTML.includes("spec.pdf"));
    });
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(session.messages[0]).toEqual({
      role: "user",
      attachments: [{ name: "spec.pdf", mimeType: "application/pdf", text: "page one" }],
    });
    unmount();
  });
  test("a reader that takes its time says so, instead of leaving the panel blank", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "read it" }));
    let finish: (value: MessageAttachment | null) => void = () => undefined;
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat
          attach={() =>
            new Promise((resolve) => {
              finish = resolve;
            })
          }
          defaultOpen
        />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.paste([new File(["%PDF"], "spec.pdf", { type: "application/pdf" })]);
      await untilFlushed(() => container.innerHTML.includes("base.agentAttachReading"));
    });
    // The upload an `attach` performs is seconds long, and the chip for it cannot exist until it resolves.
    expect(container.innerHTML).not.toContain("spec.pdf");
    await act(async () => {
      finish({ name: "spec.pdf", mimeType: "application/pdf", text: "page one" });
      await untilFlushed(() => container.innerHTML.includes("spec.pdf"));
    });
    expect(container.innerHTML).not.toContain("base.agentAttachReading");
    unmount();
  });

  test("the microphone fills the composer, and a spoken ask is answered out loud", async () => {
    const voice = voiceOf();
    const session = new lib.AgentSession(
      new lib.AgenticSurface(),
      scripted({ text: "Two sentences. Here is the second." }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen voice={voice.engine} />
      </lib.AgentProvider>,
    );
    const mic = container.querySelector<HTMLButtonElement>('button[aria-label="base.agentListen"]');
    expect(mic).toBeTruthy();
    act(() => mic?.click());
    expect(voice.listening()).toBe(true);
    act(() => voice.partial("show me"));
    expect(composer(container).value()).toBe("show me");
    act(() => voice.say("show me the tasks"));
    expect(composer(container).value()).toBe("show me the tasks");
    // Recognition ended with the final result, so the button is offering to listen again.
    expect(voice.listening()).toBe(false);
    await act(async () => {
      composer(container).press("Enter");
      await untilFlushed(() => !session.isRunning && voice.spoken.length >= 2);
    });
    // One utterance per sentence, never per delta and never the whole answer at once.
    expect(voice.spoken).toEqual(["Two sentences.", "Here is the second."]);
    unmount();
  });

  test("a typed ask is never read aloud", async () => {
    const voice = voiceOf();
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "Answered." }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen voice={voice.engine} />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("show me the tasks");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning);
    });
    expect(container.innerHTML).toContain("Answered.");
    expect(voice.spoken).toEqual([]);
    unmount();
  });

  test("a failed microphone says so in the transcript and stops listening", () => {
    const voice = voiceOf();
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen voice={voice.engine} />
      </lib.AgentProvider>,
    );
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="base.agentListen"]')?.click());
    act(() => voice.fail("not-allowed"));
    expect(session.messages[0]).toEqual({ role: "assistant", text: "base.agentVoiceFailed", local: true });
    expect(voice.listening()).toBe(false);
    unmount();
  });

  test("no engine, or one that answers unavailable, renders no microphone", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const silent = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    expect(silent.container.querySelector('button[aria-label="base.agentListen"]')).toBeNull();
    silent.unmount();
    const voice = voiceOf();
    const unavailable = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen voice={{ ...voice.engine, available: () => false }} />
      </lib.AgentProvider>,
    );
    expect(unavailable.container.querySelector('button[aria-label="base.agentListen"]')).toBeNull();
    unavailable.unmount();
  });

  test("a slash command typed while the agent is asking a question is the command, not the answer", async () => {
    const surface = new lib.AgenticSurface();
    const session = new lib.AgentSession(surface, {
      async *run() {
        yield { type: "toolCall", id: "q1", name: "askUser", args: { question: "Which one?" } };
        yield { type: "done", stop: "toolUse" };
      },
    });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await act(async () => {
      void session.send("pick something");
      await untilFlushed(() => !!session.pendingQuestion);
    });
    const input = composer(container);
    input.type("/new");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.messages.length === 0);
    });
    // Answered as text, "/new" would have gone to the model as the user's decision instead of clearing the chat.
    expect(session.messages).toEqual([]);
    expect(session.pendingQuestion).toBeNull();
    unmount();
  });

  test("the / menu takes the arrows, Tab completes a name, and Enter picks what is highlighted", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("/");
    const selected = () => container.querySelector('[aria-selected="true"]')?.textContent ?? "";
    expect(selected().startsWith("/new")).toBe(true);
    input.press("ArrowDown");
    expect(selected().startsWith("/retry")).toBe(true);
    input.press("ArrowUp");
    expect(selected().startsWith("/new")).toBe(true);
    input.press("Tab");
    expect(input.value()).toBe("/new ");
    input.type("/help");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.messages.length > 0);
    });
    expect(container.innerHTML).toContain("base.agentHelpIntro");
    unmount();
  });

  test("Escape closes the menu first and the panel second", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("/");
    expect(container.querySelector('[role="option"]')).toBeTruthy();
    input.press("Escape");
    expect(container.querySelector('[role="option"]')).toBeNull();
    // The draft is untouched: dismissing the menu is not dismissing what was being typed.
    expect(input.value()).toBe("/");
    input.press("Escape");
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector('button[aria-label="base.agent"]')).toBeTruthy();
    unmount();
  });

  test("the same file is not staged twice, and a message holds no more than the ceiling", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    const shot = (name: string) => new File(["abc"], name, { type: "image/png" });
    const chips = () => container.querySelectorAll('button[aria-label="base.agentAttachRemove"]').length;
    await act(async () => {
      input.paste([shot("a.png"), shot("b.png")]);
      await untilFlushed(() => chips() === 2);
    });
    await act(async () => {
      input.paste([shot("a.png")]);
      await untilFlushed(() => session.messages.length > 0);
    });
    expect(session.messages[0]?.text).toBe("base.agentAttachDuplicate");
    expect(chips()).toBe(2);
    await act(async () => {
      input.paste([shot("c.png"), shot("d.png"), shot("e.png"), shot("f.png")]);
      await untilFlushed(() => session.messages.length > 1);
    });
    // The cap is the message's, so the fifth file is staged and the sixth is refused by name.
    expect(chips()).toBe(5);
    expect(session.messages[1]?.text).toBe("base.agentAttachTooMany");
    unmount();
  });

  test("attachments cannot answer a question on their own, and the ask says so", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), {
      async *run() {
        yield { type: "toolCall", id: "q1", name: "askUser", args: { question: "Which one?" } };
        yield { type: "done", stop: "toolUse" };
      },
    });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.paste([new File(["abc"], "q3.png", { type: "image/png" })]);
      await untilFlushed(() => container.innerHTML.includes("q3.png"));
    });
    await act(async () => {
      void session.send("pick something");
      await untilFlushed(() => !!session.pendingQuestion);
    });
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.messages.some((message) => message.text === "base.agentAnswerNeeded"));
    });
    expect(session.pendingQuestion).toBeTruthy();
    await act(async () => {
      session.pendingQuestion?.dismiss();
      await untilFlushed(() => !session.isRunning);
    });
    unmount();
  });

  test("a closed panel counts what arrived while it was closed", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "answered" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat />
      </lib.AgentProvider>,
    );
    await act(async () => {
      await session.send("while I look elsewhere");
    });
    const launcher = container.querySelector('button[aria-haspopup="dialog"]');
    expect(launcher?.getAttribute("aria-label")).toBe("base.agent (2)");
    act(() => (launcher as HTMLButtonElement | null)?.click());
    expect(container.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
    unmount();
  });

  test("a session this chat made ends with it, so no turn drives a screen that is gone", async () => {
    const turn: { signal?: AbortSignal } = {};
    let finishTurn: () => void = () => undefined;
    const { container, unmount } = mount(
      <DefaultChat
        defaultOpen
        runner={{
          async *run(request) {
            turn.signal = request.signal;
            await new Promise<void>((resolve) => {
              finishTurn = resolve;
            });
            yield { type: "done", stop: "end" };
          },
        }}
      />,
    );
    const input = composer(container);
    input.type("go");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !!turn.signal);
    });
    expect(turn.signal?.aborted).toBe(false);
    unmount();
    // Aborted by the unmount rather than left running against a screen whose approvals nobody renders.
    expect(turn.signal?.aborted).toBe(true);
    await act(async () => {
      finishTurn();
      await untilFlushed(() => false);
    });
  });

  /** A turn that stays running until `release` — what a parked message has to wait behind. */
  const runningTurn = (...after: Turn[]) => {
    const surface = new lib.AgenticSurface();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    surface.registerTool([], {
      name: "wait",
      run: async () => {
        await held;
        return "waited";
      },
    });
    const session = new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "wait", args: {} } }, ...after),
    );
    return { session, release: () => release() };
  };
  const parked = (container: HTMLElement) => container.querySelector('[aria-label="base.agentQueued"]');
  const labeled = (container: HTMLElement, label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const captioned = (container: HTMLElement, text: string) =>
    [...container.querySelectorAll("button")].find((button) => button.textContent === text);
  /**
   * Opens the held turn and waits until its tool is the thing the loop is parked on. The turn's own promise comes
   * back wrapped: returned bare from an async function it would be adopted, and awaited until the release it waits for.
   */
  const openHeldTurn = async (session: InstanceType<typeof lib.AgentSession>) => {
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = session.send("do the first thing");
      await untilFlushed(() => session.messages.length >= 2);
    });
    return { first };
  };

  test("Enter during a turn parks the message and sends it the moment the turn ends", async () => {
    const { session, release } = runningTurn({ text: "First done." }, { text: "Second done." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const { first } = await openHeldTurn(session);
    const input = composer(container);
    expect(container.innerHTML).toContain("base.agentQueuePlaceholder");
    input.type("then the second");
    // The composer offers to park rather than to send while the turn runs, and Stop stays where it was.
    expect(captioned(container, "base.agentQueue")).toBeTruthy();
    expect(captioned(container, "base.stop")).toBeTruthy();
    input.press("Enter");
    expect(input.value()).toBe("");
    expect(parked(container)?.textContent).toContain("then the second");
    expect(session.messages.some((message) => message.text === "then the second")).toBe(false);
    await act(async () => {
      release();
      await first;
    });
    await act(async () => {
      await untilFlushed(() => !session.isRunning && session.messages.length >= 6);
    });
    expect(parked(container)).toBeNull();
    expect(session.messages[4]).toEqual({ role: "user", text: "then the second" });
    expect(container.innerHTML).toContain("Second done.");
    unmount();
  });

  test("a second send while one is parked joins it, so the model is handed one message", async () => {
    const { session, release } = runningTurn({ text: "First done." }, { text: "Second done." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const { first } = await openHeldTurn(session);
    const input = composer(container);
    input.type("then the second");
    input.press("Enter");
    input.type("and the third");
    act(() => captioned(container, "base.agentQueue")?.click());
    expect(input.value()).toBe("");
    expect(parked(container)?.textContent).toContain("then the second");
    expect(parked(container)?.textContent).toContain("and the third");
    await act(async () => {
      release();
      await first;
    });
    await act(async () => {
      await untilFlushed(() => !session.isRunning && session.messages.length >= 6);
    });
    expect(session.messages[4]).toEqual({ role: "user", text: "then the second\nand the third" });
    unmount();
  });

  test("a parked message is dropped from its card, or taken back into the composer ahead of what was typed since", async () => {
    const { session, release } = runningTurn({ text: "First done." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const { first } = await openHeldTurn(session);
    const input = composer(container);
    input.type("then the second");
    input.press("Enter");
    act(() => labeled(container, "base.agentQueueCancel")?.click());
    expect(parked(container)).toBeNull();
    input.type("something else");
    input.press("Enter");
    input.type("and more");
    act(() => labeled(container, "base.agentQueueEdit")?.click());
    expect(parked(container)).toBeNull();
    expect(input.value()).toBe("something else\nand more");
    await act(async () => {
      release();
      await first;
    });
    await act(async () => {
      await untilFlushed(() => !session.isRunning);
    });
    // Neither reached the transcript, and the draft taken back is still there to be sent.
    expect(session.messages.filter((message) => message.role === "user")).toEqual([
      { role: "user", text: "do the first thing" },
    ]);
    expect(input.value()).toBe("something else\nand more");
    unmount();
  });

  test("Stop hands the parked message back to the composer instead of opening the next turn with it", async () => {
    const { session, release } = runningTurn({ text: "First done." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const { first } = await openHeldTurn(session);
    const input = composer(container);
    input.type("then the second");
    input.press("Enter");
    expect(parked(container)).toBeTruthy();
    await act(async () => {
      captioned(container, "base.stop")?.click();
      release();
      await first;
    });
    await act(async () => {
      await untilFlushed(() => !session.isRunning);
    });
    expect(parked(container)).toBeNull();
    expect(input.value()).toBe("then the second");
    expect(session.messages.filter((message) => message.role === "user")).toHaveLength(1);
    unmount();
  });

  test("/new drops the parked message along with the conversation it was written for", async () => {
    const { session, release } = runningTurn({ text: "First done." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    await openHeldTurn(session);
    const input = composer(container);
    input.type("then the second");
    input.press("Enter");
    expect(parked(container)).toBeTruthy();
    input.type("/new");
    await act(async () => {
      input.press("Enter");
      release();
      await untilFlushed(() => session.messages.length === 0 && !session.isRunning);
    });
    await act(async () => {
      await untilFlushed(() => false);
    });
    expect(parked(container)).toBeNull();
    expect(session.messages).toEqual([]);
    expect(input.value()).toBe("");
    unmount();
  });

  test("files staged with a parked message ride it, and come back to the composer with it", async () => {
    const { session, release } = runningTurn({ text: "First done." }, { text: "A chart." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const { first } = await openHeldTurn(session);
    const input = composer(container);
    await act(async () => {
      input.paste([new File(["abc"], "q3.png", { type: "image/png" })]);
      await untilFlushed(() => container.innerHTML.includes("q3.png"));
    });
    input.type("what does this say?");
    input.press("Enter");
    expect(parked(container)?.textContent).toContain("q3.png");
    expect(labeled(container, "base.agentAttachRemove")).toBeNull();
    act(() => labeled(container, "base.agentQueueEdit")?.click());
    expect(labeled(container, "base.agentAttachRemove")).toBeTruthy();
    expect(input.value()).toBe("what does this say?");
    input.press("Enter");
    await act(async () => {
      release();
      await first;
    });
    await act(async () => {
      await untilFlushed(() => !session.isRunning && session.messages.length >= 6);
    });
    expect(session.messages[4]).toEqual({
      role: "user",
      text: "what does this say?",
      attachments: [{ name: "q3.png", mimeType: "image/png", data: btoa("abc") }],
    });
    unmount();
  });

  test("a spoken ask parked behind a turn is the one answered out loud, and the earlier answer is not re-read", async () => {
    const voice = voiceOf();
    const { session, release } = runningTurn({ text: "First done." }, { text: "Second done." });
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen voice={voice.engine} />
      </lib.AgentProvider>,
    );
    const { first } = await openHeldTurn(session);
    act(() => labeled(container, "base.agentListen")?.click());
    act(() => voice.say("then the second"));
    composer(container).press("Enter");
    expect(parked(container)?.textContent).toContain("then the second");
    await act(async () => {
      release();
      await first;
    });
    await act(async () => {
      await untilFlushed(() => !session.isRunning && session.messages.length >= 6);
    });
    expect(voice.spoken).toEqual(["Second done."]);
    unmount();
  });
});

describe("Agent chat references", () => {
  const cut = (value: unknown, path = "cutFrames.2.content") => ({
    refName: "videoCut",
    refId: "6a1f",
    label: "Cut 3 body",
    path,
    value,
  });

  test("pointing from elsewhere on the page writes the token into the draft and draws a chip", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.type("make ");
      session.refer(cut("a wide shot"));
      await untilFlushed(() => input.value().includes("mention:"));
    });
    expect(input.value()).toBe("make @[Cut 3 body](mention:videoCut/6a1f#cutFrames.2.content) ");
    expect(container.innerHTML).toContain("Cut 3 body");
    unmount();
  });

  test("the sent message carries the reference, and the slot empties behind it", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      session.refer(cut("a wide shot"));
      await untilFlushed(() => input.value().includes("mention:"));
    });
    await act(async () => {
      input.type(`${input.value()}make it dynamic`);
    });
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(session.messages[0].text).toContain("make it dynamic");
    expect(session.messages[0].references).toEqual([cut("a wide shot")]);
    // What was pointed at belongs to the message it was pointed with, so the next turn cannot re-send it.
    expect(session.staged).toEqual([]);
    unmount();
  });

  test("deleting the token by hand drops the reference, because the text is what carries it", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      session.refer(cut("a wide shot"));
      await untilFlushed(() => input.value().includes("mention:"));
    });
    expect(container.innerHTML).toContain("Cut 3 body");
    await act(async () => {
      input.type("just the words");
      await untilFlushed(() => !container.innerHTML.includes("Cut 3 body"));
    });
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(session.messages[0].references).toBeUndefined();
    unmount();
  });

  test("removing the chip removes the token, so the two cannot disagree", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.type("make ");
      session.refer(cut("a wide shot"));
      await untilFlushed(() => input.value().includes("mention:"));
    });
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="base.agentReferenceRemove"]');
    if (!remove) throw new Error("expected a remove control on the chip");
    const props = Object.keys(remove).find((name) => name.startsWith("__reactProps$")) ?? "";
    await act(async () => {
      (remove as unknown as Record<string, { onClick: () => void }>)[props].onClick();
      await untilFlushed(() => !input.value().includes("mention:"));
    });
    expect(input.value()).toBe("make");
    expect(session.staged).toEqual([]);
    unmount();
  });

  test("a token pasted with no value behind it travels as a pointer that says to read it again", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    await act(async () => {
      input.type("fix @[Cut 3 body](mention:videoCut/6a1f#cutFrames.2.content) please");
    });
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
    });
    expect(session.messages[0].references).toEqual([
      {
        refName: "videoCut",
        refId: "6a1f",
        label: "Cut 3 body",
        path: "cutFrames.2.content",
        note: lib.Reference.unstagedNote,
      },
    ]);
    unmount();
  });
});

describe("Agent chat @ menu", () => {
  const source = (resolve: (id: string) => Promise<unknown>) => ({
    refName: "videoCharacter",
    label: "People",
    type: String,
    search: async (query: string) =>
      [{ refId: "c1", label: "Karina" }].filter((one) => one.label.toLowerCase().startsWith(query.toLowerCase())),
    resolve,
  });

  test("typing @ offers the app's own rows and picking one writes the token and stages the value", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen mentions={false} reference={[source(async () => "a dancer in a red coat")]} />
      </lib.AgentProvider>,
    );
    try {
      const input = composer(container);
      // Two acts, not one: a nested sync act inside an async one does not flush until the outer act exits, so a
      // sleep sharing the act with the keystroke waits out the debounce against the draft as it was before it.
      await act(async () => {
        input.type("compare @Kar");
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      // The row is drawn under its source's own heading, which is how two sources stay told apart.
      expect(container.innerHTML).toContain("People");
      await act(async () => {
        input.press("Enter");
        await untilFlushed(() => session.staged.length > 0);
      });
      expect(input.value()).toBe("compare @[Karina](mention:videoCharacter/c1) ");
      expect(session.staged[0].value).toBe("a dancer in a red coat");
      // The trailing space closes the query, so the menu cannot reopen onto the token it just wrote.
      expect(container.innerHTML).not.toContain("People");
    } finally {
      unmount();
    }
  });

  test("a resolve that fails leaves the pointer and says so, rather than a chip that means nothing", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen mentions={false} reference={[source(async () => Promise.reject(new Error("gone")))]} />
      </lib.AgentProvider>,
    );
    try {
      const input = composer(container);
      // Two acts, not one: a nested sync act inside an async one does not flush until the outer act exits, so a
      // sleep sharing the act with the keystroke waits out the debounce against the draft as it was before it.
      await act(async () => {
        input.type("compare @Kar");
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      await act(async () => {
        input.press("Enter");
        await untilFlushed(() => session.messages.length > 0);
      });
      expect(input.value()).toContain("mention:videoCharacter/c1");
      expect(session.staged).toEqual([]);
      expect(container.innerHTML).toContain("base.agentReferenceFailed");
    } finally {
      unmount();
    }
  });

  test("a chat given no sources keeps the @ key as an ordinary character", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    try {
      const input = composer(container);
      await act(async () => {
        input.type("mail me @kar");
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      await act(async () => {
        input.press("Enter");
        await untilFlushed(() => !session.isRunning && session.messages.length >= 2);
      });
      expect(session.messages[0].text).toBe("mail me @kar");
      expect(session.messages[0].references).toBeUndefined();
    } finally {
      unmount();
    }
  });
});

describe("Agent chat tool cards", () => {
  const contactSession = () => {
    const surface = new lib.AgenticSurface();
    surface.registerTool([], {
      name: "collectContact",
      description: "Ask the user for their name and phone number.",
      card: ({ submit, cancel }) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit({ name: "Bora" });
          }}
        >
          <input aria-label="name" defaultValue="Bora" />
          <button type="submit">Send it</button>
          <button onClick={() => cancel("Not now.")} type="button">
            Not now
          </button>
        </form>
      ),
    });
    return new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "collectContact", args: {} } }, { text: "Booked." }),
    );
  };

  test("renders the app's own card in the panel and sends what it submits back as the result", async () => {
    const session = contactSession();
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    try {
      let sendDone: Promise<void> = Promise.resolve();
      await act(async () => {
        sendDone = session.send("book me in");
        await untilFlushed(() => !!session.pendingCard);
      });
      expect(container.innerHTML).toContain("Send it");
      const submit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Send it");
      await act(async () => {
        submit?.click();
        await sendDone;
      });
      expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].result).toEqual({
        name: "Bora",
      });
      expect(container.innerHTML).not.toContain("Send it");
      expect(container.innerHTML).toContain("Booked.");
    } finally {
      unmount();
    }
  });

  // The frame draws it even when the card does not, so a turn can never park on something with no way out of it.
  test("the frame's own skip closes a card the app gave no way out of", async () => {
    const surface = new lib.AgenticSurface();
    surface.registerTool([], { name: "collectContact", description: "Ask for a contact.", card: () => <p>Name?</p> });
    const session = new lib.AgentSession(
      surface,
      scripted({ toolCall: { id: "c1", name: "collectContact", args: {} } }, { text: "Fine." }),
    );
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    try {
      let sendDone: Promise<void> = Promise.resolve();
      await act(async () => {
        sendDone = session.send("book me in");
        await untilFlushed(() => !!session.pendingCard);
      });
      const skip = [...container.querySelectorAll("button")].find((button) => button.textContent === "base.skip");
      expect(skip).toBeTruthy();
      await act(async () => {
        skip?.click();
        await sendDone;
      });
      expect(session.pendingCard).toBeNull();
      expect(session.messages.find((message) => message.role === "tool")?.toolResults?.[0].error).toContain(
        "without filling it in",
      );
    } finally {
      unmount();
    }
  });
});

describe("Agent chat mention pills", () => {
  const source = {
    refName: "videoCharacter",
    label: "People",
    type: String,
    search: async (query: string) =>
      [{ refId: "c1", label: "Karina" }].filter((one) => one.label.toLowerCase().startsWith(query.toLowerCase())),
    resolve: async () => "a dancer in a red coat",
  };
  const editorOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="textbox"]');
  const rowOf = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
  // The editor is a lazy chunk, and loading it is a module read that no fixed wait is sure to outlast.
  const untilDrawn = async (done: () => boolean) => {
    for (let i = 0; i < 300 && !done(); i += 1)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
  };

  // The whole point of the editor: the draft still carries the token — it is what puts the reference on the
  // message — and the person sees the name they picked.
  test("a picked pointer is drawn as the name it points at, never as the token that carries it", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultDraft="compare @Kar" defaultOpen reference={[source]} />
      </lib.AgentProvider>,
    );
    try {
      await untilDrawn(() => !!editorOf(container)?.textContent && !!rowOf(container, "Karina"));
      expect(editorOf(container)?.textContent).toBe("compare @Kar");
      const row = rowOf(container, "Karina");
      expect(row).toBeTruthy();
      await act(async () => {
        row?.click();
        await untilFlushed(() => session.staged.length > 0);
      });
      const editor = editorOf(container);
      expect(editor?.textContent).toBe("compare Karina ");
      expect(editor?.innerHTML).not.toContain("mention:");
      expect(session.staged[0].value).toBe("a dancer in a red coat");
    } finally {
      unmount();
    }
  });

  test("a draft opened with a token already in it renders the pointer the same way", async () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "ok" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat
          defaultDraft="fix @[Cut 3 body](mention:videoCut/6a1f#cutFrames.2.content) please"
          defaultOpen
          reference={[source]}
        />
      </lib.AgentProvider>,
    );
    try {
      await untilDrawn(() => !!editorOf(container)?.textContent);
      expect(editorOf(container)?.textContent).toBe("fix Cut 3 body please");
    } finally {
      unmount();
    }
  });
});
