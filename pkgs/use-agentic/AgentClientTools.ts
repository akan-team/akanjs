import { AgenticSurface } from "./AgenticSurface";
import { ToolRunner, type ToolRunnerHost } from "./ToolRunner";
import type { PublishedTool, SurfaceView, ToolCallRequest, ToolCallResult } from "./types";

/** `readOnly` is always `false`: a screen tool declares no such flag, so a server loop counts every one as a write. */
export interface AgentClientToolDefinition extends PublishedTool {
  readOnly: false;
}

/**
 * A screen's tools lent to an agent loop that runs on the server: `list()` is what that loop takes as its client
 * tools, and `run(call)` answers a call it parked. A call goes through the same `ToolRunner` as the in-page chat, so a
 * `confirm` still asks through `host.approve` (refused without one), a card needs `host.card`, and the answer is
 * clipped and fenced as the chat's would be.
 */
export class AgentClientTools {
  readonly #surface: SurfaceView;
  readonly #runner: ToolRunner;

  constructor(surface: SurfaceView = AgenticSurface.shared, host: ToolRunnerHost = {}) {
    this.#surface = surface;
    this.#runner = new ToolRunner(surface, host);
  }

  list(): AgentClientToolDefinition[] {
    return this.#surface.snapshot().tools.map((tool) => ({ ...tool, readOnly: false }));
  }

  /** Never throws: a tool no longer on the screen, a refusal and a failure all come back as the result's `error`. */
  async run(call: ToolCallRequest, signal: AbortSignal = new AbortController().signal): Promise<ToolCallResult> {
    return await this.#runner.run(call, signal);
  }
}
