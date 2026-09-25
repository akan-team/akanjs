import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AgentRunner, ToolCallRequest } from "use-agentic";

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
  new FetchClient("http://chattest", {}, {
    task: {
      endpoint: {
        planWeek: { type: "prompt", args: [], returns: { refName: "Any", arrDepth: 1 } },
        // Named after a built-in on purpose: the chat's own command has to win it.
        help: { type: "prompt", args: [], returns: { refName: "Any", arrDepth: 1 } },
      },
    },
  } as never);
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

  test("a slash command lists prompts and injects the prompt's messages as the user's turn", async () => {
    runtimeFetch.planWeek = () =>
      Promise.resolve([{ role: "user", content: { type: "text", text: "Plan the week from the board." } }]);
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "Planned." }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    composer(container).type("/");
    const entry = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("/planWeek"));
    expect(entry).toBeTruthy();
    await act(async () => {
      entry?.click();
      await untilFlushed(() => session.messages.length >= 2 && !session.isRunning);
    });
    expect(container.innerHTML).toContain("Plan the week from the board.");
    expect(container.innerHTML).toContain("Planned.");
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

  test("the / menu offers this chat's own commands ahead of the app's prompts, once per name", () => {
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    composer(container).type("/");
    const rows = menuRows(container);
    expect(rows.slice(0, 6).map((row) => row.split("base.")[0])).toEqual([
      "/new",
      "/retry",
      "/compact",
      "/copy",
      "/help",
      "/tools",
    ]);
    expect(rows.some((row) => row.startsWith("/planWeek"))).toBe(true);
    // The app's own /help prompt is shadowed, so the name is listed once rather than twice.
    expect(rows.filter((row) => row.startsWith("/help"))).toHaveLength(1);
    unmount();
  });

  test("a built-in wins a name collision with a prompt endpoint", async () => {
    let called = 0;
    runtimeFetch.help = () => {
      called += 1;
      return Promise.resolve("never");
    };
    const session = new lib.AgentSession(new lib.AgenticSurface(), scripted({ text: "hi" }));
    const { container, unmount } = mount(
      <lib.AgentProvider session={session}>
        <DefaultChat defaultOpen />
      </lib.AgentProvider>,
    );
    const input = composer(container);
    input.type("/help");
    await act(async () => {
      input.press("Enter");
      await untilFlushed(() => session.messages.length > 0);
    });
    expect(called).toBe(0);
    expect(container.innerHTML).toContain("base.agentHelpIntro");
    // The chat answered it, so nothing of it reaches the model's history.
    expect(session.messages.every((message) => message.local)).toBe(true);
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
    expect(container.querySelector("header")?.textContent).toContain("base.agentTokens");
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
});
