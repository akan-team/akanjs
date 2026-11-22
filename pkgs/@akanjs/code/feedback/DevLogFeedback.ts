import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { AkanEditScope } from "../tools/AkanEditScope";
import type { TurnFeedbackSource } from "./TurnFeedback";

export interface DevLogFeedbackOptions {
  workspaceRoot: string;
  cwd: string;
  apps: string[];
  /** Hot reload finishes after the turn does, so the read waits for it. */
  graceMs?: number;
  maxLines?: number;
}

const errorPattern = /\bERROR\b|\bFATAL\b|\[stderr\]|error:|Error:|✖|Unhandled|Cannot find|is not a function/;
const noisePattern = /DEBUG|\bWARN\b|MCP catalogue|rate limit/;

// dev.log is the only file carrying the dev host's own build output; lint and typecheck pass on code that dies at run.
export class DevLogFeedback implements TurnFeedbackSource {
  readonly key = "dev-server";
  readonly #options: Required<DevLogFeedbackOptions>;
  readonly #marks = new Map<string, number>();
  #baseline: ReadonlySet<string> = new Set();

  constructor(options: DevLogFeedbackOptions) {
    this.#options = { graceMs: 1_500, maxLines: 30, ...options };
  }

  async begin() {
    for (const app of this.#options.apps) this.#marks.set(app, DevLogFeedback.#sizeOf(this.#pathOf(app)));
    this.#baseline = await AkanEditScope.baseline(this.#options.cwd);
  }

  async observe() {
    const running = this.#options.apps.filter((app) => existsSync(this.#pathOf(app)));
    if (!running.length) return undefined;
    // A turn that wrote nothing cannot have broken the app; without this gate another person's dev server reopens it.
    if (!(await AkanEditScope.since(this.#options.cwd, this.#baseline)).paths.length) return undefined;
    await Bun.sleep(this.#options.graceMs);
    const reports: string[] = [];
    for (const app of running) {
      const lines = await this.#linesSince(app);
      if (lines.length) reports.push(`**${app}** dev server:\n\`\`\`\n${lines.join("\n")}\n\`\`\``);
    }
    if (!reports.length) return undefined;
    return [
      "The dev server logged errors after your edits:",
      ...reports,
      `Full log: ${running.map((app) => path.relative(this.#options.workspaceRoot, this.#pathOf(app))).join(", ")}`,
    ].join("\n\n");
  }

  async #linesSince(app: string) {
    const file = this.#pathOf(app);
    const from = this.#marks.get(app) ?? 0;
    const size = DevLogFeedback.#sizeOf(file);
    // A smaller file means `akan start` rotated to a new session mid-turn; its own boot output is not a finding.
    if (size <= from) return [];
    const text = await Bun.file(file).slice(from, size).text();
    this.#marks.set(app, size);
    return text
      .split("\n")
      .filter((line) => errorPattern.test(line) && !noisePattern.test(line))
      .slice(-this.#options.maxLines);
  }

  #pathOf(app: string) {
    return path.join(this.#options.workspaceRoot, "local", "apps", app, "runtime", "dev.log");
  }

  /** The port is allocated, not predicted, so the log's `ready` line is the only record of this session's URL. */
  static async previewUrl(workspaceRoot: string, app: string) {
    const file = path.join(workspaceRoot, "local", "apps", app, "runtime", "dev.log");
    if (!existsSync(file)) return undefined;
    const matches = [...(await Bun.file(file).text()).matchAll(/ready \(pid=\d+\) — (https?:\/\/\S+)/g)];
    return matches.at(-1)?.[1];
  }

  static #sizeOf(file: string) {
    return existsSync(file) ? statSync(file).size : 0;
  }
}
