import type { LogLevel } from "akanjs/common";

export interface NativeAppLineRead {
  level: LogLevel;
  message: string;
}

//* A line a native dev build prints — the page console its host mirrors, the simulator's console, logcat — read back
//* at the level the page logged it, so the terminal shows it once, stamped by the app's own logger.
export class NativeAppLine {
  //? The host's grammar (desktop host.ts, iOS AkanNativeShell.swift): `[page<+><#window> <level>] text`, where `+`
  //? marks a continuation line of a multi-line message and `#n` any window but the first.
  static readonly #page = /^\[page(\+)?(?:#(\d+))? (trace|verbose|debug|log|info|warn|error)\] ?(.*)$/;
  static readonly #logcat = /^([VDIWEFA])\/([^(]+?)\s*\(\s*\d+\):\s?(.*)$/;
  static readonly #named = /^\[([^\]\s]+)\] ([\s\S]*)$/;
  //? A server the desktop app carries (host server.ts): `[server] <its own log line>`, whose level word the akan logger
  //? wrote; a line without one (a crash's stack) is still the app's and stays visible.
  static readonly #server = /^\[server\] /;
  static readonly #serverLevel = /\b(TRACE|VERBOSE|DEBUG|INFO|WARN|ERROR)\b/;
  static readonly #logcatLevels: { [priority: string]: LogLevel } = {
    V: "verbose",
    D: "debug",
    I: "info",
    W: "warn",
    E: "error",
    F: "error",
    A: "error",
  };

  /** `verbose` keeps the lines no page or host wrote (WebKit, the simulator) at info instead of debug. */
  static read(line: string, { verbose = false }: { verbose?: boolean } = {}): NativeAppLineRead {
    const logcat = NativeAppLine.#logcat.exec(line);
    if (logcat) {
      const [, priority = "I", tag = "", text = ""] = logcat;
      const level = NativeAppLine.#logcatLevels[priority] ?? "info";
      if (tag === "AkanNativeConsole") return NativeAppLine.#pageLine(level, text, { continuation: false });
      if (tag === "AkanNative") return NativeAppLine.#hostLine(`[akan-native] ${text}`, level);
      return { level, message: `[${tag}] ${text}` };
    }
    const page = NativeAppLine.#page.exec(line);
    if (page) {
      const [, continuation, window, level = "info", text = ""] = page;
      return NativeAppLine.#pageLine(level === "log" ? "info" : (level as LogLevel), text, {
        continuation: continuation === "+",
        window,
      });
    }
    if (line.startsWith("[akan-native")) return NativeAppLine.#hostLine(line, "info");
    if (NativeAppLine.#server.test(line)) {
      const word = NativeAppLine.#serverLevel.exec(Bun.stripANSI(line))?.[1];
      return { level: word ? (word.toLowerCase() as LogLevel) : "info", message: line };
    }
    return { level: verbose ? "info" : "debug", message: line };
  }

  static #pageLine(
    level: LogLevel,
    text: string,
    { continuation, window }: { continuation: boolean; window?: string },
  ): NativeAppLineRead {
    if (continuation) return { level, message: `  ${text}` };
    const named = NativeAppLine.#named.exec(text);
    const scope = `page${window ? `#${window}` : ""}${named ? `:${named[1]}` : ""}`;
    return { level, message: `[${scope}] ${named ? named[2] : text}` };
  }

  //? The host's own lines are about the host, not the app: where its pages come from is boot detail.
  static #hostLine(line: string, level: LogLevel): NativeAppLineRead {
    return { level: /\bpages from\b/.test(line) ? "debug" : level, message: line };
  }
}
