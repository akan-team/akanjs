"use client";
import { cn, isMcpView, isMobileDevice, usePage } from "akanjs/client";
import { AgentPrompts, type AgentVisualOption } from "akanjs/store";
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
  type ChatMessage,
  type CompactOptions,
  SessionContext,
  type SessionHistory,
} from "use-agentic";
import { overlayZ } from "../overlayLayer";
import { createOverridable } from "../UiOverride";
import Approval from "./Approval";
import { agentSessionOf, type BuiltinOption, type PersistOption } from "./agentSessionOf";
import type { AttachLimits, AttachReader } from "./attachment";
import Bubble from "./Bubble";
import { type ChatCommand, ChatCommands } from "./ChatCommands";
import { Composer, type ComposerHandle } from "./Composer";
import { Launcher } from "./Launcher";
import Menu from "./Menu";
import Question from "./Question";
import Queued from "./Queued";
import Steps from "./Steps";
import ToolCard from "./ToolCard";
import { tokenCount } from "./tokenCount";
import { useChatAttachments } from "./useChatAttachments";
import { type QueuedMessage, useChatQueue } from "./useChatQueue";
import { useChatReferences } from "./useChatReferences";
import { useChatVoice } from "./useChatVoice";
import { useDraftRecall } from "./useDraftRecall";
import { useKeyboardFrame } from "./useKeyboardFrame";
import { type ReferenceSource, useReferenceMenu } from "./useReferenceMenu";
import { useSlashMenu } from "./useSlashMenu";
import type { VoiceEngine } from "./voice";

export interface ChatProps {
  /** Applied to the launcher while closed and to the panel while open. */
  className?: string;
  title?: string;
  /** App-global framing; route-scoped `Agent.Guide`s layer on it. */
  instructions?: string;
  /** Defaults to the app's `runAgentTurn` endpoint. */
  runner?: AgentRunner;
  maxTurns?: number;
  /** Summarizes past `at` estimated tokens or near the server's context window, keeping `keep` messages verbatim;
   *  `{ at: Infinity }` leaves only the window guard, `{ at: 0 }` turns it all off. */
  compact?: CompactOptions;
  /** Every runtime tool by default, `false` none, an array exactly the ones it names. */
  builtins?: BuiltinOption;
  /** Called after a compaction replaced messages with one summary. */
  onCompact?: AgentSessionOptions["onCompact"];
  defaultOpen?: boolean;
  /** Controlled open state, paired with `onOpenChange`; left off, the panel owns it. */
  open?: boolean;
  /** Left off while `open` is controlled, the panel draws no close button. */
  onOpenChange?: (open: boolean) => void;
  /** On by default; `false` draws nothing, `{ cursor: false }` / `{ reveal: false }` turn one effect off. */
  visual?: boolean | AgentVisualOption;
  /** `false` draws no launcher. */
  launcher?: boolean;
  /** sessionStorage by default, `{ storage: "local" }` to outlive the tab, or an app `SessionHistory`. Ignored, like
   *  every session option above, when an enclosing `Agent.Zone` or `AgentProvider` already holds a session. */
  persist?: PersistOption | SessionHistory;
  /** Renders in the page flow instead of floating above it. */
  inline?: boolean;
  /** `false` leaves Cmd/Ctrl+L to the browser. */
  shortcut?: boolean;
  launcherClassName?: string;
  /** The corner the launcher sits in; it clears the page's bottom chrome and safe area either way. */
  launcherPlacement?: "right" | "left";
  /** Draws no launcher below this breakpoint; the panel still opens from the shortcut or a controlled `open`. */
  hideLauncherBelow?: "sm" | "md" | "lg";
  panelClassName?: string;
  /** Shown in place of the intro line while the transcript is empty. */
  intro?: ReactNode;
  /** Extra header controls, left of the built-in clear and close buttons. */
  header?: ReactNode;
  /** `false` draws no header bar, `header` included; clearing stays reachable as `/new`. */
  chrome?: boolean;
  /** The composer's opening text, read once at mount. */
  defaultDraft?: string;
  /** Runs before the built-in reader, which `null` falls back to. The provider fetches a `url` itself, so answer
   *  `data` too when it cannot reach it — `data` is then what is sent and `url` only draws the chip. */
  attach?: AttachReader;
  /** What the composer's `@` menu can point at, one entry per document kind. */
  reference?: readonly ReferenceSource[];
  /** Draws `@` pointers as names; on when `reference` is set, `false` keeps the plain textarea. */
  mentions?: boolean;
  /** Overrides the per-file, per-message and count ceilings on attachments. */
  attachLimits?: AttachLimits;
  /** Speech in and out; a reply is read aloud only when the ask came in by voice. */
  voice?: VoiceEngine;
}

// `platform` is deprecated but still the only answer in Safari and WebViews; the user agent is the last resort.
const isApplePlatform = () => {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /Mac|iPhone|iPad|iPod/i.test(data?.platform || navigator.platform || navigator.userAgent);
};

// Portalled to the body: `#pageContainers` is `isolation: isolate`, so a z-index inside it never tops a body overlay.
// The launcher reads the page's frame off `<html>` (FrameRootVars), so it clears the tab bar and the home indicator.
const launcherLayer =
  "fixed bottom-[calc(var(--akan-bottom-inset,0px)+max(var(--akan-bottom-safe-area,0px),env(safe-area-inset-bottom,0px))+1rem)]";
const launcherStyle = { zIndex: overlayZ.agentLauncher } as const;
const launcherSides = {
  right: "right-[calc(env(safe-area-inset-right,0px)+1rem)]",
  left: "left-[calc(env(safe-area-inset-left,0px)+1rem)]",
} as const;
const launcherHiddenBelow = { sm: "max-sm:hidden", md: "max-md:hidden", lg: "max-lg:hidden" } as const;

const panelLayer = "fixed inset-0 sm:inset-auto sm:right-4 sm:bottom-4";
const panelSize =
  "h-dvh w-screen rounded-none sm:h-[min(600px,calc(100dvh-2rem))] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-box";

const stickyEdge = 80;

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
  visual = true,
  persist,
  inline = false,
  shortcut = true,
  launcherClassName,
  launcherPlacement = "right",
  hideLauncherBelow,
  panelClassName,
  intro,
  header,
  chrome = true,
  defaultDraft,
  attach,
  attachLimits,
  reference,
  mentions,
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
      visual,
    });
  const session = held.current;
  const version = useSyncExternalStore(
    session.subscribe,
    () => session.version,
    () => session.version,
  );
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState(defaultDraft ?? "");
  const files = useChatAttachments({ session, attach, limits: attachLimits, l });
  const speech = useChatVoice({
    session,
    engine: voice,
    version,
    onTranscript: setDraft,
    onFailed: () => session.note(l("base.agentVoiceFailed")),
  });
  const recall = useDraftRecall(session.messages);
  // `dispatch` is declared below and only ever called from the flush effect, after this render has finished.
  const queue = useChatQueue({ session, limits: attachLimits, version, l, onFlush: (message) => dispatch(message) });
  const [hotkey, setHotkey] = useState<{ label: string; keys: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<ComposerHandle | null>(null);
  // An override composer drawing its own textarea fills no handle, so the input ref answers instead.
  const focusComposer = () => {
    if (handleRef.current) handleRef.current.focus();
    else inputRef.current?.focus();
  };
  const refs = useChatReferences({ session, draft, version, handleRef, onDraft: setDraft });
  const sticky = useRef(true);
  const returning = useRef(false);
  const read = useRef(session.messages.length);
  const keyboardFrame = useKeyboardFrame();
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setOverlay(document.body);
  }, []);
  useEffect(() => {
    if (open) read.current = session.messages.length;
    if (sticky.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [version, open]);
  useEffect(() => {
    if (!shortcut || isMcpView()) return;
    const apple = isApplePlatform();
    setHotkey(apple ? { label: "⌘ L", keys: "Meta+L" } : { label: "Ctrl+L", keys: "Control+L" });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== "l" || event.shiftKey || event.altKey) return;
      const chord = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!chord) return;
      event.preventDefault();
      sticky.current = true;
      setOpen(true);
      focusComposer();
    };
    // Cmd/Ctrl+L is the browser location bar; capture so preventDefault wins.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [shortcut]);
  useEffect(() => {
    if (!open) {
      if (returning.current) launcherRef.current?.focus();
      returning.current = false;
      return;
    }
    // A touch screen raises its keyboard on focus, covering the intro the panel just opened to and panning the page.
    if (!isMobileDevice()) focusComposer();
  }, [open, session.pendingQuestion?.callId]);
  useEffect(
    () => () => {
      // Unmounted, nothing renders an owned session's approvals; a provided one belongs to its provider.
      if (!provided) session.abort();
    },
    [],
  );
  const write = (text: string) => {
    setDraft(text);
    menu.reopen();
    mentionMenu.reopen();
  };
  const closable = openProp === undefined || !!onOpenChange;
  const dismiss = () => {
    returning.current = true;
    setOpen(false);
  };
  const runCommand = (command: ChatCommand) => {
    write("");
    recall.remember(`/${command.name}`);
    // The slot empties before the abort, or the dying turn's last notify would send what was just cleared.
    if (command.name === "new") {
      files.clear();
      session.clearStaged();
      queue.take();
    }
    void ChatCommands.run(command, { session, l });
  };
  const dispatch = (message: QueuedMessage): boolean => {
    if (session.isRunning) return queue.push(message);
    sticky.current = true;
    speech.take(message.byVoice);
    if (!message.attachments.length && !message.references.length) void session.send(message.text);
    else
      void session.send([
        {
          role: "user",
          ...(message.text ? { text: message.text } : {}),
          ...(message.attachments.length ? { attachments: message.attachments } : {}),
          ...(message.references.length ? { references: message.references } : {}),
        },
      ]);
    return true;
  };
  const unpark = () => {
    const message = queue.queued;
    if (!message || !files.restore(message.attachments)) return;
    queue.take();
    session.restoreStaged(message.references);
    write([message.text, draft].filter(Boolean).join("\n"));
    speech.hold(message.byVoice);
  };
  const menu = useSlashMenu({ draft, l, onCommand: runCommand });
  const mentionMenu = useReferenceMenu({ draft, sources: reference ?? [], session, l, onWrite: write });
  // A slash command is the whole draft and a mention ends one, so at most one list ever has rows.
  const list = menu.at() ? menu : mentionMenu;
  const send = () => {
    const text = draft.trim();
    if (!text && !files.attached.length) return;
    const command = AgentPrompts.parseCommand(text);
    const builtin = command ? ChatCommands.find(command.name, l) : null;
    // Ahead of the question and running checks: /new and /copy are what a user reaches for mid-turn.
    if (builtin) {
      runCommand(builtin);
      return;
    }
    const question = session.pendingQuestion;
    if (question) {
      if (!text) {
        session.note(l("base.agentAnswerNeeded"));
        return;
      }
      write("");
      speech.lift();
      question.answer(question.multiple ? [text] : text);
      return;
    }
    const byVoice = speech.lift();
    if (!dispatch({ text, attachments: files.attached, references: refs.references, byVoice })) {
      speech.hold(byVoice);
      return;
    }
    write("");
    files.clear();
    session.clearStaged();
    if (text) recall.remember(text);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const area = event.currentTarget;
    const onEdgeLine = (up: boolean) =>
      area.selectionStart === area.selectionEnd &&
      !(up ? area.value.slice(0, area.selectionStart) : area.value.slice(area.selectionEnd)).includes("\n");
    const row = list.at();
    if (row) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        list.move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (list === menu) write(`/${row.name} `);
        else row.pick();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        list.hide();
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
  // Per transcript change, not per render: the bubbles are memoized on identity, so the maps must stay the same.
  // A result renders only what no call claimed — a capped transcript can outlive the message that made the call.
  const bubbles = useMemo(() => {
    const resultOf = new Map(session.messages.flatMap((message) => message.toolResults ?? []).map((r) => [r.id, r]));
    const claimed = new Set(session.messages.flatMap((message) => message.toolCalls?.map((call) => call.id) ?? []));
    const blocks: ({ at: number; user: ChatMessage } | { at: number; turn: ChatMessage[] })[] = [];
    session.messages.forEach((message, idx) => {
      if (message.role === "user") {
        blocks.push({ at: idx, user: message });
        return;
      }
      const orphans = message.role === "tool" ? (message.toolResults ?? []).filter((r) => !claimed.has(r.id)) : null;
      if (orphans && !orphans.length) return;
      const shown = orphans ? { ...message, toolResults: orphans } : message;
      const open = blocks.at(-1);
      if (open && "turn" in open) open.turn.push(shown);
      else blocks.push({ at: idx, turn: [shown] });
    });
    const last = blocks.at(-1);
    return blocks.map((block) =>
      "user" in block ? (
        <Bubble key={block.at} message={block.user} progress={session.progress} results={resultOf} />
      ) : (
        <Steps
          isRunning={session.isRunning && block === last}
          key={block.at}
          messages={block.turn}
          progress={session.progress}
          results={resultOf}
        />
      ),
    );
  }, [version]);
  // The estimate walks every message, and the composer re-renders on every keystroke.
  const context = useMemo(() => session.context, [version]);
  const unread = open ? 0 : Math.max(0, session.messages.length - read.current);
  //? Inside an MCP host's view the person is already talking to an agent, and this one's relay is out of reach.
  const layer = (surface: ReactNode) =>
    isMcpView() ? null : inline ? surface : overlay ? createPortal(surface, overlay) : null;
  if (!open)
    return launcher
      ? layer(
          <Launcher
            className={cn(
              !inline && [launcherLayer, launcherSides[launcherPlacement]],
              hideLauncherBelow && launcherHiddenBelow[hideLauncherBelow],
              className,
              launcherClassName,
            )}
            style={inline ? undefined : launcherStyle}
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
      style={inline ? undefined : { zIndex: overlayZ.agentPanel, ...keyboardFrame }}
      {...files.dropProps}
    >
      {chrome ? (
        <header className="flex items-center gap-2 border-foreground/5 border-b px-4 py-3">
          <span className="font-semibold text-sm">{title ?? l("base.agent")}</span>
          {session.isRunning ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
          {context.used ? (
            <span
              className="shrink-0 whitespace-nowrap text-[10px] text-foreground/40"
              title={
                context.compactAt ? l("base.agentCompactsAt", { limit: tokenCount(context.compactAt) }) : undefined
              }
            >
              {context.compactAt
                ? l("base.agentTokensOf", { count: tokenCount(context.used), limit: tokenCount(context.compactAt) })
                : l("base.agentTokens", { count: tokenCount(context.used) })}
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
                  queue.take();
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
      {session.pendingCard ? <ToolCard card={session.pendingCard} key={session.pendingCard.callId} /> : null}
      {session.pendingQuestion ? (
        <Question key={session.pendingQuestion.callId} question={session.pendingQuestion} />
      ) : null}
      {queue.queued ? <Queued message={queue.queued} onCancel={() => queue.take()} onEdit={unpark} /> : null}
      <Menu onPick={(row) => row.pick()} prefix={list === menu ? "/" : "@"} rows={list.rows} selected={list.selected} />
      <Composer
        attached={files.attached}
        pending={files.pending}
        draft={draft}
        handleRef={handleRef}
        inputRef={inputRef}
        mentions={mentions ?? !!reference?.length}
        {...(speech.canListen ? { mic: { listening: speech.listening, onToggle: speech.toggle } } : {})}
        onDraft={write}
        onFiles={(picked) => void files.add(picked)}
        onKeyDown={onKeyDown}
        onRemoveFile={files.remove}
        onRemoveReference={refs.remove}
        onSend={send}
        references={refs.references}
        onStop={() => {
          speech.silence();
          unpark();
          session.abort();
        }}
        session={session}
      />
    </aside>,
  );
};

export default createOverridable("AgentChat", DefaultChat);
