import { Logger } from "akanjs/common";

export interface HmrWsData {
  kind: "akan-hmr";
  openedAt: number;
}

export type HmrMessage =
  | {
      type: "hello";
      buildId: number;
      cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }>;
    }
  | { type: "reload"; buildId: number }
  | { type: "rsc-refresh"; buildId: number; generation?: number; changedFiles?: string[]; routeIds?: string[] }
  | {
      type: "client-refresh";
      buildId: number;
      generation?: number;
      changedFiles?: string[];
      routeIds?: string[];
    }
  | { type: "css-update"; cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }> }
  | { type: "sync-navigation"; clientId: string; href: string; kind?: "push" | "replace" | "back" | "pop" }
  | { type: "error"; message: string };

export const HMR_WS_TOPIC = "__akan_hmr";

export class HmrWsHub {
  readonly #logger = new Logger("HmrWsHub");
  readonly #conns = new Set<Bun.ServerWebSocket<HmrWsData>>();
  #publish: ((topic: string, payload: string) => void) | null = null;

  get size(): number {
    return this.#conns.size;
  }

  setPublisher(publish: (topic: string, payload: string) => void): void {
    this.#publish = publish;
  }

  attach(ws: Bun.ServerWebSocket<HmrWsData>): void {
    ws.subscribe(HMR_WS_TOPIC);
    this.#conns.add(ws);
    this.#logger.verbose(`[hmr] ws connected (total=${this.#conns.size})`);
  }

  detach(ws: Bun.ServerWebSocket<HmrWsData>): void {
    ws.unsubscribe(HMR_WS_TOPIC);
    if (this.#conns.delete(ws)) this.#logger.verbose(`[hmr] ws disconnected (total=${this.#conns.size})`);
  }

  broadcast(msg: HmrMessage): void {
    const payload = JSON.stringify(msg);
    this.#publish?.(HMR_WS_TOPIC, payload);
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

const isSyncNavigationEnabled = () =>
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
