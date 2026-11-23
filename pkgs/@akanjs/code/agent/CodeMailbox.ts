import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseJsonLine, readJsonLines } from "./jsonLines";

export interface CodePeer {
  id: string;
  name: string;
  cwd: string;
  pid: number;
  /** When the session last said it was alive. */
  at: number;
}

export interface CodeMail {
  at: number;
  from: string;
  fromName: string;
  text: string;
}

// A directory, not a socket or daemon: it survives either end restarting and needs nothing listening.
// Presence is a heartbeat file, not a registration, so a session that died silently goes stale on its own.
export class CodeMailbox {
  static readonly staleMs = 20_000;
  static readonly beatMs = 5_000;
  static readonly pollMs = 1_500;
  /** How many messages one session may send in a minute, so two agents answering each other cannot run away. */
  static readonly sendsPerMinute = 20;

  readonly #dir: string;
  readonly #id: string;
  #name: string;
  #read = 0;
  #sent: number[] = [];
  #beat: ReturnType<typeof setInterval> | null = null;
  #poll: ReturnType<typeof setInterval> | null = null;

  constructor(dir: string, id: string, name: string) {
    this.#dir = dir;
    this.#id = id;
    this.#name = name;
  }

  get inbox() {
    return path.join(this.#dir, "inbox", `${this.#id}.jsonl`);
  }

  /** Announces this session and starts delivering what arrives for it. */
  open(cwd: string, onMail: (mail: CodeMail) => void) {
    mkdirSync(path.join(this.#dir, "live"), { recursive: true });
    mkdirSync(path.join(this.#dir, "inbox"), { recursive: true });
    // What is already in the inbox belongs to an earlier run; delivering it would replay a past conversation.
    this.#read = readJsonLines(this.inbox).length;
    this.beat(cwd);
    this.#beat = setInterval(() => this.beat(cwd), CodeMailbox.beatMs);
    this.#poll = setInterval(() => {
      for (const mail of this.#drain()) onMail(mail);
    }, CodeMailbox.pollMs);
  }

  close() {
    if (this.#beat) clearInterval(this.#beat);
    if (this.#poll) clearInterval(this.#poll);
    this.#beat = null;
    this.#poll = null;
    try {
      rmSync(path.join(this.#dir, "live", `${this.#id}.json`), { force: true });
    } catch {
      // A leftover presence file goes stale on its own; failing to remove it is not worth an error.
    }
  }

  rename(name: string, cwd: string) {
    this.#name = name;
    this.beat(cwd);
  }

  beat(cwd: string) {
    const peer: CodePeer = { id: this.#id, name: this.#name, cwd, pid: process.pid, at: Date.now() };
    try {
      writeFileSync(path.join(this.#dir, "live", `${this.#id}.json`), JSON.stringify(peer));
    } catch {
      // A read-only or missing directory means no presence; messaging then simply finds nobody.
    }
  }

  /** The live sessions of this workspace, this one excluded — it is not a peer of itself. */
  peers(): CodePeer[] {
    const dir = path.join(this.#dir, "live");
    if (!existsSync(dir)) return [];
    const now = Date.now();
    return readdirSync(dir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => CodeMailbox.#peer(path.join(dir, entry)))
      .filter((peer): peer is CodePeer => !!peer && peer.id !== this.#id && now - peer.at < CodeMailbox.staleMs)
      .sort((left, right) => right.at - left.at);
  }

  /** Resolves what a person typed — a name, or the front of an id — to exactly one peer. */
  find(target: string) {
    const needle = target.trim().toLowerCase();
    const peers = this.peers();
    const byName = peers.filter((peer) => peer.name.toLowerCase() === needle);
    if (byName.length === 1) return byName[0];
    const byPrefix = peers.filter((peer) => peer.id.startsWith(needle) || peer.name.toLowerCase().startsWith(needle));
    return byPrefix.length === 1 ? byPrefix[0] : undefined;
  }

  send(to: string, text: string) {
    const now = Date.now();
    this.#sent = this.#sent.filter((at) => now - at < 60_000);
    if (this.#sent.length >= CodeMailbox.sendsPerMinute)
      throw new Error(`Too many messages: ${CodeMailbox.sendsPerMinute} a minute is the ceiling.`);
    this.#sent.push(now);
    const mail: CodeMail = { at: now, from: this.#id, fromName: this.#name, text };
    mkdirSync(path.join(this.#dir, "inbox"), { recursive: true });
    // Append, never rewrite: two senders may be writing at the same moment, and one line is one write.
    appendFileSync(path.join(this.#dir, "inbox", `${to}.jsonl`), `${JSON.stringify(mail)}\n`);
  }

  #drain(): CodeMail[] {
    const lines = readJsonLines(this.inbox);
    if (lines.length <= this.#read) return [];
    const fresh = lines.slice(this.#read);
    this.#read = lines.length;
    return fresh
      .map((line) => parseJsonLine<CodeMail>(line))
      .filter((mail): mail is CodeMail => !!mail?.text && typeof mail.from === "string");
  }

  static #peer(file: string) {
    try {
      const peer = JSON.parse(readFileSync(file, "utf8")) as CodePeer;
      return typeof peer.id === "string" ? { ...peer, at: peer.at || statSync(file).mtimeMs } : undefined;
    } catch {
      return undefined;
    }
  }
}
