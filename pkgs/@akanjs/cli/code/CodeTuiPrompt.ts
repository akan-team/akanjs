import type { CodeAgent } from "@akanjs/devkit/codeAgent";
import type { CodeTranscript } from "akanjs/common";
import { type CodeTuiEditKey, type CodeTuiOption, type CodeTuiSnapshot, promptMarkWidth } from "../ui/CodeTuiApp";
import { CodeTuiClipboard } from "./CodeTuiClipboard";
import { CodeTuiCommands } from "./CodeTuiCommands";
import type { CodeTuiEditor } from "./CodeTuiEditor";
import { CodeTuiFiles } from "./CodeTuiFiles";
import { type CodeTuiAskBlock, CodeTuiFrame } from "./CodeTuiFrame";
import type { CodeTuiOverlay } from "./CodeTuiOverlay";

interface CodeTuiMenu {
  kind: "command" | "file";
  from: number;
  to: number;
  options: CodeTuiOption[];
}

interface CodeTuiPromptHost {
  render: () => void;
  snapshot: () => CodeTuiSnapshot;
  say: (text: string) => void;
  fail: (error: unknown) => void;
  command: (line: string) => void;
}

export class CodeTuiPrompt {
  static readonly clipboardMs = 2_000;
  static readonly imageMark = /\[image #(\d+)] ?/g;

  readonly #agent: CodeAgent;
  readonly #transcript: CodeTranscript;
  readonly #editor: CodeTuiEditor;
  readonly #overlay: CodeTuiOverlay;
  readonly #host: CodeTuiPromptHost;
  readonly #files: CodeTuiFiles;
  readonly #history: string[] = [];
  #historyAt = -1;
  #menuAt = 0;
  #images: string[] = [];
  #offered = false;
  #clipboardTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    agent: CodeAgent,
    transcript: CodeTranscript,
    editor: CodeTuiEditor,
    overlay: CodeTuiOverlay,
    host: CodeTuiPromptHost,
  ) {
    this.#agent = agent;
    this.#transcript = transcript;
    this.#editor = editor;
    this.#overlay = overlay;
    this.#host = host;
    this.#files = new CodeTuiFiles(agent.profile.paths.root);
  }

  get offered() {
    return this.#offered;
  }

  load() {
    return this.#files.load();
  }

  watchClipboard() {
    if (!this.#agent.canSeeImages) return;
    this.#clipboardTimer = setInterval(() => {
      const offered = CodeTuiClipboard.has();
      if (offered === this.#offered) return;
      this.#offered = offered;
      this.#host.render();
    }, CodeTuiPrompt.clipboardMs);
  }

  unwatchClipboard() {
    if (this.#clipboardTimer) clearInterval(this.#clipboardTimer);
    this.#clipboardTimer = null;
  }

  block(columns: number, frameRows: number): CodeTuiAskBlock {
    const all = this.#menu()?.options ?? [];
    const { rows, row, col } = this.#editor.layout(columns - promptMarkWidth - 1);
    const offered = this.#offered ? 1 : 0;
    const room =
      frameRows - CodeTuiFrame.minBodyRows - CodeTuiFrame.chromeRows - 2 * CodeTuiFrame.promptRuleRows - offered;
    const menuRows = Math.max(0, Math.min(all.length, room - 1));
    const menuFrom = Math.max(0, Math.min(this.#menuAt - Math.floor(menuRows / 2), all.length - menuRows));
    const menu = all.slice(menuFrom, menuFrom + menuRows);
    const above = menu.length + CodeTuiFrame.promptRuleRows + offered;
    const chrome = above + CodeTuiFrame.promptRuleRows;
    const budget = Math.max(1, Math.min(CodeTuiFrame.maxInputRows, room - menu.length));
    const first = Math.max(0, Math.min(row - budget + 1, rows.length - budget));
    const shown = rows.slice(first, first + budget);
    return {
      rows: chrome + shown.length,
      above,
      selected: 0,
      caret: { row: row - first, col },
      snapshot: {
        input: shown.map((entry) => entry.text),
        menu,
        menuSelected: this.#menuAt - menuFrom,
        options: [] as CodeTuiOption[],
      },
    };
  }

  #menu(): CodeTuiMenu | null {
    const prefix = CodeTuiCommands.prefixOf(this.#editor.text, this.#editor.caret);
    if (prefix !== undefined)
      return {
        kind: "command",
        from: 0,
        to: this.#editor.text.length,
        options: CodeTuiCommands.matches(prefix).map((command) => ({
          key: command.name,
          label: `/${command.name}${command.arg ? ` ${command.arg}` : ""}`,
          detail: command.desc,
        })),
      };
    const token = this.#editor.token();
    if (!token.text.startsWith("@")) return null;
    const options = this.#files.match(token.text.slice(1)).map((file) => ({ key: file, label: `@${file}` }));
    if (!options.length && this.#files.ready) return null;
    return { kind: "file", from: token.from, to: token.to, options };
  }

  type = (text: string) => {
    const pasted = this.#agent.canSeeImages ? CodeTuiClipboard.imagePathsIn(text) : undefined;
    if (pasted?.images.length) {
      for (const file of pasted.images) this.#attach(file);
      if (pasted.rest) this.#editor.insert(pasted.rest);
    } else this.#editor.insert(text);
    this.#menuAt = 0;
    this.#historyAt = -1;
    this.#host.render();
  };

  newline = () => {
    this.#editor.newline();
    this.#historyAt = -1;
    this.#host.render();
  };

  edit = (action: CodeTuiEditKey) => {
    const width = this.#host.snapshot().columns - promptMarkWidth - 1;
    const run: { [key in CodeTuiEditKey]: () => void } = {
      backspace: () => this.#editor.backspace(),
      delete: () => this.#editor.deleteForward(),
      left: () => (this.#editor.caret ? this.#editor.left() : this.#overlay.openSessions()),
      right: () => this.#editor.right(),
      wordLeft: () => this.#editor.wordLeft(),
      wordRight: () => this.#editor.wordRight(),
      home: () => this.#editor.homeOfRow(width),
      end: () => this.#editor.endOfRow(width),
      deleteWord: () => this.#editor.deleteWord(),
      deleteToStart: () => this.#editor.deleteToLineStart(),
    };
    run[action]();
    // A caret move is not an edit, so it leaves a recalled entry recalled and the arrows on history.
    if (action.startsWith("delete") || action === "backspace") this.#historyAt = -1;
    this.#host.render();
  };

  vertical(delta: -1 | 1) {
    const menu = this.#menu()?.options ?? [];
    if (menu.length) {
      this.#menuAt = (this.#menuAt + delta + menu.length) % menu.length;
      return this.#host.render();
    }
    // While a recalled entry is shown the arrows stay on history; a wrapped entry would otherwise swallow them.
    if (this.#historyAt < 0 && this.#editor.move(delta, this.#host.snapshot().columns - promptMarkWidth - 1))
      return this.#host.render();
    if (delta < 0) return this.#historyPrev();
    return this.#historyNext();
  }

  complete = () => {
    const menu = this.#menu();
    const chosen = menu?.options[this.#menuAt];
    if (!menu || !chosen) return;
    const command = CodeTuiCommands.all.find((entry) => entry.name === chosen.key);
    const text = menu.kind === "command" ? `/${chosen.key}${command?.arg ? " " : ""}` : `@${chosen.key} `;
    this.#editor.replace(menu.from, menu.to, text);
    this.#menuAt = 0;
    this.#host.render();
  };

  #historyPrev() {
    if (!this.#history.length) return;
    this.#historyAt = this.#historyAt < 0 ? this.#history.length - 1 : Math.max(0, this.#historyAt - 1);
    this.#editor.set(this.#history[this.#historyAt] ?? "");
    this.#host.render();
  }

  #historyNext() {
    if (this.#historyAt < 0) return;
    this.#historyAt += 1;
    if (this.#historyAt >= this.#history.length) {
      this.#historyAt = -1;
      this.#editor.clear();
    } else this.#editor.set(this.#history[this.#historyAt] ?? "");
    this.#host.render();
  }

  submit() {
    const menu = this.#menu();
    if (menu?.kind === "file") return this.complete();
    const chosen = menu?.options[this.#menuAt];
    const raw = chosen ? `/${chosen.key}` : this.#editor.text;
    const pending = this.#pending(raw);
    if (!pending.text && !pending.images.length) return;
    this.#editor.clear();
    this.#historyAt = -1;
    if (pending.text) this.#history.push(pending.text);
    if (pending.text.startsWith("/")) return this.#host.command(pending.text);
    this.send(pending.text, pending.images);
  }

  send(text: string, images: { path: string }[] = []) {
    this.#images = [];
    this.#transcript.echo(text, images.length);
    this.#host.render();
    void this.#agent.prompt(text, images).catch((error: unknown) => this.#host.fail(error));
  }

  // A terminal paste carries only text, so an image has to be read off the OS clipboard.
  paste = () => {
    if (!this.#agent.canSeeImages)
      return this.#overlay.open("images", CodeTuiPrompt.#imageHelp(this.#transcript.info?.model));
    void CodeTuiClipboard.image()
      .then((file) => (file ? this.#attach(file) : this.#host.say("nothing on the clipboard we can attach")))
      .catch((error: unknown) => this.#host.fail(error));
  };

  pasted = (text: string) => {
    // A terminal sends a newline inside a paste as a carriage return; the prompt stores newlines.
    if (text) return this.type(text.replace(/\r\n?/g, "\n"));
    if (CodeTuiClipboard.has()) this.paste();
  };

  // The marker is the attachment: deleting it from the prompt before enter un-attaches the image.
  #attach(file: string) {
    this.#images.push(file);
    this.#editor.insert(`[image #${this.#images.length}] `);
    this.#host.render();
  }

  #pending(text: string) {
    const marks = [...text.matchAll(CodeTuiPrompt.imageMark)].map((match) => Number(match[1]));
    const images = marks
      .map((mark) => this.#images[mark - 1])
      .filter((file): file is string => !!file)
      .map((path) => ({ path }));
    // Only the marker's own trailing space goes; collapsing spaces would damage a pasted stack trace.
    return { images, text: text.replace(CodeTuiPrompt.imageMark, "").trim() };
  }

  static #imageHelp(model: { provider: string; id: string } | undefined) {
    const provider = model?.provider ?? "<provider>";
    const id = model?.id ?? "<model>";
    return [
      `The model catalogue declares ${provider}/${id} text-only, so an image would go to a model that cannot read it.`,
      "",
      "If that is wrong, override the entry in ~/.akan/code/models.json:",
      "",
      `{"providers":{"${provider}":{"modelOverrides":{"${id}":{"input":["text","image"]}}}}}`,
    ].join("\n");
  }
}
