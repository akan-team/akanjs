export interface CodeTuiCommand {
  name: string;
  desc: string;
  arg?: string;
}

export class CodeTuiCommands {
  static readonly all: CodeTuiCommand[] = [
    { name: "help", desc: "list these commands and the keys" },
    { name: "tools", desc: "what this session can call" },
    { name: "model", desc: "switch model, or list what is available", arg: "[<provider>/<id>]" },
    { name: "effort", desc: "how hard the model thinks before it answers", arg: "<level>" },
    { name: "thinking", desc: "show the model's reasoning, or fold it away again" },
    { name: "compact", desc: "summarise the conversation to free the window", arg: "[notes]" },
    { name: "autocompact", desc: "how full the window gets before it is summarised", arg: "[<percent>]" },
    { name: "abort", desc: "stop the running turn" },
    { name: "clear", desc: "wipe the screen; the model keeps the conversation" },
    { name: "name", desc: "name this session", arg: "<text>" },
    { name: "fork", desc: "continue this conversation twice; the copy takes over here", arg: "[name]" },
    { name: "agents", desc: "what a sub-agent may be, and what one may spend" },
    { name: "mcp", desc: "the MCP servers this session reached", arg: "[add|remove|login|reload]" },
    { name: "peers", desc: "the other akan code sessions running here" },
    { name: "msg", desc: "hand a message to another session", arg: "<peer> <text>" },
    { name: "quit", desc: "leave the session" },
  ];

  /** The command prefix under the caret, or undefined once the caret has left the command's first word. */
  static prefixOf(text: string, caret: number) {
    if (!text.startsWith("/")) return undefined;
    const head = text.slice(0, caret);
    if (/\s/.test(head) || head.includes("\n")) return undefined;
    return head.slice(1);
  }

  static matches(prefix: string) {
    const needle = prefix.toLowerCase();
    return CodeTuiCommands.all.filter((command) => command.name.startsWith(needle));
  }

  static help() {
    const usage = (command: CodeTuiCommand) => `/${command.name}${command.arg ? ` ${command.arg}` : ""}`;
    const column = Math.max(...CodeTuiCommands.all.map((command) => usage(command).length)) + 2;
    const list = CodeTuiCommands.all.map((command) => `${usage(command).padEnd(column)}${command.desc}`).join("\n");
    return [
      list,
      "",
      "Keys: enter send · shift+enter newline · ↑↓ move (history at the edges) · ←→ move",
      "esc interrupt · pgup/pgdn scroll · ^c quit",
      "@ completes a file in this repo · ← at the start of the prompt lists past sessions",
      "",
      "Scroll: the wheel scrolls this transcript · hold shift to select text with the mouse instead",
      "",
      "Images: cmd+v attaches what is on the clipboard · ^v does too, without the terminal in the way",
      "",
      'shift+enter needs a terminal that reports it — in VS Code bind it to send "\\\\u001b\\r".',
    ].join("\n");
  }
}
