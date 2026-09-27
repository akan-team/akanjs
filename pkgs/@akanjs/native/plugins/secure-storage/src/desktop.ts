// Desktop: envelope encryption. One random 256-bit data key lives in the OS credential store; the
// values are AES-256-GCM encrypted with it into <appDataDir>/secure-storage.json (the Android
// design, with the OS store in place of AndroidKeyStore). The store:
// - macOS: the login Keychain, as a generic password (below).
// - Windows: the Credential Manager, a generic credential "<service>/data-key" of this user on this
//   machine (shell ops keychain.*, native/desktop/src/win/keychain.rs).
// - Linux: the Secret Service (gnome-keyring, KWallet, KeePassXC), an item with the attributes
//   service and account in the default collection, i.e. the login keyring (linux/keychain.rs).
//   A session without a Secret Service is UNSUPPORTED; a locked keyring asks for its password.
// Windows and Linux protect the key like the macOS Keychain does: readable by this user's
// processes, useless on another machine or account.
//
// Why not one Keychain item per key through /usr/bin/security (all measured on macOS 26):
// - `add-generic-password -w <value>` puts the secret in argv, where `ps` shows it.
// - `-w` as the last option reads the value from stdin when there is no tty, but through getpass():
//   values are silently cut at 128 characters.
// - `security -i` (commands on stdin) with `-X <hex>` keeps the value out of argv, but reads
//   4096-byte lines: a longer command is split and the rest runs as a second command, so values
//   over ~2 KB were stored truncated.
// - `find-generic-password -w` prints non-ASCII data as bare hex, which cannot be told apart from
//   an ASCII value made of hex digits (only `-g` on stderr is unambiguous).
// Here only the data key (64 hex characters, through `security -i`) crosses the tool, once per session.
//
// Protection: values are encrypted at rest and useless without this user's login Keychain (another
// Mac, a copy of the app folder, a Time Machine restore elsewhere). Not covered: the Keychain item's
// ACL trusts /usr/bin/security (partition "apple-tool:", checked with `security dump-keychain -a`),
// so any process of the same user can read the key through that tool without a prompt. Binding
// the item to the app's own signature needs Security.framework in-process (SecItemAdd from the
// native shell or bun:ffi) plus a stable Developer ID signature; with ad-hoc signed builds macOS
// would then ask for the Keychain password after every rebuild.
// tauri-plugins-workspace/plugins/stronghold takes the other route (a vault keyed by a password
// the app supplies); akan-native keeps the OS store so no password is needed.
//
// Apps signed with a Team ID (shell.json `signing: "team"`, Developer ID / Apple Development,
// CLI-9) keep the data key in an item the app adds itself (shell ops keychain.*,
// native/desktop/src/keychain.rs): its ACL trusts the app, not /usr/bin/security. It uses its own
// account, so a key stored by the tool earlier is copied over first and only then deleted.
// Not for ad-hoc or `akan-native signing setup` builds (verified on macOS 26): the item's ACL does trust
// the stable designated requirement, but its partition list holds the creating build's
// `cdhash:` (apps without a Team ID get cdhash partitions), so the next build is asked
// "wants to use your confidential information" again. Those builds keep the tool.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { SecureStorageApi } from "./index.ts";

const SECURITY = "/usr/bin/security"; // absolute: a Finder-launched app has launchd's minimal PATH
const ACCOUNT = "data-key";
/** The in-process item's account (another item than the tool's, see above). */
const APP_ACCOUNT = "data-key.app";
const NOT_FOUND = 44; // errSecItemNotFound as security's exit status
const DUPLICATE = 45; // errSecDuplicateItem

export interface DesktopSecureStorageOptions {
  /** Keychain service of the data key. Default `<app id>.akan-native.secure-storage`. */
  service?: (ctx: DesktopContext) => string;
  /** The encrypted values. Default `<appDataDir>/secure-storage.json`. */
  file?: (ctx: DesktopContext) => string;
}

interface Store {
  /**
   * Set on Windows and Linux, and on macOS when the app is signed with a Team ID: the key lives in
   * an item the shell reads and writes (keychain.* ops), not through /usr/bin/security.
   */
  shell: DesktopContext["shell"] | null;
  /** The account of the shell's item: APP_ACCOUNT on macOS (see above), ACCOUNT elsewhere. */
  account: string;
  service: string;
  label: string;
  file: string;
  key: Buffer | null;
  reading: Promise<Buffer | null> | null;
  creating: Promise<Buffer> | null;
  entries: Map<string, string> | null;
}

async function run(argv: string[], input?: string): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(argv, {
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

/** A word for `security -i`, whose tokenizer takes "…" with \" and \\ escapes. Lines cannot hold control characters. */
export function quoteForSecurity(text: string): string {
  const printable = [...text].map((c) => (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? " " : c)).join("");
  return `"${printable.replace(/[\\"]/g, "\\$&")}"`;
}

const hexKey = (store: Store, hex: string) => {
  if (!/^[0-9a-f]{64}$/.test(hex))
    throw new AkanNativeError(
      "INTERNAL",
      `the stored item ${store.service} (${store.account}) is not an akan-native secure storage key`,
    );
  return Buffer.from(hex, "hex");
};

async function readKey(store: Store): Promise<Buffer | null> {
  if (store.shell) {
    const { value } = (await store.shell("keychain.get", { service: store.service, account: store.account })) as {
      value: string | null;
    };
    if (value) return hexKey(store, value);
    if (process.platform !== "darwin") return null;
    const old = await readToolKey(store);
    if (!old) return null;
    await store.shell("keychain.set", {
      service: store.service,
      account: store.account,
      value: old.toString("hex"),
      label: store.label,
    });
    await run([SECURITY, "delete-generic-password", "-s", store.service, "-a", ACCOUNT]);
    return old;
  }
  return readToolKey(store);
}

async function readToolKey(store: Store): Promise<Buffer | null> {
  const { code, out, err } = await run([SECURITY, "find-generic-password", "-s", store.service, "-a", ACCOUNT, "-w"]);
  if (code === NOT_FOUND) return null;
  if (code !== 0)
    throw new AkanNativeError(
      "INTERNAL",
      `reading the secure storage key from the Keychain failed (${code}): ${err.trim()}`,
    );
  const hex = out.trim();
  if (!/^[0-9a-f]{64}$/.test(hex))
    throw new AkanNativeError(
      "INTERNAL",
      `the Keychain item ${store.service} is not an akan-native secure storage key`,
    );
  return Buffer.from(hex, "hex");
}

async function createKey(store: Store): Promise<Buffer> {
  const hex = randomBytes(32).toString("hex");
  if (store.shell) {
    const existing = await readKey(store); // another instance of the app created it first
    if (existing) return existing;
    // label: the item's name in the Secret Service (Seahorse), the credential's comment on Windows.
    await store.shell("keychain.set", {
      service: store.service,
      account: store.account,
      value: hex,
      label: store.label,
    });
    return Buffer.from(hex, "hex");
  }
  const command = [
    "add-generic-password",
    "-s",
    quoteForSecurity(store.service),
    "-a",
    quoteForSecurity(ACCOUNT),
    "-l",
    quoteForSecurity(store.label),
    "-j",
    quoteForSecurity(
      "akan-native: encrypts this app's secure-storage.json. Deleting it makes the stored values unreadable.",
    ),
    // -X takes the item data as hex: here the hex text of the key, so -w prints it back verbatim.
    "-X",
    Buffer.from(hex, "latin1").toString("hex"),
  ].join(" ");
  const { code, err } = await run([SECURITY, "-i"], `${command}\n`);
  if (code === DUPLICATE) {
    const existing = await readKey(store); // another instance of the app created it first
    if (existing) return existing;
  }
  if (code !== 0)
    throw new AkanNativeError(
      "INTERNAL",
      `storing the secure storage key in the Keychain failed (${code}): ${err.trim()}`,
    );
  return Buffer.from(hex, "hex");
}

function entries(store: Store): Map<string, string> {
  if (store.entries) return store.entries;
  const map = new Map<string, string>();
  if (existsSync(store.file)) {
    try {
      const data = JSON.parse(readFileSync(store.file, "utf8")) as { v?: unknown; entries?: Record<string, unknown> };
      if (data.v === 1 && data.entries && typeof data.entries === "object") {
        for (const [key, value] of Object.entries(data.entries)) if (typeof value === "string") map.set(key, value);
      }
    } catch (error) {
      console.error(`[akan-native] ${store.file} is unreadable, starting empty`, error);
    }
  }
  store.entries = map;
  return map;
}

function save(store: Store): void {
  mkdirSync(dirname(store.file), { recursive: true });
  // Write-then-rename so a crash never leaves a half-written file; owner-only like the Keychain.
  const tmp = `${store.file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ v: 1, entries: Object.fromEntries(entries(store)) }), { mode: 0o600 });
  renameSync(tmp, store.file);
}

function dataKey(store: Store, create: true): Promise<Buffer>;
function dataKey(store: Store, create: false): Promise<Buffer | null>;
function dataKey(store: Store, create: boolean): Promise<Buffer | null> {
  if (store.key) return Promise.resolve(store.key);
  if (create) {
    // One creation at a time, so two concurrent set() calls end up with the same key.
    store.creating ??= (async () => {
      let key = await readKey(store);
      if (!key) {
        key = await createKey(store);
        // Nothing stored before this key can be read with it (the Keychain item was deleted, or
        // the file came from another Mac): drop the leftovers.
        if (entries(store).size > 0) {
          entries(store).clear();
          save(store);
        }
      }
      store.key = key;
      return key;
    })().finally(() => {
      store.creating = null;
    });
    return store.creating;
  }
  store.reading ??= readKey(store)
    .then((key) => {
      if (key) store.key = key;
      return key;
    })
    .finally(() => {
      store.reading = null;
    });
  return store.reading;
}

/** AAD binds each value to its key: swapping entries in the file makes them unreadable. */
const aad = (name: string) => Buffer.from(`akan-native.secure-storage\0${name}`, "utf8");

export function encrypt(key: Buffer, name: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(name));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

/** null when the entry was written with another key, for another name, or is damaged. */
export function decrypt(key: Buffer, name: string, blob: string): string | null {
  try {
    const bytes = Buffer.from(blob, "base64");
    if (bytes.length < 12 + 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(aad(name));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function checkKey(key: unknown): string {
  if (typeof key !== "string" || key.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "key must be a non-empty string");
  return key;
}

/** shell.json of the running .app says it is signed with a Team ID (see above). */
function signedWithTeam(): boolean {
  const macos = dirname(process.execPath);
  const shell = join(dirname(macos), "Resources", "shell.json");
  try {
    return (JSON.parse(readFileSync(shell, "utf8")) as { signing?: string }).signing === "team";
  } catch {
    return false;
  }
}

export function createDesktopSecureStorage(options: DesktopSecureStorageOptions = {}) {
  const stores = new Map<string, Store>();
  const storeFor = (ctx: DesktopContext): Store => {
    const service = options.service?.(ctx) ?? `${ctx.app.id}.akan-native.secure-storage`;
    const file = options.file?.(ctx) ?? join(ctx.appDataDir, "secure-storage.json");
    const id = `${service}\0${file}`;
    let store = stores.get(id);
    if (!store) {
      const mac = process.platform === "darwin";
      const shell = !mac || signedWithTeam() ? ctx.shell : null;
      store = {
        shell,
        account: mac ? APP_ACCOUNT : ACCOUNT,
        service,
        label: `${ctx.app.name} secure storage`,
        file,
        key: null,
        reading: null,
        creating: null,
        entries: null,
      };
      stores.set(id, store);
    }
    return store;
  };

  return defineDesktopPlugin<SecureStorageApi>({
    id: "secure-storage",
    methods: {
      async get(args, ctx) {
        const name = checkKey(args?.key);
        const store = storeFor(ctx);
        const blob = entries(store).get(name);
        if (blob === undefined) return { value: null };
        const key = await dataKey(store, false);
        const value = key ? decrypt(key, name, blob) : null;
        if (value === null && key && entries(store).get(name) === blob) {
          entries(store).delete(name); // unreadable for good: forget it, as Android does
          save(store);
        }
        return { value };
      },
      async set(args, ctx) {
        const name = checkKey(args?.key);
        if (typeof args.value !== "string") throw new AkanNativeError("INVALID_ARGS", "value must be a string");
        const store = storeFor(ctx);
        const key = await dataKey(store, true);
        entries(store).set(name, encrypt(key, name, args.value));
        save(store);
      },
      remove(args, ctx) {
        const name = checkKey(args?.key);
        const store = storeFor(ctx);
        if (entries(store).delete(name)) save(store);
      },
      async keys(_args, ctx) {
        const store = storeFor(ctx);
        if (entries(store).size === 0) return { keys: [] };
        const key = await dataKey(store, false);
        if (!key) return { keys: [] }; // leftovers without a key: the next set() drops them
        // Only what get() can return; entries the key cannot read are dropped.
        const readable = [...entries(store)].filter(([name, blob]) => decrypt(key, name, blob) !== null);
        if (readable.length !== entries(store).size) {
          store.entries = new Map(readable);
          save(store);
        }
        return { keys: readable.map(([name]) => name).sort() };
      },
      clear(_args, ctx) {
        const store = storeFor(ctx);
        // The Keychain key stays: it holds no data, and set() would only create a new one.
        if (entries(store).size > 0 || existsSync(store.file)) {
          entries(store).clear();
          save(store);
        }
      },
    },
  });
}

export default createDesktopSecureStorage();
