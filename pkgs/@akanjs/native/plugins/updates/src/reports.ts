// What became of each release on a desktop app, posted to updates.report.url as a phone's shell posts a web bundle's
// (native/ios/Sources/AkanNativeUpdateReports.swift): the same file and wire format, with the app's CPU in the body, a
// release's signer on its events and the desktop-only reasons. The contract (events, reasons, what an answer does,
// Retry-After, the caps) is kernel.ts's, checked against vectors/updates.json `reports`.
//
// <updates folder>/report.json: { installId, nextId, events: [{ id, event, bundle, sequence, reason, at, keyId? }],
// retryAt?, seen: [key] }. Beside state.json, which reset() rewrites alone: the installId (random, not a device
// identifier) and the id counter live as long as the install, and an id is never used twice.
// Sent at the start, after each new event and every RETRY_INTERVAL: oldest first, a batch to a request, one request at
// a time.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { release as osRelease } from "node:os";
import { join } from "node:path";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import {
  isBundleId,
  isUpdateKeyId,
  UPDATE_REPORT_BATCH,
  UPDATE_REPORT_LIMIT,
  type UpdateReportBody,
  type UpdateReportDesktopReason,
  type UpdateReportEntry,
  type UpdateReportEvent,
  type UpdateReportReason,
  updateReportKey,
  updateReportOutcome,
  updateReportRetryAt,
  updateReportTime,
  updateReportWaits,
} from "../../../packages/core/src/kernel.ts";

export type ReportReason = UpdateReportReason | UpdateReportDesktopReason;

/** The release an event names: an entry of state.json, a manifest, or what a refused envelope claims. */
export interface ReportedRelease {
  bundle?: unknown;
  sequence?: unknown;
  keyId?: unknown;
}

export interface ReportingApp {
  /** The folder of state.json. */
  dir: string;
  /** A debug build posts in cleartext to any host, as its page loads from one. */
  dev: boolean;
  appVersion: string;
  /** updates.json as it stands when a batch is sent: setChannel() changes the channel. */
  config(): { app: string; platform: string; channel: string; nativeApi: string | null };
}

export interface UpdateReportsOptions {
  /** updates.json `reportUrl`; without one nothing is kept. */
  url: string | undefined;
  platform?: NodeJS.Platform;
  fetch?: typeof fetch;
  /** Unix seconds. */
  now?: () => number;
  retryInterval?: number;
}

export interface UpdateReports {
  start(app: ReportingApp): void;
  /** Kept once per release and reason; a release without a bundle id is not kept. */
  record(event: UpdateReportEvent, release: ReportedRelease, reason?: ReportReason): void;
  /** A download that threw: `failed` under `reason`, unless the page or the app called it off. */
  failed(error: unknown, release: ReportedRelease | undefined, reason: ReportReason): void;
  flush(): Promise<void>;
}

interface Stored {
  installId: string;
  nextId: number;
  events: UpdateReportEntry[];
  retryAt: number | null;
  seen: string[];
}

/** A kept batch goes again at the next event or start, and this often in an app left running. */
export const RETRY_INTERVAL = 60 * 60_000;
const REQUEST_TIMEOUT = 30_000;

/** https, or http to this machine: a release build posts nothing in cleartext, as a phone's release shell posts none. */
const secure = (url: string): boolean => {
  try {
    const { protocol, hostname } = new URL(url);
    const local = hostname === "localhost" || hostname === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(hostname);
    return protocol === "https:" || (protocol === "http:" && local);
  } catch {
    return false;
  }
};

const readText = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

/** "macOS 15.5", "Windows 10.0.26200", "Linux Ubuntu 24.04.1 LTS": printable ASCII, 64 characters at most. */
export function osLabel(platform: NodeJS.Platform = process.platform): string {
  //? The files, not sw_vers or lsb_release: an app started from the Finder has no PATH to find a tool on.
  const version =
    platform === "darwin"
      ? /<key>ProductVersion<\/key>\s*<string>([^<]*)<\/string>/.exec(
          readText("/System/Library/CoreServices/SystemVersion.plist"),
        )?.[1]
      : platform === "linux"
        ? /^PRETTY_NAME="?([^"\n]*)"?$/m.exec(readText("/etc/os-release"))?.[1]
        : undefined;
  const name = platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : "Linux";
  return `${name} ${version?.trim() || osRelease()}`.replace(/[^\x20-\x7e]/g, "").slice(0, 64);
}

/**
 * The release a refused envelope claims, read without trusting it and only to say which release failed: a forged name
 * can at worst count against a release the server already published for this app.
 */
export function claimedRelease(manifest: string, keyId: string): ReportedRelease {
  try {
    const claimed = JSON.parse(Buffer.from(manifest, "base64").toString("utf8")) as ReportedRelease | null;
    return { bundle: claimed?.bundle, sequence: claimed?.sequence, keyId };
  } catch {
    return {};
  }
}

export function createUpdateReports(options: UpdateReportsOptions): UpdateReports {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => Date.now() / 1000);
  let app: ReportingApp | undefined;
  let sending = false;

  const path = () => join((app as ReportingApp).dir, "report.json");
  const fresh = (): Stored => ({
    installId: randomBytes(16).toString("hex"),
    nextId: 0,
    events: [],
    retryAt: null,
    seen: [],
  });
  //? Read at every use: Windows and Linux start a second copy of an app without single-instance, which writes it too.
  const read = (): Stored => {
    let o: Partial<Stored> | null;
    try {
      o = JSON.parse(readFileSync(path(), "utf8")) as Partial<Stored> | null;
    } catch {
      return fresh();
    }
    if (typeof o?.installId !== "string" || !/^[0-9a-f]{32}$/.test(o.installId)) return fresh();
    return {
      installId: o.installId,
      nextId: Number.isSafeInteger(o.nextId) ? (o.nextId as number) : 0,
      events: Array.isArray(o.events) ? o.events : [],
      retryAt: typeof o.retryAt === "number" && Number.isFinite(o.retryAt) ? o.retryAt : null,
      seen: Array.isArray(o.seen) ? o.seen.filter((key) => typeof key === "string") : [],
    };
  };
  const save = ({ retryAt, ...stored }: Stored) => {
    const dir = (app as ReportingApp).dir;
    mkdirSync(dir, { recursive: true });
    const tmp = `${path()}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...stored, ...(retryAt === null ? {} : { retryAt }) }));
    renameSync(tmp, path());
  };

  const settle = (ids: Set<number>, status: number, retryAfter: string | null): boolean => {
    const stored = read();
    if (updateReportOutcome(status) === "kept") {
      const retryAt = updateReportRetryAt(retryAfter, now());
      if (retryAt !== stored.retryAt) save({ ...stored, retryAt });
      return false;
    }
    save({ ...stored, events: stored.events.filter((event) => !ids.has(event.id)), retryAt: null });
    return true;
  };

  const flush = async (): Promise<void> => {
    if (!app || !options.url || sending) return;
    sending = true;
    try {
      for (;;) {
        const stored = read();
        const events = stored.events.slice(0, UPDATE_REPORT_BATCH);
        if (!events.length || updateReportWaits(stored.retryAt, now())) return;
        const config = app.config();
        const body: UpdateReportBody = {
          app: config.app,
          platform: config.platform,
          channel: config.channel,
          installId: stored.installId,
          nativeApi: config.nativeApi ?? "",
          appVersion: app.appVersion,
          os: osLabel(options.platform),
          arch: process.arch,
          events,
        };
        const response = await send(options.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        }).catch(() => null);
        void response?.body?.cancel().catch(() => {});
        const ids = new Set(events.map((event) => event.id));
        if (!settle(ids, response?.status ?? 0, response?.headers.get("retry-after") ?? null)) return;
      }
    } catch (error) {
      console.warn("[akan-native] updates: the update reports stay for the next try", error);
    } finally {
      sending = false;
    }
  };

  const record = (event: UpdateReportEvent, release: ReportedRelease, reason?: ReportReason) => {
    const { bundle, sequence, keyId } = release;
    if (!app || !options.url || typeof bundle !== "string" || !isBundleId(bundle)) return;
    try {
      const stored = read();
      const key = updateReportKey(event, bundle, reason ?? null);
      if (stored.seen.includes(key)) return;
      const entry: UpdateReportEntry = {
        id: stored.nextId,
        event,
        bundle,
        sequence: typeof sequence === "number" && Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null,
        reason: reason ?? null,
        at: updateReportTime(Math.floor(now() * 1000)),
        ...(typeof keyId === "string" && isUpdateKeyId(keyId) ? { keyId } : {}),
      };
      save({
        ...stored,
        nextId: stored.nextId + 1,
        events: [...stored.events, entry].slice(-UPDATE_REPORT_LIMIT),
        seen: [...stored.seen, key].slice(-UPDATE_REPORT_LIMIT),
      });
    } catch (error) {
      //? Never the update's failure: a report that cannot be written is one event a dashboard misses.
      console.warn("[akan-native] updates: cannot keep an update report", error);
      return;
    }
    void flush();
  };

  return {
    start(reporting) {
      if (!options.url || (!reporting.dev && !secure(options.url))) return;
      app = reporting;
      setInterval(() => void flush(), options.retryInterval ?? RETRY_INTERVAL).unref();
      void flush();
    },
    record,
    failed(error, release, reason) {
      const cancelled = isAkanNativeError(error, "CANCELLED") || (error as Error | null)?.name === "AbortError";
      if (release && !cancelled) record("failed", release, reason);
    },
    flush,
  };
}
