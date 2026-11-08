import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeAgentProfile } from "akanjs/common";
import { akanCodePaths } from "./akanCodePaths";
import { codeAgentHostListed, codeAgentHostOf, codeAgentIsLoopback } from "./codeAgentHosts";
import { stringArg } from "./stringArg";

const writeTools = new Set(["write", "edit"]);
const commandTools = new Set(["bash"]);
// A client in command position (after a separator, `sh -c '`, `-exec`), past `VAR=value` and wrappers like `timeout 5`.
// Gaps are spaces and tabs only: a newline is itself a separator, and letting `\s` take it too backtracks polynomially.
const networkClients =
  /(?:^[ \t]*|[\n;&|(`{][ \t]*|\s-\w*c\s+['"][ \t]*|\s-exec(?:dir)?\s+)(?:(?:[A-Za-z_]\w*=\S*|sudo|env|command|exec|nohup|time|timeout|nice|watch|stdbuf|xargs|-\S+|\d\S*)[ \t]+)*(?:[^\s;&|()`'"]*\/)?(curl|wget|nc|ncat|netcat|socat|telnet|ssh|scp|sftp|rsync|ftp)(?=$|[\s;&|)`'"])/g;
const urlPattern = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`<>|;&()]+/gi;
// curl and wget read a `host:port` argument without a scheme as http.
const hostPortPattern = /(?<=^|[\s'"=])(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+):\d{1,5}(?=[/?#\s'"]|$)/gi;
// A glob in a command that also matches these names is a broad sweep (`*.ts`), not an aim at one secret file.
const ordinaryNames = ["index.ts", "a.ts", "a.tsx", "a.js", "a.json", "a.yaml", "a.md", "a.txt", "a.log", "README"];

export interface GateVerdict {
  /** `undefined` means the call may run without asking. */
  block?: string;
  approval?: string;
  /** Refused, not run, when nobody can be asked: the call would leave the machine. */
  strict?: boolean;
}

interface NameRule {
  glob: Bun.Glob;
  samples: string[];
}

// Gated here, not in the engine's file-ops port: a throw there reads to the model as a tool bug, and it retries.
export class CodeAgentGate {
  readonly #profile: CodeAgentProfile;
  readonly #realRoot: string;
  readonly #deny: Bun.Glob[];
  readonly #allow: Bun.Glob[];
  readonly #deniedFragments: string[];
  readonly #nameRules: NameRule[];

  constructor(profile: CodeAgentProfile) {
    this.#profile = profile;
    this.#realRoot = CodeAgentGate.#real(path.resolve(profile.paths.root));
    const home = homedir();
    const codeHome = path.resolve(akanCodePaths.globalDir());
    const patterns = [
      ...(profile.paths.deny ?? []).map((pattern) =>
        pattern.startsWith("~/") ? path.join(home, pattern.slice(2)) : pattern,
      ),
      ...(profile.paths.deny?.length ? [`${codeHome}/**`] : []),
    ];
    this.#deny = patterns.map((pattern) => new Bun.Glob(pattern));
    this.#allow = (profile.paths.allow ?? []).map((pattern) => new Bun.Glob(pattern));
    this.#deniedFragments = [
      ...new Set(
        (profile.paths.deny ?? [])
          .flatMap(CodeAgentGate.#expandBraces)
          .flatMap((pattern) => CodeAgentGate.#fragmentsOf(pattern, home)),
      ),
    ].filter(Boolean);
    this.#nameRules = (profile.paths.deny ?? []).flatMap((pattern) => {
      const name = /^\*\*\/([^/]+)$/.exec(pattern)?.[1];
      if (!name || name === "**") return [];
      const samples = CodeAgentGate.#expandBraces(name).map((entry) => entry.replace(/[*?]/g, "x"));
      return [{ glob: new Bun.Glob(name), samples }];
    });
  }

  verdict(toolName: string, args: unknown): GateVerdict {
    const target = stringArg(args, "path");
    if (target) {
      const denied = this.#deniedReason(target);
      if (denied) return { block: denied };
    }
    const command = stringArg(args, "command");
    if (command) {
      const denied = this.#deniedCommandReason(command);
      if (denied) return { block: denied };
    }
    const network = this.#networkApproval(toolName, args);
    if (network) return { approval: network, strict: true };
    if (!this.#needsApproval(toolName)) return {};
    return { approval: CodeAgentGate.#summarize(toolName, args) };
  }

  // A speed bump, not a boundary: a shell reaches any path; the real boundary is the `pod` profile's container.
  // It stops the obvious accident (`cat .env`) from persisting a live key into the transcript.
  #deniedCommandReason(command: string) {
    const hit =
      this.#deniedFragments.find((fragment) => command.includes(fragment)) ??
      CodeAgentGate.#wordsOf(command).find((word) => this.#namesDeniedFile(word));
    if (!hit) return undefined;
    return `The command names "${hit}", which the profile's deny list covers. Ask the user for the value instead of reading the file.`;
  }

  #namesDeniedFile(word: string) {
    const expanded = CodeAgentGate.#expandHome(word);
    const name = path.basename(expanded);
    if (/[*?[{]/.test(name)) {
      const swept = new Bun.Glob(name);
      if (ordinaryNames.some((ordinary) => swept.match(ordinary))) return false;
      return this.#nameRules.some((rule) => rule.samples.some((sample) => swept.match(sample)));
    }
    const absolute = path.resolve(this.#profile.paths.root, expanded);
    return this.#deny.some((glob) => glob.match(expanded) || glob.match(absolute));
  }

  #deniedReason(target: string) {
    const absolute = path.resolve(this.#profile.paths.root, CodeAgentGate.#expandPath(target));
    const relative = path.relative(path.resolve(this.#profile.paths.root), absolute);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      return `Path is outside the agent root (${this.#profile.paths.root}).`;
    // The deny list also judges the real path, so a link inside the root cannot lend a denied file an innocent name;
    // the root is judged as written, since a linked package or lib leads out of it on purpose.
    const real = CodeAgentGate.#real(absolute);
    const candidates = [
      [absolute, relative],
      [real, path.relative(this.#realRoot, real)],
    ];
    if (candidates.some(([candidate, rel]) => this.#deny.some((glob) => glob.match(candidate) || glob.match(rel))))
      return "Path is on the profile's deny list (secrets and environment files are never readable).";
    if (this.#allow.length && !this.#allow.some((glob) => glob.match(absolute) || glob.match(relative)))
      return "Path is outside the profile's allow list.";
    return undefined;
  }

  #networkApproval(toolName: string, args: unknown) {
    const quiet = this.#profile.network.askOutside;
    if (!quiet) return undefined;
    if (toolName === "web_fetch") {
      const url = stringArg(args, "url");
      const host = url ? codeAgentHostOf(url) : undefined;
      if (!host || codeAgentIsLoopback(host) || codeAgentHostListed(host, quiet)) return undefined;
      return `fetch ${url}`;
    }
    const command = stringArg(args, "command");
    if (!command || !commandTools.has(toolName)) return undefined;
    const clients = [...command.matchAll(networkClients)].map((match) => match[1]);
    if (!clients.length) return undefined;
    // Only loopback is exempt here: a listed host still takes an upload under someone else's account.
    const hosts = [
      ...[...command.matchAll(urlPattern)].map((match) => codeAgentHostOf(match[0])),
      ...[...command.matchAll(hostPortPattern)].map((match) => codeAgentHostOf(`http://${match[0]}`)),
    ];
    const httpOnly = clients.every((client) => client === "curl" || client === "wget");
    if (httpOnly && hosts.length && hosts.every((host) => host && codeAgentIsLoopback(host))) return undefined;
    return `reach the network: ${command.slice(0, 200)}`;
  }

  #needsApproval(toolName: string) {
    switch (this.#profile.approval) {
      case "never":
        return false;
      case "writes":
        return writeTools.has(toolName);
      case "commands":
        return commandTools.has(toolName);
      case "all":
        return true;
      default:
        return false;
    }
  }

  // The engine's own path reading: `@` is stripped, `~` and `file://` expand, odd spaces become plain ones.
  static #expandPath(target: string) {
    const value = target.replace(/[  -   　]/g, " ").replace(/^@/, "");
    if (/^file:\/\//.test(value)) {
      try {
        return fileURLToPath(value);
      } catch {
        return value;
      }
    }
    return CodeAgentGate.#expandHome(value);
  }

  static #expandHome(value: string) {
    const home = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/.exec(value);
    return home ? path.join(homedir(), value.slice(home[0].length)) : value;
  }

  static #real(absolute: string) {
    const rest: string[] = [];
    let head = absolute;
    for (;;) {
      try {
        return path.join(realpathSync(head), ...rest);
      } catch {
        const parent = path.dirname(head);
        if (parent === head) return absolute;
        rest.unshift(path.basename(head));
        head = parent;
      }
    }
  }

  static #wordsOf(command: string) {
    return command.split(/[\s;&|<>()`'"=,@]+/).filter(Boolean);
  }

  static #expandBraces(pattern: string): string[] {
    const open = pattern.indexOf("{");
    const close = open >= 0 ? pattern.indexOf("}", open) : -1;
    if (close < 0) return [pattern];
    const head = pattern.slice(0, open);
    const tail = pattern.slice(close + 1);
    return pattern
      .slice(open + 1, close)
      .split(",")
      .flatMap((choice) => CodeAgentGate.#expandBraces(`${head}${choice}${tail}`));
  }

  // A glob cannot match a shell line, so a deny pattern is reduced to a literal; a mid-pattern wildcard is dropped.
  static #fragmentsOf(pattern: string, home: string) {
    if (pattern.startsWith("~/")) {
      const rest = pattern.slice(2).replace(/\/\*\*$/, "");
      return rest.includes("*")
        ? []
        : ["~/", "$HOME/", "$" + "{HOME}/", `${home}/`].map((prefix) => `${prefix}${rest}`);
    }
    const trimmed = pattern
      .replace(/^\*\*\//, "")
      .replace(/\/\*\*$/, "/")
      .replace(/^\*+/, "")
      .replace(/\*+$/, "");
    return trimmed.includes("*") ? [] : [trimmed];
  }

  static #summarize(toolName: string, args: unknown) {
    const record = (args ?? {}) as Record<string, unknown>;
    if (toolName === "bash") return `run: ${String(record.command ?? "").slice(0, 200)}`;
    const target = stringArg(args, "path");
    return target ? `${toolName} ${target}` : toolName;
  }
}
