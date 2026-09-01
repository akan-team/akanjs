"use client";
import { cn, fetch, usePage } from "akanjs/client";
import type { PromptResult } from "akanjs/signal";
import { type AgentPrompt, AgentPrompts } from "akanjs/store";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AiOutlineClear, AiOutlineClose } from "react-icons/ai";
import {
  type AgentRunner,
  type AgentSession,
  type AgentSessionOptions,
  type CompactOptions,
  SessionContext,
  type SessionHistory,
} from "use-agentic";
import { createOverridable } from "../UiOverride";
import Approval from "./Approval";
import { agentSessionOf } from "./agentSessionOf";
import type { AttachReader } from "./attachment";
import Bubble from "./Bubble";
import { type ChatCommand, ChatCommands } from "./ChatCommands";
import { Composer } from "./Composer";
import { Launcher } from "./Launcher";
import Menu from "./Menu";
import Question from "./Question";
import type { PersistOption } from "./sessionHistory";
import type { BuiltinOption } from "./sessionView";
import { tokenCount } from "./tokenCount";
import { useChatAttachments } from "./useChatAttachments";
import { useChatVoice } from "./useChatVoice";
import { useDraftRecall } from "./useDraftRecall";
import { useKeyboardInset } from "./useKeyboardInset";
import { useSlashMenu } from "./useSlashMenu";
import type { VoiceEngine } from "./voice";

export interface ChatProps {
  /** Reaches whichever surface is showing — the launcher while closed, the panel while open. */
  className?: string;
  title?: string;
  /** App-global framing. Route-scoped guidance layers on it through mounted `Agent.Guide`s. */
  instructions?: string;
  /** Swap the transport; the default drives the app's `runAgentTurn` endpoint. */
  runner?: AgentRunner;
  maxTurns?: number;
  /**
   * When the conversation summarizes itself to stay inside the model's window — `at` estimated tokens, `keep`
   * messages left verbatim below the summary. Tune it per provider; `{ at: 0 }` turns it off.
   */
  compact?: CompactOptions;
  /**
   * Which of the runtime's own tools this chat's agent gets — all of them by default, `false` none, an array
   * exactly the ones it names. A chat that must not leave the screen it is on drops `navigate` and `goBack`.
   */
  builtins?: BuiltinOption;
  /** Called after a compaction replaced messages with one summary — where a host syncs its own watermark. */
  onCompact?: AgentSessionOptions["onCompact"];
  defaultOpen?: boolean;
  /**
   * Controlled open state. Pass it with `onOpenChange` to drive the panel from the app's own control — a header
   * button, a menu item — instead of the built-in launcher. Left off, the panel owns the state as before.
   */
  open?: boolean;
  /**
   * Left off while `open` is controlled, the panel cannot close itself — so it draws **no close button** rather
   * than an inert one. That is the shape of a fixed panel with nowhere to close to, and it is also what keeps a
   * controlled chat assemblable by a server component, since this is the only prop here that is a function.
   */
  onOpenChange?: (open: boolean) => void;
  /** `false` draws no launcher, for an app that opens the panel from a control of its own. */
  launcher?: boolean;
  /**
   * Keeps the transcript across reloads — sessionStorage by default, `{ storage: "local" }` to outlive the tab, or
   * a `SessionHistory` of the app's own to keep it anywhere else, a server included.
   *
   * Ignored, like every session option above it, when an enclosing `Agent.Zone` or `AgentProvider` already holds a
   * session: this chat then binds to that one, and the options belong to whoever built it.
   */
  persist?: PersistOption | SessionHistory;
  /** Renders in the page flow instead of floating above it — a zone chat that lives inside its own section. */
  inline?: boolean;
  /** `false` gives the browser its own Cmd/Ctrl+L back, for an app whose shell already spends that chord. */
  shortcut?: boolean;
  /** One surface each, where `className` reaches both. */
  launcherClassName?: string;
  panelClassName?: string;
  /** Shown in place of the intro line while the transcript is empty — where starter questions go. */
  intro?: ReactNode;
  /** Extra header controls, left of the built-in clear and close buttons. */
  header?: ReactNode;
  /**
   * `false` draws no header bar at all — for an `inline` chat inside a panel the app already titles. The extra
   * `header` controls go with it, and the clear action stays reachable as the `/new` command.
   */
  chrome?: boolean;
  /** The composer's opening text, read once at mount — where a `?prompt=` lands without sending it. */
  defaultDraft?: string;
  /**
   * Reads a file the user attached into an attachment, or answers `null` to leave it to the built-in reader
   * (images as bytes, text as text). This is where an app puts what needs a parser — a PDF's text, a spreadsheet's
   * cells — since the framework carries attachments but depends on nothing that can extract one. It runs before
   * the built-in, so it can also replace how an image is prepared.
   */
  attach?: AttachReader;
  /**
   * Speech in and out. The engine listens and speaks; this component decides when — a press-to-talk microphone
   * whose transcript lands in the composer for the user to correct, and a reply read aloud **only when the ask
   * itself came in by voice**, so a typed question never turns the speakers on.
   */
  voice?: VoiceEngine;
}

// `userAgentData` is the supported spelling and `platform` the deprecated one that is still the only answer in
// Safari and in a WebView; the user agent string is the last resort.
const isApplePlatform = () => {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /Mac|iPhone|iPad|iPod/i.test(data?.platform || navigator.platform || navigator.userAgent);
};

// Portalled to the body like Dialog's modal and the toast layer: the page tree sits under `#pageContainers`,
// which is `isolation: isolate`, so a z-index declared inside it can never rise above a body-level overlay.
// The layer sits above every dismissable surface (modal 10, dropdown/toast 100, sheet 101) so the agent can
// still drive a form inside an open modal, and below Reconnect (200), which blocks the app on purpose.
const launcherLayer = "fixed right-4 bottom-4 z-[150]";

// A phone gets the whole screen: a 24rem card inset by a rem on a 360px viewport is the same full screen with
// the corners cut off, and the composer would sit on the edge either way.
const panelLayer = "fixed inset-0 z-[150] sm:inset-auto sm:right-4 sm:bottom-4";
const panelSize =
  "h-dvh w-screen rounded-none sm:h-[min(600px,calc(100dvh-2rem))] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-box";

/** Distance from the bottom within which the transcript keeps following new messages. */
const stickyEdge = 80;

/**
 * The user-facing half of the in-page agent: one floating chat wired to the same surface the dock inspects.
 * The conversation loop runs in this browser session — every tool call executes here, gated by the approval
 * card — and the session lives in a ref, so it survives reopening the panel and dies with the page unless
 * `persist` keeps it. An enclosing AgentProvider's session wins, which is how an app isolates a surface or swaps
 * the loop while keeping this UI.
 */
export const DefaultChat = ({
  className,
  title,
  instructions,
  runner,
  maxTurns,
  compact,
  builtins,
  onCompact,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  launcher = true,
  persist,
  inline = false,
  shortcut = true,
  launcherClassName,
  panelClassName,
  intro,
  header,
  chrome = true,
  defaultDraft,
  attach,
  voice,
}: ChatProps) => {
  const { l } = usePage();
  const provided = useContext(SessionContext);
  // Read through a ref so the session's own text follows a language switched mid-conversation.
  const translate = useRef(l);
  translate.current = l;
  const held = useRef<AgentSession | null>(null);
  held.current ??=
    provided ??
    agentSessionOf({
      l: (key) => translate.current(key),
      runner,
      instructions,
      maxTurns,
      compact,
      builtins,
      persist,
      onCompact,
    });
  const session = held.current;
  const prompts = useRef<AgentPrompts | null>(null);
  prompts.current ??= AgentPrompts.of();
  const version = useSyncExternalStore(
    session.subscribe,
    () => session.version,
    () => session.version,
  );
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  // Controlled when the prop is given, uncontrolled otherwise — the same pair `Dialog` takes, so an app can drive
  // the panel from its own control without giving up the launcher's behaviour.
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState(defaultDraft ?? "");
  const files = useChatAttachments({ session, attach, l });
  const speech = useChatVoice({
    session,
    engine: voice,
    version,
    onTranscript: setDraft,
    onFailed: () => session.note(l("base.agentVoiceFailed")),
  });
  const recall = useDraftRecall(session.messages);
  const [hotkey, setHotkey] = useState<{ label: string; keys: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  // Only what the panel is following: a user who scrolled up to read is not dragged back down by the next delta.
  const sticky = useRef(true);
  const returning = useRef(false);
  const read = useRef(session.messages.length);
  const keyboardInset = useKeyboardInset();
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setOverlay(document.body);
  }, []);
  useEffect(() => {
    if (open) read.current = session.messages.length;
    if (sticky.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [version, open]);
  useEffect(() => {
    if (!shortcut) return;
    const apple = isApplePlatform();
    setHotkey(apple ? { label: "⌘ L", keys: "Meta+L" } : { label: "Ctrl+L", keys: "Control+L" });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== "l" || event.shiftKey || event.altKey) return;
      const chord = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!chord) return;
      event.preventDefault();
      sticky.current = true;
      setOpen(true);
      inputRef.current?.focus();
    };
    // Cmd/Ctrl+L is the browser location bar; capture so preventDefault wins.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [shortcut]);
  useEffect(() => {
    if (!open) {
      // Focus goes back to the launcher only when the user dismissed the panel, never when it opened closed.
      if (returning.current) launcherRef.current?.focus();
      returning.current = false;
      return;
    }
    inputRef.current?.focus();
  }, [open, session.pendingQuestion?.callId]);
  useEffect(
    () => () => {
      // A session this chat made dies with it: unmounted, nothing renders its approvals, and a turn left running
      // would go on driving a screen the user has navigated away from. A provided one belongs to its provider.
      if (!provided) session.abort();
    },
    [],
  );
  const runPrompt = async (prompt: AgentPrompt, args: string[]) => {
    const usage = `/${prompt.name} ${prompt.args.map((arg) => `<${arg.name}>`).join(" ")}`.trim();
    if (args.length < prompt.args.filter((arg) => arg.required).length) {
      session.report(`Usage: ${usage}`);
      return;
    }
    const handler = (fetch as unknown as Record<string, (...callArgs: unknown[]) => Promise<PromptResult>>)[
      prompt.name
    ];
    if (typeof handler !== "function") {
      session.report(`/${prompt.name} is not mounted on this app.`);
      return;
    }
    try {
      const result = await handler(...args);
      await session.send(AgentPrompts.messagesOf(result));
    } catch (error) {
      session.report(`/${prompt.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const write = (text: string) => {
    setDraft(text);
    menu.reopen();
  };
  // A panel driven by a controlled `open` with no `onOpenChange` cannot close itself, so it draws no close button
  // rather than one that does nothing — the case an `inline` chat inside an app's own frame lands in.
  const closable = openProp === undefined || !!onOpenChange;
  const dismiss = () => {
    returning.current = true;
    setOpen(false);
  };
  const runCommand = (command: ChatCommand) => {
    write("");
    recall.remember(`/${command.name}`);
    // A staged file belongs to the conversation being cleared, so it leaves with it.
    if (command.name === "new") files.clear();
    void ChatCommands.run(command, { session, l });
  };
  const pick = (prompt: AgentPrompt) => {
    if (prompt.args.some((arg) => arg.required)) {
      write(`/${prompt.name} `);
      return;
    }
    if (session.isRunning) {
      session.note(l("base.agentBusy"));
      return;
    }
    write("");
    recall.remember(`/${prompt.name}`);
    void runPrompt(prompt, []);
  };
  const menu = useSlashMenu({ draft, prompts: prompts.current, l, onCommand: runCommand, onPrompt: pick });
  const send = () => {
    const text = draft.trim();
    if (!text && !files.attached.length) return;
    const command = AgentPrompts.parseCommand(text);
    const builtin = command ? ChatCommands.find(command.name, l) : null;
    // Ahead of both the question card and the running check: /new and /copy are exactly what a user reaches for
    // while a turn is in flight, and a question the agent asked is the middle of a turn like any other.
    if (builtin) {
      runCommand(builtin);
      return;
    }
    // The composer is the free-text answer to a pending question: the card holds the picks, and a user who types
    // instead of picking would otherwise be typing into a dead input while the turn waits on them.
    const question = session.pendingQuestion;
    if (question) {
      if (!text) {
        session.note(l("base.agentAnswerNeeded"));
        return;
      }
      write("");
      speech.drop();
      question.answer(question.multiple ? [text] : text);
      return;
    }
    if (session.isRunning) return;
    const prompt = command ? prompts.current?.find(command.name) : null;
    write("");
    if (text) recall.remember(text);
    sticky.current = true;
    speech.take();
    if (command && prompt) {
      void runPrompt(prompt, command.args);
      return;
    }
    if (!files.attached.length) {
      void session.send(text);
      return;
    }
    const attachments = files.attached;
    files.clear();
    void session.send([{ role: "user", ...(text ? { text } : {}), attachments }]);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const area = event.currentTarget;
    // A caret with a line above it (or below it) is one the arrow belongs to: the composer is multi-line now, so
    // recall may only take the key where the textarea itself would do nothing with it.
    const onEdgeLine = (up: boolean) =>
      area.selectionStart === area.selectionEnd &&
      !(up ? area.value.slice(0, area.selectionStart) : area.value.slice(area.selectionEnd)).includes("\n");
    const row = menu.at();
    if (row) {
      // The menu takes the keys the recall would otherwise walk: it is the thing on screen the arrows point at.
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        menu.move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        write(`/${row.name} `);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        menu.hide();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        row.pick();
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    const up = event.key === "ArrowUp";
    if ((up || event.key === "ArrowDown") && recall.has && onEdgeLine(up)) {
      event.preventDefault();
      const walked = recall.step(up ? 1 : -1, draft);
      if (walked !== null) setDraft(walked);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  // Rebuilt per transcript change rather than per render — a keystroke in the composer changes no message, and
  // the bubbles are memoized on identity, so the maps handed to them have to be the same ones.
  //
  // A call and its result are two wire messages because the model needs both, but they are one thing that
  // happened: the call's row resolves in place, and the result message renders only what no call claimed —
  // a persisted transcript is capped, so a result can outlive the assistant message that made it.
  const bubbles = useMemo(() => {
    const resultOf = new Map(session.messages.flatMap((message) => message.toolResults ?? []).map((r) => [r.id, r]));
    const claimed = new Set(session.messages.flatMap((message) => message.toolCalls?.map((call) => call.id) ?? []));
    return session.messages.flatMap((message, idx) => {
      if (message.role !== "tool")
        return [<Bubble key={idx} message={message} progress={session.progress} results={resultOf} />];
      const orphans = (message.toolResults ?? []).filter((result) => !claimed.has(result.id));
      return orphans.length ? [<Bubble key={idx} message={{ ...message, toolResults: orphans }} />] : [];
    });
  }, [version]);
  // Recomputed per transcript change, never per render: the estimate walks every message, and the composer
  // re-renders on every keystroke.
  const tokens = useMemo(() => session.tokens, [version]);
  const unread = open ? 0 : Math.max(0, session.messages.length - read.current);
  const layer = (surface: ReactNode) => (inline ? surface : overlay ? createPortal(surface, overlay) : null);
  if (!open)
    return launcher
      ? layer(
          <Launcher
            className={cn(!inline && launcherLayer, className, launcherClassName)}
            hotkey={hotkey}
            label={l("base.agent")}
            buttonRef={launcherRef}
            onOpen={() => setOpen(true)}
            unread={unread}
          />,
        )
      : null;
  // data-agent-ui keeps the chat out of readScreen, so a turn never re-reads its own transcript.
  return layer(
    <aside
      aria-label={title ?? l("base.agent")}
      data-agent-ui=""
      className={cn(
        "flex flex-col overflow-hidden border border-border bg-background",
        inline ? "h-full w-full rounded-box" : [panelLayer, panelSize, "shadow-xl"],
        files.dragging && "border-primary ring-2 ring-primary/40",
        className,
        panelClassName,
      )}
      role="dialog"
      // The keyboard covers a full-screen panel's composer, and only `visualViewport` reports by how much.
      style={inline ? undefined : { paddingBottom: keyboardInset || undefined }}
      {...files.dropProps}
    >
      {chrome ? (
        <header className="flex items-center gap-2 border-foreground/5 border-b px-4 py-3">
          <span className="font-semibold text-sm">{title ?? l("base.agent")}</span>
          {session.isRunning ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
          {tokens ? (
            <span className="shrink-0 whitespace-nowrap text-[10px] text-foreground/40">
              {l("base.agentTokens", { count: tokenCount(tokens) })}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            {header}
            {session.messages.length ? (
              <button
                aria-label={l("base.agentClear")}
                className="text-foreground/50 hover:text-foreground"
                onClick={() => {
                  files.clear();
                  void session.reset();
                }}
                type="button"
              >
                <AiOutlineClear />
              </button>
            ) : null}
            {closable ? (
              <button
                aria-label={l("base.cancel")}
                className="text-foreground/50 hover:text-foreground"
                onClick={dismiss}
                type="button"
              >
                <AiOutlineClose />
              </button>
            ) : null}
          </span>
        </header>
      ) : null}
      <div
        aria-busy={session.isRunning}
        aria-live="polite"
        className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
        onScroll={() => {
          const list = listRef.current;
          if (list) sticky.current = list.scrollHeight - list.scrollTop - list.clientHeight < stickyEdge;
        }}
        ref={listRef}
        role="log"
      >
        {bubbles.length
          ? bubbles
          : (intro ?? <p className="py-6 text-center text-foreground/40 text-sm">{l("base.agentIntro")}</p>)}
        {session.isCompacting ? (
          <p className="flex items-center gap-2 text-foreground/50 text-xs">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
            {l("base.agentSummarizing")}
          </p>
        ) : null}
      </div>
      {session.pendingApproval ? <Approval approval={session.pendingApproval} /> : null}
      {session.pendingQuestion ? (
        <Question key={session.pendingQuestion.callId} question={session.pendingQuestion} />
      ) : null}
      <Menu onPick={(row) => row.pick()} rows={menu.rows} selected={menu.selected} />
      <Composer
        attached={files.attached}
        draft={draft}
        inputRef={inputRef}
        {...(speech.canListen ? { mic: { listening: speech.listening, onToggle: speech.toggle } } : {})}
        onDraft={write}
        onFiles={(picked) => void files.add(picked)}
        onKeyDown={onKeyDown}
        onRemoveFile={files.remove}
        onSend={send}
        onStop={() => {
          speech.silence();
          session.abort();
        }}
        session={session}
      />
    </aside>,
  );
};

export default createOverridable("AgentChat", DefaultChat);
