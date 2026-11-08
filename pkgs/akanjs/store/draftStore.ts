import { getEnv } from "akanjs/base";
import { getAuthToken, getSessionClaims } from "akanjs/client";
import { decodeJwtPayload, deepObjectify, isDayjs, Logger } from "akanjs/common";
import { ConstantRegistry, immerify, stripSecrets } from "akanjs/constant";

const DRAFT_PREFIX = "akan.draft";
/** Deliberately not under `DRAFT_PREFIX`, so the sweep's own prefix walk never picks this bookkeeping key up. */
const IDENTITY_PREFIX = "akan.draft-identity";
const DRAFT_VERSION = 1;
const MAX_DRAFT_CHARS = 256_000;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DRAFTS_PER_IDENTITY = 30;

// Rewritten by every silent token refresh; hashing them would orphan the draft being typed.
const VOLATILE_CLAIMS = ["iat", "exp", "nbf", "jti"] as const;

const RECORD_STAMPS = new Set(["createdAt", "updatedAt", "removedAt"]);

export interface DraftRecord {
  v: number;
  /** ISO. Drives both the "n minutes ago" label and the TTL/LRU sweep. */
  savedAt: string;
  /** The `updatedAt` the edited record carried when the draft was taken, or null for a new form. */
  baseUpdatedAt: string | null;
  form: Record<string, unknown>;
}

interface NewScopeInput {
  /** Only what the caller passed — never the result of merging it into `default<Model>`, whose date defaults rotate. */
  seed: object | undefined;
  modal: string;
  sliceName: string;
  routePath: string;
}

/** Storage methods are async although localStorage is not, so the backend can move to IndexedDB unchanged. */
export class DraftStore {
  static #warnedKeys = new Set<string>();
  static #persistenceRequested = false;

  static #storage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage;
    } catch {
      // Private browsing and "block site data" throw on the property itself, not on the call.
      return null;
    }
  }

  static #hash8(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  static #stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => DraftStore.#stableStringify(item)).join(",")}]`;
    const source = value as Record<string, unknown>;
    const entries = Object.keys(source)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${DraftStore.#stableStringify(source[key])}`);
    return `{${entries.join(",")}}`;
  }

  // Dates are dropped (a date default would rotate the key) and relations collapse to ids (the rest is display data).
  static #canonicalSeed(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined || typeof value === "function") return undefined;
    if (value instanceof Date || isDayjs(value)) return undefined;
    if (Array.isArray(value))
      return value.map((item) => DraftStore.#canonicalSeed(item, depth + 1)).filter((item) => item !== undefined);
    if (typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    if (depth > 0 && typeof source.id === "string") return source.id;
    const entries = Object.keys(source)
      .sort()
      .map((key) => [key, DraftStore.#canonicalSeed(source[key], depth + 1)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries);
  }

  /** Hashes the whole JWT payload: the claim naming the user lives in the app's own `AddData`, not in `Account`. */
  static identity(): string {
    if (typeof window === "undefined") return "anon";
    const jwt = getAuthToken() ?? getSessionClaims();
    if (!jwt) return "anon";
    try {
      const payload = decodeJwtPayload<Record<string, unknown>>(jwt);
      for (const claim of VOLATILE_CLAIMS) delete payload[claim];
      return DraftStore.#hash8(DraftStore.#stableStringify(payload));
    } catch {
      return "anon";
    }
  }

  static editScope(modelId: string): string {
    return `id:${modelId}`;
  }

  static newScope({ seed, modal, sliceName, routePath }: NewScopeInput): string {
    const canonical = DraftStore.#stableStringify(DraftStore.#canonicalSeed(seed ?? {}));
    return `new:${DraftStore.#hash8(`${canonical}|${modal}|${sliceName}|${routePath}`)}`;
  }

  static keyOf(refName: string, scope: string, identity: string = DraftStore.identity()): string {
    return `${DRAFT_PREFIX}.${getEnv().appName}.${identity}.${refName}.${scope}`;
  }

  static encodeForm(refName: string, form: object): Record<string, unknown> {
    const modelRef = ConstantRegistry.getDatabase(refName).full;
    const plain = deepObjectify(form, { serializable: true, convertDate: "string" }) as object;
    return stripSecrets(modelRef, plain) as Record<string, unknown>;
  }

  static decodeForm(refName: string, plain: Record<string, unknown>): object {
    const modelRef = ConstantRegistry.getDatabase(refName).full;
    return immerify(modelRef, new modelRef().set(plain) as object);
  }

  static formHash(refName: string, form: object): string {
    return DraftStore.#hash8(DraftStore.#stableStringify(DraftStore.encodeForm(refName, form)));
  }

  /** Ignores the record stamps, which a form's own save moves. */
  static contentHash(encoded: Record<string, unknown>): string {
    const content = Object.fromEntries(Object.entries(encoded).filter(([key]) => !RECORD_STAMPS.has(key)));
    return DraftStore.#hash8(DraftStore.#stableStringify(content));
  }

  static async read(key: string): Promise<DraftRecord | null> {
    const storage = DraftStore.#storage();
    if (!storage) return null;
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      // Reading can throw where writing did not; treat it as no draft.
      return null;
    }
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as DraftRecord;
      if (record.v !== DRAFT_VERSION || !record.form) {
        await DraftStore.remove(key);
        return null;
      }
      return record;
    } catch {
      await DraftStore.remove(key);
      return null;
    }
  }

  static async write(key: string, record: DraftRecord): Promise<void> {
    const storage = DraftStore.#storage();
    if (!storage) return;
    const raw = JSON.stringify(record);
    if (raw.length > MAX_DRAFT_CHARS) {
      DraftStore.#warnOnce(key, `Form draft not saved: ${raw.length} chars is over the ${MAX_DRAFT_CHARS} cap`);
      return;
    }
    try {
      storage.setItem(key, raw);
      DraftStore.#requestPersistence();
      return;
    } catch {
      // Quota: this may evict its own oldest draft and nothing else on the origin.
    }
    if (!(await DraftStore.#evictOldest(key))) return;
    try {
      storage.setItem(key, raw);
    } catch {
      DraftStore.#warnOnce(key, "Form draft not saved: storage quota is exhausted");
    }
  }

  static async remove(key: string): Promise<void> {
    const storage = DraftStore.#storage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // Nothing to do: the draft is unreachable either way.
    }
  }

  /** Every draft held for one identity. Called on sign-out, so a shared device leaves nothing for the next user. */
  static async removeIdentity(identity: string = DraftStore.identity()): Promise<void> {
    const prefix = `${DRAFT_PREFIX}.${getEnv().appName}.${identity}.`;
    for (const key of DraftStore.#keysUnder(prefix)) await DraftStore.remove(key);
  }

  static async sweep(): Promise<void> {
    const storage = DraftStore.#storage();
    if (!storage) return;
    const appPrefix = `${DRAFT_PREFIX}.${getEnv().appName}.`;
    const now = Date.now();
    const byIdentity = new Map<string, { key: string; savedAt: number }[]>();
    for (const key of DraftStore.#keysUnder(appPrefix)) {
      const savedAt = DraftStore.#savedAtOf(storage, key);
      if (savedAt === null || now - savedAt > DRAFT_TTL_MS) {
        await DraftStore.remove(key);
        continue;
      }
      const identity = key.slice(appPrefix.length).split(".")[0] ?? "anon";
      const bucket = byIdentity.get(identity) ?? [];
      bucket.push({ key, savedAt });
      byIdentity.set(identity, bucket);
    }
    for (const bucket of byIdentity.values()) {
      if (bucket.length <= MAX_DRAFTS_PER_IDENTITY) continue;
      bucket.sort((a, b) => a.savedAt - b.savedAt);
      for (const entry of bucket.slice(0, bucket.length - MAX_DRAFTS_PER_IDENTITY)) await DraftStore.remove(entry.key);
    }
  }

  /** Removes the previous identity's drafts once the signed-in identity changes; `anon`'s are never removed. */
  static async reconcileIdentity(): Promise<void> {
    const storage = DraftStore.#storage();
    if (!storage) return;
    const key = `${IDENTITY_PREFIX}.${getEnv().appName}`;
    const current = DraftStore.identity();
    let last: string | null = null;
    try {
      last = storage.getItem(key);
      if (last === current) return;
      storage.setItem(key, current);
    } catch {
      return;
    }
    if (last && last !== "anon") await DraftStore.removeIdentity(last);
  }

  // WKWebView evicts best-effort storage under pressure; asked after a real write, since asking can prompt.
  static #requestPersistence() {
    if (DraftStore.#persistenceRequested) return;
    DraftStore.#persistenceRequested = true;
    try {
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch {
      // Neither webview guarantees the API.
    }
  }

  static #warnOnce(key: string, message: string) {
    if (DraftStore.#warnedKeys.has(key)) return;
    DraftStore.#warnedKeys.add(key);
    Logger.warn(message);
  }

  static #keysUnder(prefix: string): string[] {
    const storage = DraftStore.#storage();
    if (!storage) return [];
    const keys: string[] = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) keys.push(key);
      }
    } catch {
      // Enumeration can throw mid-walk; whatever was collected is still safe to act on.
    }
    return keys;
  }

  static #savedAtOf(storage: Storage, key: string): number | null {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const time = new Date((JSON.parse(raw) as DraftRecord).savedAt).getTime();
      return Number.isNaN(time) ? null : time;
    } catch {
      return null;
    }
  }

  static async #evictOldest(exceptKey: string): Promise<boolean> {
    const storage = DraftStore.#storage();
    if (!storage) return false;
    const appPrefix = `${DRAFT_PREFIX}.${getEnv().appName}.`;
    let oldest: { key: string; savedAt: number } | null = null;
    for (const key of DraftStore.#keysUnder(appPrefix)) {
      if (key === exceptKey) continue;
      const savedAt = DraftStore.#savedAtOf(storage, key) ?? 0;
      if (!oldest || savedAt < oldest.savedAt) oldest = { key, savedAt };
    }
    if (!oldest) return false;
    await DraftStore.remove(oldest.key);
    return true;
  }
}
