import { Box, Text, useCursor, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import type { CodeTuiLine, CodeTuiSpan } from "../code/CodeTuiLines";
import { CodeTuiMouse } from "../code/CodeTuiMouse";

export interface CodeTuiOption {
  key: string;
  label: string;
  detail?: string;
}

export interface CodeTuiSnapshot {
  topRule: CodeTuiSpan[];
  bottomRule: CodeTuiSpan[];
  lines: CodeTuiLine[]; // windowed and wrapped by the controller: one entry is exactly one row
  above: number;
  below: number;
  following: boolean;
  // `selectable`: enter picks the highlighted row rather than closing the overlay.
  overlay: { title: string; lines: CodeTuiLine[]; above: number; below: number; selectable: boolean } | null;
  status: string;
  subagents: CodeTuiLine[];
  mode: "input" | "select" | "confirm";
  input: string[];
  placeholder: string;
  offered: boolean; // the clipboard holds an image to attach
  cursor: { x: number; y: number } | null; // in frame cells, so an IME draws its composing text at the caret
  prompt: string;
  options: CodeTuiOption[];
  selected: number;
  checked: string[];
  multiSelect: boolean;
  menu: CodeTuiOption[];
  menuSelected: number;
  notice: string;
  hint: string;
  columns: number;
  frameRows: number;
  bodyHeight: number;
}

export interface CodeTuiActions {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => CodeTuiSnapshot;
  type: (text: string) => void;
  edit: (key: CodeTuiEditKey) => void;
  submit: () => void;
  newline: () => void;
  paste: () => void;
  pasted: (text: string) => void;
  complete: () => void;
  vertical: (delta: -1 | 1) => void;
  scroll: (delta: number) => void;
  move: (delta: number) => void;
  toggle: () => void;
  answerConfirm: (value: boolean) => void;
  allowForSession: () => void;
  cancel: () => void;
  interrupt: () => void;
}

export type CodeTuiEditKey =
  | "backspace"
  | "delete"
  | "left"
  | "right"
  | "wordLeft"
  | "wordRight"
  | "home"
  | "end"
  | "deleteWord"
  | "deleteToStart";

export const promptMarkWidth = 2; // the `› ` / `◐ ` marker every prompt row carries

// Ink strips the leading ESC of the bracketed-paste markers `ESC[200~` / `ESC[201~` before the handler sees them.
const pasteOpen = "[200~";
const pasteClose = "[201~";

// A shift+enter binding sent as `\` + return arrives as one unparsed chunk; the ESC-separated spelling is split by
// Ink instead, which is why its backslash is removed in `CodeTuiEditor.newline`.
const continuation = /^[^\r\n]*\\(?:\r\n|[\r\n])$/;

const Styled = ({ span }: { span: CodeTuiSpan }) => (
  <Text
    bold={span.bold}
    color={span.color}
    dimColor={span.dim}
    italic={span.italic}
    strikethrough={span.strikethrough}
    underline={span.underline}
  >
    {span.text}
  </Text>
);

const Line = ({ line }: { line: CodeTuiLine }) => (
  <Text wrap="truncate">
    {line.spans.map((span, at) => (
      <Styled key={`${line.key}:${at}`} span={span} />
    ))}
  </Text>
);

const Transcript = ({ lines, width, height }: { lines: CodeTuiLine[]; width: number; height: number }) => (
  <Box flexDirection="column" width={width} height={height} paddingX={1}>
    {lines.map((line) => (
      <Line key={line.key} line={line} />
    ))}
  </Box>
);

const Overlay = ({
  overlay,
  width,
  height,
}: {
  overlay: NonNullable<CodeTuiSnapshot["overlay"]>;
  width: number;
  height: number;
}) => (
  <Box borderDimColor borderStyle="round" flexDirection="column" height={height} paddingX={1} width={width}>
    <Text wrap="truncate">
      <Text bold color="cyan">
        {overlay.title}
      </Text>
      {overlay.above || overlay.below ? <Text dimColor>{`  ▲${overlay.above} ▼${overlay.below}`}</Text> : null}
    </Text>
    {overlay.lines.map((line) => (
      <Line key={line.key} line={line} />
    ))}
  </Box>
);

const Rule = ({ spans }: { spans: CodeTuiSpan[] }) => (
  <Text wrap="truncate">
    {spans.map((span, at) => (
      <Styled key={`${at}:${span.text}`} span={span} />
    ))}
  </Text>
);

interface MenuProps {
  options: CodeTuiOption[];
  selected: number;
  marker: boolean;
  checked?: string[];
}

const Menu = ({ options, selected, marker, checked }: MenuProps) => (
  <Box flexDirection="column">
    {options.map((option, idx) => (
      <Text key={option.key} wrap="truncate">
        <Text color={idx === selected ? "cyan" : undefined}>{idx === selected ? "❯ " : "  "}</Text>
        {checked ? <Text>{checked.includes(option.key) ? "[x] " : "[ ] "}</Text> : null}
        <Text bold={idx === selected && marker}>{option.label}</Text>
        {option.detail ? <Text dimColor>{`  ${option.detail}`}</Text> : null}
      </Text>
    ))}
  </Box>
);

export const CodeTuiApp = ({ actions }: { actions: CodeTuiActions }) => {
  const [snapshot, setSnapshot] = useState(actions.snapshot);
  const pasting = useRef<string[] | null>(null);
  const mouse = useRef(new CodeTuiMouse());
  const { setCursorPosition } = useCursor();

  useEffect(() => {
    const unsubscribe = actions.subscribe(() => setSnapshot(actions.snapshot()));
    setSnapshot(actions.snapshot());
    return unsubscribe;
  }, [actions]);

  // Set during render: `useCursor` applies the value from the next render's insertion effect, so a position set
  // after commit trails a frame behind — and an IME draws its composing text wherever the cursor is.
  setCursorPosition(snapshot.cursor ?? undefined);

  useInput((input, key) => {
    const page = Math.max(1, snapshot.bodyHeight - 3);
    // A paste is collected whole: a pasted newline would otherwise submit half of it.
    if (input === pasteOpen) {
      pasting.current = [];
      return;
    }
    if (input === pasteClose) {
      const text = pasting.current?.join("") ?? "";
      pasting.current = null;
      return actions.pasted(text);
    }
    if (pasting.current) {
      pasting.current.push(key.return ? "\n" : key.tab ? "\t" : input);
      return;
    }
    // Before every key: a wheel report is a CSI sequence that would otherwise be typed into the prompt.
    const wheel = mouse.current.read(input);
    if (wheel) {
      if (wheel.rows) actions.scroll(wheel.rows);
      if (wheel.rest) actions.type(wheel.rest);
      return;
    }
    if (key.ctrl && input === "c") return actions.interrupt();
    if (key.pageUp) return actions.scroll(-page);
    if (key.pageDown) return actions.scroll(page);
    if (key.escape) return actions.cancel();
    if (snapshot.overlay) {
      if (key.upArrow) return actions.scroll(-1);
      if (key.downArrow) return actions.scroll(1);
      if (key.return) return snapshot.overlay.selectable ? actions.submit() : actions.cancel();
      return;
    }
    if (snapshot.mode === "confirm") {
      if (input === "y" || input === "Y") return actions.answerConfirm(true);
      if (input === "n" || input === "N") return actions.answerConfirm(false);
      if (input === "a" || input === "A") return actions.allowForSession();
      return;
    }
    if (snapshot.mode === "select") {
      if (key.upArrow) return actions.move(-1);
      if (key.downArrow) return actions.move(1);
      if (input === " " && snapshot.multiSelect) return actions.toggle();
      if (key.return) return actions.submit();
      return;
    }
    if (key.tab) return actions.complete();
    if (key.upArrow) return actions.vertical(-1);
    if (key.downArrow) return actions.vertical(1);
    if (key.leftArrow) return actions.edit(key.meta ? "wordLeft" : "left");
    if (key.rightArrow) return actions.edit(key.meta ? "wordRight" : "right");
    // Without the kitty protocol, shift+enter arrives as ESC+CR (meta+return) or a bare LF, which is ^j.
    if (key.return && (key.shift || key.meta)) return actions.newline();
    if (key.ctrl && input === "j") return actions.newline();
    if (continuation.test(input)) {
      actions.type(input.replace(/[\r\n]+$/, ""));
      return actions.newline();
    }
    if (key.return) return actions.submit();
    if (key.backspace || key.delete) return actions.edit(key.meta ? "deleteWord" : "backspace");
    if (key.ctrl && input === "w") return actions.edit("deleteWord");
    if (key.ctrl && input === "u") return actions.edit("deleteToStart");
    if (key.ctrl && input === "a") return actions.edit("home");
    if (key.ctrl && input === "e") return actions.edit("end");
    if (key.ctrl && input === "d") return actions.edit("delete");
    if (key.ctrl && input === "v") return actions.paste();
    if (input && !key.ctrl && !key.meta) return actions.type(input);
  });

  const paneWidth = snapshot.columns;
  return (
    <Box flexDirection="column" width={paneWidth} height={snapshot.frameRows}>
      {snapshot.overlay ? (
        <Overlay height={snapshot.bodyHeight} overlay={snapshot.overlay} width={paneWidth} />
      ) : (
        <Transcript height={snapshot.bodyHeight} lines={snapshot.lines} width={paneWidth} />
      )}
      {snapshot.menu.length ? <Menu marker options={snapshot.menu} selected={snapshot.menuSelected} /> : null}
      <Rule spans={snapshot.topRule} />
      {snapshot.mode === "input" ? (
        <Box flexDirection="column">
          {snapshot.offered ? (
            <Text dimColor wrap="truncate">
              {"  ⧉ an image is on your clipboard — cmd+v or ^v attaches it"}
            </Text>
          ) : null}
          {snapshot.input.map((row, at) => (
            <Text key={`in:${at}`} wrap="truncate">
              <Text color={snapshot.status ? "yellow" : "cyan"}>
                {at === 0 ? (snapshot.status ? "◐ " : "› ") : "  "}
              </Text>
              {at === 0 && !row && snapshot.input.length === 1 ? (
                <Text dimColor>{snapshot.placeholder}</Text>
              ) : (
                <Text>{row}</Text>
              )}
            </Text>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color="yellow" wrap="truncate">
            {snapshot.prompt}
          </Text>
          {snapshot.options.length ? (
            <Menu
              checked={snapshot.multiSelect ? snapshot.checked : undefined}
              marker={false}
              options={snapshot.options}
              selected={snapshot.selected}
            />
          ) : null}
        </Box>
      )}
      {snapshot.subagents.length ? (
        <Box flexDirection="column">
          {snapshot.subagents.map((line) => (
            <Line key={line.key} line={line} />
          ))}
        </Box>
      ) : null}
      <Rule spans={snapshot.bottomRule} />
      {snapshot.notice ? (
        <Text color="cyan" wrap="truncate">
          {snapshot.notice}
        </Text>
      ) : (
        <Text dimColor wrap="truncate">
          {snapshot.hint}
        </Text>
      )}
    </Box>
  );
};
