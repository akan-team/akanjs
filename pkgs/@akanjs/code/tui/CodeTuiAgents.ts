import type { CodeAgentSubagent } from "akanjs/common";
import { type CodeTuiLine, CodeTuiLines, type CodeTuiSpan } from "./CodeTuiLines";

/** Every row is exactly one terminal line, never wrapped: the frame counts these rows before drawing them. */
export class CodeTuiAgents {
  static readonly markWidth = 4; // `  ◯ ` on a child row, `❯ ⏺ ` on the session row
  /** Below this much room for the description, the meta column is dropped. */
  static readonly minDescription = 12;

  static rows(agents: CodeAgentSubagent[], session: string, width: number, now = Date.now()): CodeTuiLine[] {
    if (!agents.length) return [];
    const kindColumn = Math.max(...agents.map((agent) => CodeTuiLines.width(agent.kind))) + 2;
    return [
      {
        key: "agents:self",
        spans: [{ text: "❯ ", color: "cyan" }, { text: "⏺ ", color: "green" }, { text: session }],
      },
      ...agents.map((agent, at) => ({
        key: `agents:${agent.id || at}`,
        spans: CodeTuiAgents.#row(agent, kindColumn, width, now),
      })),
    ];
  }

  static #row(agent: CodeAgentSubagent, kindColumn: number, width: number, now: number): CodeTuiSpan[] {
    const meta = `${CodeTuiAgents.elapsed(now - agent.startedAt)} · ↓ ${CodeTuiAgents.tokens(agent.tokens)} tokens`;
    const head = CodeTuiAgents.markWidth + kindColumn;
    const room = width - head - CodeTuiLines.width(meta) - 2;
    const spans: CodeTuiSpan[] = [{ text: "  ◯ ", color: "yellow" }, { text: agent.kind.padEnd(kindColumn) }];
    if (room < CodeTuiAgents.minDescription)
      return [...spans, { text: CodeTuiAgents.#clip(agent.description, Math.max(1, width - head)) }];
    const description = CodeTuiAgents.#clip(agent.description, room);
    // Padded by display columns: `padEnd` counts code units and would push the meta column off after Hangul.
    const pad = " ".repeat(Math.max(0, room - CodeTuiLines.width(description)));
    return [...spans, { text: `${description}${pad}` }, { text: `  ${meta}`, dim: true }];
  }

  /** `47s`, `12m 30s`, `1h 2m`. */
  static elapsed(ms: number) {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /** `842`, `12.4k`, `1.3M`. */
  static tokens(count: number) {
    if (count < 1_000) return `${Math.max(0, Math.round(count))}`;
    if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k`;
    return `${(count / 1_000_000).toFixed(1)}M`;
  }

  static #clip(text: string, width: number) {
    if (CodeTuiLines.width(text) <= width) return text;
    let clipped = "";
    for (const char of text) {
      if (CodeTuiLines.width(clipped + char) > width - 1) break;
      clipped += char;
    }
    return `${clipped}…`;
  }
}
