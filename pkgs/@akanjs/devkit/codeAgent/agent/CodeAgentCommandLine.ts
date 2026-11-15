import path from "node:path";

interface ShellWord {
  text: string;
  expands: boolean;
  quoted: boolean;
}

type Redirect = "read" | "here" | "write" | "dup";

// Reads a shell line only as far as it is sure of: anything it does not model answers `undefined`, and the caller asks.
export class CodeAgentCommandLine {
  static readonly networkClients = [
    "curl",
    "wget",
    "nc",
    "ncat",
    "netcat",
    "socat",
    "telnet",
    "ssh",
    "scp",
    "sftp",
    "rsync",
    "ftp",
  ];
  static readonly wrappers = [
    "sudo",
    "env",
    "command",
    "exec",
    "nohup",
    "time",
    "timeout",
    "nice",
    "watch",
    "stdbuf",
    "xargs",
  ];
  // A wrapper or a shell runs whatever it is handed, so its name says nothing; `rm` and what leaves the machine cannot be undone.
  static readonly alwaysAsked = new Set([
    ...CodeAgentCommandLine.networkClients,
    ...CodeAgentCommandLine.wrappers,
    "sh",
    "bash",
    "zsh",
    "dash",
    "ksh",
    "fish",
    "eval",
    "builtin",
    "source",
    ".",
    "trap",
    "alias",
    "coproc",
    "export",
    "declare",
    "typeset",
    "readonly",
    "rm",
    "git push",
    "npm publish",
    "pnpm publish",
    "yarn publish",
    "yarn npm",
    "bun publish",
    "cargo publish",
    "docker push",
    "gh api",
  ]);
  // A variable in front of a command can change what that command runs, so only these are read past.
  static readonly harmlessVariables = new Set([
    "CI",
    "NODE_ENV",
    "FORCE_COLOR",
    "NO_COLOR",
    "TZ",
    "LANG",
    "LC_ALL",
    "TERM",
    "DEBUG",
    "PORT",
  ]);
  // `gh` groups its verbs one level down: `gh pr view` and `gh pr merge` are different commands.
  static readonly #subcommandDepth = new Map([
    ["git", 1],
    ["bun", 1],
    ["bunx", 1],
    ["npm", 1],
    ["npx", 1],
    ["pnpm", 1],
    ["yarn", 1],
    ["akan", 1],
    ["docker", 1],
    ["kubectl", 1],
    ["helm", 1],
    ["cargo", 1],
    ["go", 1],
    ["gh", 2],
  ]);
  static readonly #reserved = new Set([
    "if",
    "then",
    "else",
    "elif",
    "fi",
    "for",
    "while",
    "until",
    "do",
    "done",
    "case",
    "esac",
    "select",
    "function",
    "in",
    "coproc",
  ]);
  static readonly #runsItsArguments = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
  static readonly #assignment = /^([A-Za-z_]\w*)(\+?=)(.*)$/s;
  static readonly #plainValue = /^[\w@%+.,:/*-]*$/;
  // bash opens a redirection to `/dev/tcp/<host>/<port>` or `/dev/udp/…` as a connection, not a file.
  static readonly #socketPath = /^\/+dev\/+(?:tcp|udp)\//i;
  static readonly #program = /^[\w@%+.,:/~-]+$/;
  static readonly #subcommand = /^[A-Za-z0-9@][\w@.:/-]*$/;
  static readonly #redirectOperator = /^(?:<<<|<<|<>|<&|<|>>|>&|>\||>)/;

  readonly #line: string;
  readonly #commands: ShellWord[][] = [];
  #at: number;
  #words: ShellWord[] = [];
  #word: ShellWord | undefined;
  #redirect: Redirect | undefined;

  private constructor(line: string, at = 0) {
    this.#line = line;
    this.#at = at;
  }

  static allowable(line: string): string[] | undefined {
    const parsed = new CodeAgentCommandLine(line);
    if (!parsed.#read()) return undefined;
    const names: string[] = [];
    for (const words of parsed.#commands) {
      const name = CodeAgentCommandLine.#nameOf(words);
      if (!name) return undefined;
      names.push(name);
    }
    return names.length ? [...new Set(names)] : undefined;
  }

  static #nameOf(words: ShellWord[]) {
    const [program] = words;
    if (!program || program.expands || !CodeAgentCommandLine.#program.test(program.text)) return undefined;
    // Lowercased: a case-insensitive disk runs `CURL` as `curl`.
    const base = path.posix.basename(program.text).toLowerCase();
    if (CodeAgentCommandLine.#reserved.has(base) || CodeAgentCommandLine.alwaysAsked.has(base)) return undefined;
    if (words.some((word) => CodeAgentCommandLine.#runsItsArguments.has(word.text))) return undefined;
    const depth = CodeAgentCommandLine.#subcommandDepth.get(base);
    if (!depth) return program.text;
    // The words right after the program, or nothing: `git -C <dir> push` would otherwise be named `git <dir>`.
    const subs = words.slice(1, 1 + depth);
    if (!subs.length || subs.some((sub) => sub.expands || !CodeAgentCommandLine.#subcommand.test(sub.text)))
      return undefined;
    const names = subs.map((_, idx) =>
      subs
        .slice(0, idx + 1)
        .map((sub) => sub.text)
        .join(" "),
    );
    if (names.some((name) => CodeAgentCommandLine.alwaysAsked.has(`${base} ${name}`))) return undefined;
    return `${program.text} ${names.at(-1)}`;
  }

  static #harmless(word: ShellWord) {
    const [, name = "", operator, value = ""] = CodeAgentCommandLine.#assignment.exec(word.text) ?? [];
    if (operator !== "=" || word.quoted || word.expands) return false;
    return CodeAgentCommandLine.harmlessVariables.has(name) && CodeAgentCommandLine.#plainValue.test(value);
  }

  #read(close?: ")"): boolean {
    while (this.#at < this.#line.length) {
      const char = this.#line[this.#at] ?? "";
      if (char === close) {
        this.#at += 1;
        return this.#endCommand();
      }
      if (!this.#step(char)) return false;
    }
    return close === undefined && this.#endCommand();
  }

  #step(char: string): boolean {
    const next = this.#line[this.#at + 1];
    switch (char) {
      case " ":
      case "\t":
        this.#at += 1;
        return this.#endWord();
      case "\n":
      case ";":
        this.#at += 1;
        return this.#endCommand();
      case "&":
        if (next === ">") {
          this.#at += 1;
          return this.#endWord() && this.#redirection();
        }
        this.#at += next === "&" ? 2 : 1;
        return this.#endCommand();
      case "|":
        this.#at += next === "|" || next === "&" ? 2 : 1;
        return this.#endCommand();
      case "(":
        if (this.#word) return false;
        this.#at += 1;
        return this.#endCommand() && this.#nested();
      case "<":
      case ">":
        return this.#redirection();
      case "'":
        return this.#single();
      case '"':
        return this.#double();
      case "$":
        return this.#dollar();
      case ")":
      case "`":
        return false;
      case "\\":
        if (next === undefined) return false;
        this.#at += 2;
        if (next === "\n") return true;
        this.#quote();
        this.#append(next);
        return true;
      case "#":
        if (this.#word) break;
        while (this.#at < this.#line.length && this.#line[this.#at] !== "\n") this.#at += 1;
        return true;
    }
    this.#at += 1;
    this.#append(char);
    return true;
  }

  #append(text: string) {
    this.#word ??= { text: "", expands: false, quoted: false };
    this.#word.text += text;
  }

  #quote() {
    this.#append("");
    if (this.#word) this.#word.quoted = true;
  }

  #expand() {
    this.#append("");
    if (this.#word) this.#word.expands = true;
  }

  #endWord(): boolean {
    const word = this.#word;
    const redirect = this.#redirect;
    if (!word) return true;
    this.#word = undefined;
    if (!redirect) {
      this.#words.push(word);
      return true;
    }
    this.#redirect = undefined;
    if (redirect === "here") return true;
    if (word.expands) return false;
    if (redirect === "read") return !CodeAgentCommandLine.#socketPath.test(word.text);
    // A file written through a redirection is outside what a command's name covers, wherever the file is.
    return redirect === "dup" ? /^(?:\d+|-)$/.test(word.text) : word.text === "/dev/null";
  }

  #endCommand(): boolean {
    if (!this.#endWord() || this.#redirect) return false;
    const from = this.#words.findIndex((word) => !CodeAgentCommandLine.#assignment.test(word.text));
    const assigned = from < 0 ? this.#words : this.#words.slice(0, from);
    if (!assigned.every((word) => CodeAgentCommandLine.#harmless(word))) return false;
    if (from >= 0) this.#commands.push(this.#words.slice(from));
    this.#words = [];
    return true;
  }

  #redirection(): boolean {
    if (this.#word && !this.#word.expands && !this.#word.quoted && /^\d+$/.test(this.#word.text))
      this.#word = undefined;
    else if (!this.#endWord()) return false;
    const operator = CodeAgentCommandLine.#redirectOperator.exec(this.#line.slice(this.#at, this.#at + 3))?.[0] ?? "";
    this.#at += operator.length;
    if (!operator || operator === "<<" || this.#redirect || this.#line[this.#at] === "(") return false;
    if (operator === "<<<") this.#redirect = "here";
    else if (operator === "<") this.#redirect = "read";
    else this.#redirect = operator.endsWith("&") ? "dup" : "write";
    return true;
  }

  #single(): boolean {
    const end = this.#line.indexOf("'", this.#at + 1);
    if (end < 0) return false;
    this.#quote();
    this.#append(this.#line.slice(this.#at + 1, end));
    this.#at = end + 1;
    return true;
  }

  #double(): boolean {
    this.#at += 1;
    this.#quote();
    while (this.#at < this.#line.length) {
      const char = this.#line[this.#at] ?? "";
      if (char === '"') {
        this.#at += 1;
        return true;
      }
      if (char === "`") return false;
      if (char === "$") {
        if (!this.#dollar()) return false;
        continue;
      }
      if (char !== "\\") {
        this.#at += 1;
        this.#append(char);
        continue;
      }
      const next = this.#line[this.#at + 1];
      if (next === undefined) return false;
      this.#at += 2;
      if (next !== "\n") this.#append('$`"\\'.includes(next) ? next : `\\${next}`);
    }
    return false;
  }

  #dollar(): boolean {
    const rest = this.#line.slice(this.#at + 1);
    // `$((…))` is arithmetic, and `$'…'` decodes escapes into characters this reader would not see.
    if (rest.startsWith("((") || rest.startsWith("'") || rest.startsWith('"')) return false;
    if (rest.startsWith("(")) {
      this.#at += 2;
      this.#expand();
      return this.#nested();
    }
    if (rest.startsWith("{")) {
      const end = rest.indexOf("}");
      if (end < 0 || /[$`]/.test(rest.slice(1, end))) return false;
      this.#at += end + 2;
      this.#expand();
      return true;
    }
    const name = /^(?:\w+|[?!#@*$-])/.exec(rest)?.[0];
    this.#at += 1 + (name?.length ?? 0);
    if (name) this.#expand();
    else this.#append("$");
    return true;
  }

  #nested(): boolean {
    const inner = new CodeAgentCommandLine(this.#line, this.#at);
    const read = inner.#read(")");
    this.#at = inner.#at;
    this.#commands.push(...inner.#commands);
    return read;
  }
}
