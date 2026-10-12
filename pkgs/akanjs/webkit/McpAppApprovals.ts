"use client";
import type { PendingApproval, ToolApprovalRequest } from "use-agentic";

// The host's model calls a screen's tools, and a tool that declared `confirm` waits for the person watching the view.
// The host may ask too (a tool that is not read-only), but whether it does is its own policy, so the declaration is
// kept here, one question at a time in the order the calls arrived.
export class McpAppApprovals {
  static readonly #key = Symbol.for("akanjs.webkit.mcpAppApprovals");

  //? Interned: the CSR bundle and the `akanjs/ui` card it renders may each inline a copy of this module.
  static get shared(): McpAppApprovals {
    const holder = globalThis as unknown as Record<symbol, McpAppApprovals | undefined>;
    const shared = holder[McpAppApprovals.#key] ?? new McpAppApprovals();
    holder[McpAppApprovals.#key] = shared;
    return shared;
  }

  #queue: PendingApproval[] = [];
  readonly #listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  current = (): PendingApproval | null => this.#queue[0] ?? null;

  ask({ callId, name, args, message }: ToolApprovalRequest, signal: AbortSignal): Promise<true | string> {
    return new Promise((resolve) => {
      const settle = (verdict: true | string) => {
        signal.removeEventListener("abort", onAbort);
        this.#queue = this.#queue.filter((pending) => pending !== approval);
        this.#notify();
        resolve(verdict);
      };
      const onAbort = () => settle("The call ended before the user decided.");
      const approval: PendingApproval = {
        callId,
        name,
        args,
        message,
        approve: () => settle(true),
        reject: (reason) => settle(reason ?? "The user declined."),
      };
      if (signal.aborted) {
        resolve("The call ended before the user decided.");
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      this.#queue = [...this.#queue, approval];
      this.#notify();
    });
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }
}
