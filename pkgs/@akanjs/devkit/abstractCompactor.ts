import { Logger } from "akanjs/common";
import chalk from "chalk";
import { AbstractDoc, type AbstractKind } from "./abstractDoc";
import { AiSession } from "./aiEditor";
import type { SysExecutor } from "./executors";

export interface AbstractCompactOptions {
  module?: string | null;
  minLines?: number;
  interactive?: boolean;
}

export interface AbstractCompactReport {
  path: string;
  beforeLines: number;
  afterLines: number;
  status: "compacted" | "unchanged" | "failed";
}

/** Rewrites bloated `*.abstract.md` files down to the invariants their source files cannot show. */
export class AbstractCompactor {
  static readonly #reviewRequest = `Review the compacted file you just wrote against the original.
- Did you drop an invariant, a security reason, or a workflow step that the source files cannot show by themselves? Restore it.
- Did you keep anything that only restates code, scaffold wording, or history? Remove it.
- Is it in the same language as the original, within the line budget, and one short line per bullet?
Respond with exactly one \`\`\`markdown code block holding the corrected file and nothing else. If nothing needs to change, repeat the file unchanged.`;

  #sys: SysExecutor;
  #minLines: number;
  #interactive: boolean;
  constructor(
    sys: SysExecutor,
    { minLines = AbstractDoc.compactMinLines, interactive = false }: AbstractCompactOptions = {},
  ) {
    this.#sys = sys;
    this.#minLines = minLines;
    this.#interactive = interactive;
  }
  async compactAll({ module }: { module?: string | null } = {}) {
    const docs = await AbstractDoc.findAll(this.#sys, { module });
    const targets = docs.filter((doc) => doc.lineCount > this.#minLines);
    const reports: AbstractCompactReport[] = [];
    // One file at a time: each doc gets its own AI session, and parallel runs would interleave the
    // streamed response with each other and with the interactive confirm prompt.
    for (const doc of targets) reports.push(await this.compact(doc));
    return { scanned: docs.length, reports };
  }
  async compact(doc: AbstractDoc): Promise<AbstractCompactReport> {
    const session = new AiSession("compactAbstract", {
      workspace: this.#sys.workspace,
      cacheKey: `${this.#sys.name}-${doc.moduleName}`,
    });
    const approve = !this.#interactive;
    const compacted = await session.editMarkdown(this.#request(doc), { approve });
    const reviewed = await session.editMarkdown(AbstractCompactor.#reviewRequest, { approve });
    // The review answers in prose when it finds nothing to fix, so the first compaction is the fallback.
    const next = [reviewed, compacted]
      .map((candidate) => candidate.trim())
      .find((candidate) => doc.canReplaceWith(candidate));
    const beforeLines = doc.lineCount;
    if (!next) {
      Logger.rawLog(chalk.yellow(`${doc.path}: the editor returned no shorter abstract, keeping the current file`));
      return { path: doc.path, beforeLines, afterLines: beforeLines, status: "failed" };
    }
    if (next === doc.content.trim())
      return { path: doc.path, beforeLines, afterLines: beforeLines, status: "unchanged" };
    const content = `${next}\n`;
    await this.#sys.writeFile(doc.path, content);
    return { path: doc.path, beforeLines, afterLines: AbstractDoc.lineCountOf(content), status: "compacted" };
  }
  #targetShape(kind: AbstractKind) {
    if (kind === "other")
      return "  - keep the headings that still carry information and drop the rest; do not impose a new structure";
    return [
      "  - `# <name> Abstract` title line",
      "  - one declarative sentence naming what this module owns",
      "  - `## Rules` — two to five bullets, each an invariant the code cannot show by itself",
      "  - optional `## Workflow` — the lifecycle as an arrow chain (`draft -> signed -> active`) or a few bullets",
    ].join("\n");
  }
  #request(doc: AbstractDoc) {
    return `You are compacting an Akan.js abstract file.

An abstract is the summary a coding agent reads before changing a module. Repeated edits have made this one
bloated, and it has to shrink back to what the source files cannot show by themselves.

# Target file
${this.#sys.type}s/${this.#sys.name}/${doc.path} (${doc.kind} module "${doc.moduleName}", ${doc.lineCount} lines)

# Source files in the same folder
${doc.siblingFiles.join(", ") || "none"}

# Current content
\`\`\`markdown
${doc.content}
\`\`\`

# Rules for the compacted file
- Write it in the SAME language as the current content. Never translate.
- Keep every invariant, constraint, security reason, and workflow step that the source files cannot show by
  themselves. Merge duplicates instead of dropping either one.
- Delete what the code already states: field lists, types, labels, signatures, file lists, and imports.
- Delete scaffold and placeholder wording, changelog or migration history, TODOs, and any instruction about
  reading or updating this file.
- Never invent a rule that the current content does not state.
- Keep every bullet to one short line, and stay under ${AbstractDoc.compactMinLines} lines in total.
- Shape:
${this.#targetShape(doc.kind)}

Respond with exactly one \`\`\`markdown code block holding the whole new file and nothing else.`;
  }
}
