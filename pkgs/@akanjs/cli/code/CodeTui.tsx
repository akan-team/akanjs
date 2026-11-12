import type { CodeAgent } from "@akanjs/devkit/codeAgent";
import { CodeTranscript } from "akanjs/common";
import { render } from "ink";
import { CodeTuiApp, type CodeTuiSnapshot, promptMarkWidth } from "../ui/CodeTuiApp";
import { CodeTuiCommandRunner } from "./CodeTuiCommandRunner";
import { CodeTuiCommands } from "./CodeTuiCommands";
import { CodeTuiEditor } from "./CodeTuiEditor";
import { CodeTuiFrame } from "./CodeTuiFrame";
import type { CodeTuiSpan } from "./CodeTuiLines";
import { CodeTuiMouse } from "./CodeTuiMouse";
import { CodeTuiOverlay } from "./CodeTuiOverlay";
import { CodeTuiPrompt } from "./CodeTuiPrompt";
import { CodeTuiQuestion } from "./CodeTuiQuestion";

export interface CodeTuiOptions {
  /** Draw the model's reasoning in full. Folded to one line otherwise, and `/thinking` flips it either way. */
  thinking?: boolean;
  notice?: string;
  warnings?: string[];
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
}

// The next frame clears the terminal, so a leaving session's last word travels with the id it switches to.
export interface CodeTuiExit {
  id: string;
  notice?: string;
}

export class CodeTui {
  /** Ink throttles its own writes to `maxFps: 30`, so notifying faster only buys extra reconciles. */
  static readonly frameMs = 34;
  static readonly clipboardMs = CodeTuiPrompt.clipboardMs;
  static readonly noticeMs = 4_000;
  static readonly chromeRows = CodeTuiFrame.chromeRows;
  static readonly promptRuleRows = CodeTuiFrame.promptRuleRows;
  static readonly minBodyRows = CodeTuiFrame.minBodyRows;
  static readonly maxInputRows = CodeTuiFrame.maxInputRows;
  static readonly title = CodeTuiFrame.title;
  static readonly imageMark = CodeTuiPrompt.imageMark;
  static readonly freeTextKey = CodeTuiQuestion.freeTextKey;

  // Bracketed paste: cmd+v over an image-only clipboard still sends an empty `ESC[200~`…`ESC[201~` pair.
  static readonly pasteOn = "\u001b[?2004h";
  static readonly pasteOff = "\u001b[?2004l";

  readonly #agent: CodeAgent;
  readonly #transcript = new CodeTranscript();
  readonly #editor = new CodeTuiEditor();
  readonly #frame: CodeTuiFrame;
  readonly #overlay: CodeTuiOverlay;
  readonly #prompt: CodeTuiPrompt;
  readonly #question: CodeTuiQuestion;
  readonly #runner: CodeTuiCommandRunner;
  readonly #listeners = new Set<() => void>();
  readonly #instance: ReturnType<typeof render>;
  readonly #stdout: NodeJS.WriteStream;
  #anchor: number | null = null; // last visible transcript row; null follows the tail
  #switchTo: CodeTuiExit | undefined;
  #notice = "";
  readonly #opening: string;
  readonly #warnings: string[];
  #noticeTimer: ReturnType<typeof setTimeout> | null = null;
  #frameTimer: ReturnType<typeof setTimeout> | null = null;
  #cached: CodeTuiSnapshot | null = null;
  #unsubscribe: (() => void) | undefined;
  #exiting = false;

  constructor(agent: CodeAgent, { thinking = false, notice, warnings = [], ...streams }: CodeTuiOptions = {}) {
    this.#agent = agent;
    this.#opening = notice ?? "";
    this.#warnings = warnings;
    this.#stdout = streams.stdout ?? process.stdout;
    this.#frame = new CodeTuiFrame(this.#transcript, this.#stdout, thinking);
    const say = (text: string) => this.#say(text);
    const fail = (error: unknown) => this.#fail(error);
    const renderNow = () => this.#renderNow();
    this.#overlay = new CodeTuiOverlay(agent, this.#transcript, { render: renderNow, say });
    this.#prompt = new CodeTuiPrompt(agent, this.#transcript, this.#editor, this.#overlay, {
      render: renderNow,
      snapshot: this.#snapshot,
      say,
      fail,
      command: (line) => this.#command(line),
    });
    this.#question = new CodeTuiQuestion(agent, this.#transcript, this.#editor, renderNow);
    this.#runner = new CodeTuiCommandRunner(agent, this.#transcript, this.#overlay, {
      say,
      fail,
      leave: (exit) => {
        this.#switchTo = exit;
        this.#quit();
      },
    });
    this.#stdout.on("resize", this.#onResize);
    this.#instance = render(
      <CodeTuiApp
        actions={{
          subscribe: this.#subscribe,
          snapshot: this.#snapshot,
          type: this.#prompt.type,
          edit: this.#prompt.edit,
          submit: this.#submit,
          newline: this.#prompt.newline,
          paste: this.#prompt.paste,
          pasted: this.#prompt.pasted,
          complete: this.#prompt.complete,
          vertical: this.#vertical,
          scroll: this.#scroll,
          move: this.#move,
          toggle: this.#question.toggle,
          answerConfirm: this.#question.answerConfirm,
          cancel: this.#cancel,
          interrupt: this.#interrupt,
        }}
      />,
      {
        // Bun's `console.log` writes to fd 1 natively, bypassing `process.stdout.write`; only Ink's patch catches it.
        patchConsole: true,
        // Ink's own ctrl+c handler unmounts before `useInput` sees the key, skipping the host's interrupt and wipe.
        exitOnCtrlC: false,
        // Only the kitty protocol tells shift+enter from enter; `auto` enables it once the terminal answers a query.
        kittyKeyboard: { mode: "auto" },
        ...streams,
      },
    );
  }

  /** Resolves to the session the person chose to continue, when they chose one, and undefined on a plain quit. */
  async run(seed?: string) {
    this.#stdout.write(`${CodeTui.pasteOn}${CodeTuiMouse.on}`);
    if (this.#opening) this.#say(this.#opening);
    for (const warning of this.#warnings) this.#transcript.note("warning", warning);
    this.#unsubscribe = this.#agent.on((event) => {
      this.#transcript.apply(event);
      if (event.type === "question") this.#question.open(event.question);
      this.#scheduleFrame();
    });
    this.#agent.announce();
    void this.#prompt.load().then(() => this.#renderNow());
    this.#prompt.watchClipboard();
    if (seed?.trim()) this.#prompt.send(seed.trim());
    await this.#instance.waitUntilExit();
    this.#close();
    return this.#switchTo;
  }

  close() {
    this.#quit();
  }

  #close() {
    this.#prompt.unwatchClipboard();
    if (this.#frameTimer) clearTimeout(this.#frameTimer);
    if (this.#noticeTimer) clearTimeout(this.#noticeTimer);
    this.#frameTimer = null;
    this.#noticeTimer = null;
    this.#stdout.off("resize", this.#onResize);
    this.#unsubscribe?.();
    this.#farewell();
  }

  #farewell() {
    const info = this.#transcript.info;
    if (this.#switchTo || !info?.sessionId || !this.#agent.sessions().length) return;
    if (!this.#transcript.parts.some((part) => part.kind === "user")) return;
    const name = info.name ? ` (${info.name})` : "";
    this.#stdout.write(`Resume this session${name} with:\n  akan code --resume ${info.sessionId}\n`);
  }

  #onResize = () => this.#renderNow();

  #subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #scheduleFrame() {
    if (this.#frameTimer) return;
    this.#frameTimer = setTimeout(() => {
      this.#frameTimer = null;
      this.#renderNow();
    }, CodeTui.frameMs);
  }

  #renderNow() {
    this.#cached = null;
    for (const listener of this.#listeners) listener();
  }

  static layout(frameRows: number, askRows: number, railRows = 0) {
    return CodeTuiFrame.layout(frameRows, askRows, railRows);
  }

  static frameRowsOf(terminalRows: number) {
    return CodeTuiFrame.frameRowsOf(terminalRows);
  }

  #snapshot = (): CodeTuiSnapshot => {
    if (this.#cached) return this.#cached;
    const columns = Math.max(40, this.#stdout.columns || 80);
    const frameRows = CodeTui.frameRowsOf(Math.max(10, this.#stdout.rows || 24));
    const question = this.#transcript.question;
    const approval = this.#transcript.approval;
    const mode = this.#question.typing ? "input" : CodeTuiQuestion.modeOf(question, approval);
    const subagents = this.#frame.railRows(columns);
    const ask =
      mode === "input"
        ? this.#prompt.block(columns, frameRows - subagents.length)
        : this.#question.block(question, frameRows - subagents.length);
    const { bodyHeight } = CodeTui.layout(frameRows, ask.rows, subagents.length);
    const width = columns - 2;
    const lines = this.#frame.lines(width);
    const end = this.#anchor === null ? lines.length : Math.min(lines.length, Math.max(bodyHeight, this.#anchor));
    const start = Math.max(0, end - bodyHeight);
    const above = start;
    const below = lines.length - end;
    this.#cached = {
      topRule: CodeTui.rule(
        this.#anchor === null ? "" : `▲${above} ▼${below} paused`,
        this.#transcript.info?.name ?? this.#transcript.info?.sessionId.slice(0, 8) ?? "",
        columns,
      ),
      bottomRule: CodeTui.rule(this.#frame.queueLabel(), this.#frame.statusLabel(), columns),
      lines: lines.slice(start, end),
      above,
      below,
      following: this.#anchor === null,
      overlay: this.#overlay.block(width, bodyHeight),
      status: this.#frame.status(),
      subagents,
      mode,
      placeholder: this.#question.placeholder(),
      offered: this.#prompt.offered,
      prompt: CodeTuiQuestion.promptOf(question, approval),
      selected: ask.selected,
      checked: this.#question.checked,
      multiSelect: !!question?.multiSelect,
      notice: this.#notice,
      hint: this.#overlay.shown ? "esc close · ↑↓ scroll" : this.#question.hint(mode, !!question?.multiSelect),
      columns,
      frameRows,
      bodyHeight,
      cursor: ask.caret ? { x: promptMarkWidth + ask.caret.col, y: bodyHeight + ask.above + ask.caret.row } : null,
      ...ask.snapshot,
    };
    return this.#cached;
  };

  static rule(left: string, right: string, width: number): CodeTuiSpan[] {
    return CodeTuiFrame.rule(left, right, width);
  }

  #vertical = (delta: -1 | 1) => {
    if (this.#overlay.picker) return this.#move(delta);
    if (this.#overlay.shown) return this.#scroll(delta);
    this.#prompt.vertical(delta);
  };

  #scroll = (delta: number) => {
    if (this.#overlay.picker) return this.#move(Math.sign(delta));
    if (this.#overlay.shown) return this.#overlay.scroll(delta);
    const snapshot = this.#snapshot();
    const total = snapshot.above + snapshot.lines.length + snapshot.below;
    const rows = Math.max(1, snapshot.lines.length);
    if (total <= rows) return;
    const end = this.#anchor === null ? total : this.#anchor;
    const next = Math.min(total, Math.max(rows, end + Math.trunc(delta)));
    this.#anchor = next >= total ? null : next;
    this.#renderNow();
  };

  #move = (delta: number) => {
    if (this.#overlay.picker) return this.#overlay.move(delta);
    this.#question.move(delta);
  };

  #cancel = () => {
    if (this.#overlay.shown || this.#overlay.picker) return this.#overlay.dismiss();
    if (this.#question.typing && this.#transcript.question?.options?.length) return this.#question.backToChoices();
    const approval = this.#transcript.approval;
    if (approval) return void this.#agent.approve(approval.approvalId, false);
    const question = this.#transcript.question;
    if (question) return void this.#question.answer(question.questionId, {});
    if (this.#transcript.streaming) return void this.#agent.abort();
    if (!this.#editor.isEmpty) {
      this.#editor.clear();
      this.#renderNow();
    }
  };

  #interrupt = () => {
    if (this.#transcript.streaming) {
      void this.#agent.abort();
      this.#say("interrupted — ^c again to quit");
      return;
    }
    this.#quit();
  };

  #quit() {
    if (this.#exiting) return;
    this.#exiting = true;
    this.#stdout.write(`${CodeTuiMouse.off}${CodeTui.pasteOff}`);
    // clear() before unmount(): unmounting forgets the frame's height, so a later clear erases nothing.
    this.#instance.clear();
    this.#instance.unmount();
  }

  #submit = () => {
    const picker = this.#overlay.picker;
    if (picker) return this.#resume(picker.entries[picker.at]?.id);
    const question = this.#transcript.question;
    if (question) return void this.#question.answerCurrent(question.questionId);
    this.#prompt.submit();
  };

  #resume(id: string | undefined) {
    if (!id) return this.#overlay.dismiss();
    if (id === this.#transcript.info?.sessionId) return this.#overlay.dismiss();
    this.#switchTo = { id };
    this.#quit();
  }

  #command(line: string) {
    const [name, ...rest] = line.slice(1).split(" ");
    const argument = rest.join(" ").trim();
    switch (name) {
      case "help":
        return this.#overlay.open("help", CodeTuiCommands.help());
      case "quit":
      case "exit":
        return this.#quit();
      case "abort":
        return void this.#agent.abort();
      case "clear":
        this.#anchor = null;
        this.#transcript.clear();
        return this.#say("screen cleared · the model still remembers · /compact shortens what it carries");
      case "compact":
        return void this.#agent.compact(argument || undefined).catch((error: unknown) => this.#fail(error));
      case "autocompact":
        return this.#runner.setAutoCompact(argument);
      case "thinking":
        return this.#say(
          this.#frame.toggleThinking() ? "showing the model's reasoning" : "reasoning folded back to one line",
        );
      case "tools": {
        const tools = this.#transcript.info?.tools ?? [];
        return this.#overlay.open("tools", `${tools.length} tools\n\n${tools.join(" · ")}`);
      }
      case "model":
        return this.#runner.setModel(argument);
      case "effort":
        return this.#runner.setEffort(argument);
      case "peers":
        return this.#overlay.open("peers", CodeTuiCommandRunner.peerList(this.#agent.peers()));
      case "msg":
        return this.#runner.message(argument);
      case "fork":
        return this.#runner.fork(argument);
      case "agents":
        return this.#overlay.open("agents", this.#runner.agentList());
      case "mcp":
        return this.#runner.mcp(argument);
      case "name":
        if (!argument) return this.#overlay.open("name", "Usage: /name <what this session is about>");
        this.#agent.setName(argument);
        return this.#say(`session named ${argument}`);
      default:
        return this.#overlay.open("unknown command", `There is no /${name}.\n\n${CodeTuiCommands.help()}`);
    }
  }

  #fail(error: unknown) {
    this.#transcript.note("error", String(error));
    this.#renderNow();
  }

  #say(text: string) {
    this.#notice = text;
    if (this.#noticeTimer) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = setTimeout(() => {
      this.#notice = "";
      this.#renderNow();
    }, CodeTui.noticeMs);
    this.#renderNow();
  }
}
