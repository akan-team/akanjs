import { Logger } from "akanjs/common";
import type { BuildPhase, HmrTrace } from "../artifact";

// Sent over IPC by devkit's fs watcher.
export type ChangeKind = "code" | "css" | "config" | "ignore";

export interface ChangeBatch {
  files: string[];
  kinds: Set<Exclude<ChangeKind, "ignore">>;
  trace?: HmrTrace;
}

export type HmrClientKind = "ssr" | "csr";

export interface HmrWsData {
  kind: "akan-hmr";
  openedAt: number;
  client?: HmrClientKind;
}

export type HmrMessage =
  | {
      type: "hello";
      buildId: number;
      cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }>;
      csrGeneration?: number;
      ssrGeneration?: number;
      ssrEpoch?: number;
      /** The phases failing now, each sent right after: a tab drops an error it holds for any other. */
      failingPhases?: string[];
    }
  | { type: "reload"; buildId: number }
  | {
      type: "csr-update";
      generation: number;
      url?: string;
      changedIds?: string[];
      reload?: boolean;
      reason?: string;
      trace?: HmrTrace;
    }
  | {
      type: "ssr-update";
      generation: number;
      url?: string;
      changedIds?: string[];
      reload?: boolean;
      reason?: string;
      trace?: HmrTrace;
    }
  | {
      type: "rsc-refresh";
      buildId: number;
      generation?: number;
      changedFiles?: string[];
      routeIds?: string[];
      trace?: HmrTrace;
    }
  | { type: "css-update"; cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }> }
  | { type: "sync-navigation"; clientId: string; href: string; kind?: "push" | "replace" | "back" | "pop" }
  | { type: "ok"; generation?: number }
  | {
      type: "build-status";
      status: "building" | "error" | "ok";
      generation: number;
      phase: BuildPhase;
      message?: string;
      files?: number;
    }
  | { type: "error"; message: string };

export const HMR_WS_TOPIC = "__akan_hmr";
export const HMR_CSR_WS_TOPIC = "__akan_hmr_csr";

export class HmrWsHub {
  readonly #logger = new Logger("HmrWsHub");
  readonly #conns = new Set<Bun.ServerWebSocket<HmrWsData>>();
  #publish: ((topic: string, payload: string) => void) | null = null;

  setPublisher(publish: (topic: string, payload: string) => void): void {
    this.#publish = publish;
  }

  attach(ws: Bun.ServerWebSocket<HmrWsData>): void {
    ws.subscribe(HmrWsHub.#topicOf(ws.data?.client));
    this.#conns.add(ws);
    this.#logger.verbose(`[hmr] ws connected client=${ws.data?.client ?? "ssr"} (total=${this.#conns.size})`);
  }

  detach(ws: Bun.ServerWebSocket<HmrWsData>): void {
    ws.unsubscribe(HmrWsHub.#topicOf(ws.data?.client));
    if (this.#conns.delete(ws)) this.#logger.verbose(`[hmr] ws disconnected (total=${this.#conns.size})`);
  }

  broadcast(msg: HmrMessage): void {
    const payload = JSON.stringify(msg);
    const audience = HmrWsHub.#audienceOf(msg);
    if (audience !== "csr") this.#publish?.(HMR_WS_TOPIC, payload);
    if (audience !== "ssr") this.#publish?.(HMR_CSR_WS_TOPIC, payload);
  }

  // A CSR tab renders no RSC and loads its own bundle, which its builder answers with `csr-update` when it changes.
  static #audienceOf(msg: HmrMessage): HmrClientKind | "all" {
    if (msg.type === "csr-update") return "csr";
    if (msg.type === "reload" || msg.type === "rsc-refresh" || msg.type === "ssr-update") return "ssr";
    return "all";
  }

  static #topicOf(client: HmrClientKind | undefined): string {
    return client === "csr" ? HMR_CSR_WS_TOPIC : HMR_WS_TOPIC;
  }

  handleMessage(message: string): void {
    if (!isSyncNavigationEnabled()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!isSyncNavigationMessage(parsed)) return;
    this.broadcast(parsed);
  }
}

export const isSyncNavigationEnabled = () =>
  process.env.AKAN_PUBLIC_SYNC_NAVIGATION === "true" ||
  process.env.AKAN_PUBLIC_SYNC_NAVIGATION === "1" ||
  process.env.SYNC_DOMAIN === "true" ||
  process.env.SYNC_DOMAIN === "1";

const isSyncNavigationMessage = (value: unknown): value is Extract<HmrMessage, { type: "sync-navigation" }> => {
  if (!value || typeof value !== "object") return false;
  const msg = value as Partial<Extract<HmrMessage, { type: "sync-navigation" }>>;
  if (msg.type !== "sync-navigation") return false;
  if (typeof msg.clientId !== "string" || msg.clientId.length === 0) return false;
  if (typeof msg.href !== "string" || msg.href.length === 0) return false;
  if (msg.kind === undefined) return true;
  return msg.kind === "push" || msg.kind === "replace" || msg.kind === "back" || msg.kind === "pop";
};
