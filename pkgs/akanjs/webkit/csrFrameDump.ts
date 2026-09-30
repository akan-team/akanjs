"use client";

interface LayerRecord {
  layer: string;
  status: "pending" | "settled" | "failed";
  startedAt: number;
  settledAt: number | null;
  /** A mounted layer is waiting on this render's promise; false once it unmounts or its Activity hides. */
  subscribed: boolean;
  /** The layer has drawn this render's value. */
  delivered: boolean;
}

interface FrameState {
  phase: string;
  location: string;
  prevLocation: string | null;
  pendingLocation: string | null;
  stack: { key: string; path: string; pageType: string }[];
}

//* What the CSR frame and its async layers are doing, read after the fact: a trace changes the timing it would record,
//* and this only keeps the latest state until `window.__AKAN_DUMP_FRAME__()` asks for it.
export class CsrFrameDump {
  static readonly limit = 300;
  static readonly #layers: LayerRecord[] = [];
  static #frame: (() => FrameState) | null = null;

  static track(layer: string, result: Promise<unknown>): LayerRecord {
    const record: LayerRecord = {
      layer,
      status: "pending",
      startedAt: Math.round(performance.now()),
      settledAt: null,
      subscribed: false,
      delivered: false,
    };
    CsrFrameDump.#layers.push(record);
    if (CsrFrameDump.#layers.length > CsrFrameDump.limit) CsrFrameDump.#layers.shift();
    const settle = (status: LayerRecord["status"]) => {
      record.status = status;
      record.settledAt = Math.round(performance.now());
    };
    result.then(
      () => settle("settled"),
      () => settle("failed"),
    );
    CsrFrameDump.#install();
    return record;
  }

  static watchFrame(read: () => FrameState) {
    CsrFrameDump.#frame = read;
    CsrFrameDump.#install();
  }

  static dump() {
    return {
      now: Math.round(performance.now()),
      frame: CsrFrameDump.#frame?.() ?? null,
      layers: CsrFrameDump.#layers.map((record) => ({ ...record })),
    };
  }

  static #install() {
    if (typeof window === "undefined") return;
    (window as { __AKAN_DUMP_FRAME__?: () => unknown }).__AKAN_DUMP_FRAME__ = CsrFrameDump.dump;
  }
}
