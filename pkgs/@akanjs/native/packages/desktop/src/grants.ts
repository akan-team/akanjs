// Files the user picked for the app's server (file-picker `forServer`). The page holds an opaque grant, and
// only the carried server learns the path, by asking over its IPC channel (server.ts): the server reaches
// what the user picked and nothing else. A grant lasts as long as the app runs.
//
// A dev build without a server of its own (its pages come from `akan start`) gives a grant that carries the path,
// signed with a key in ~/.akan/native that only this user can read; akanjs `NativeFile` checks the signature.
// The format is `dev:<mode>:<base64url path>:<base64url HMAC-SHA256 of "<mode>:<base64url path>">`.
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type GrantMode = "read" | "write" | "folder";

export interface FileGrant {
  path: string;
  mode: GrantMode;
}

const grants = new Map<string, FileGrant>();

//? AKAN_NATIVE_DEV_GRANT_KEY moves it; a changed HOME does not, since Bun reads homedir() once per process.
export function devGrantKeyFile(home = homedir()): string {
  return process.env.AKAN_NATIVE_DEV_GRANT_KEY || join(home, ".akan", "native", "dev-file-grant.key");
}

export function grantFile(path: string, mode: GrantMode, { dev = false }: { dev?: boolean } = {}): string {
  if (dev) {
    const body = `${mode}:${Buffer.from(path).toString("base64url")}`;
    return `dev:${body}:${createHmac("sha256", devGrantKey()).update(body).digest("base64url")}`;
  }
  const id = randomBytes(18).toString("base64url");
  grants.set(id, { path, mode });
  return id;
}

export function resolveGrant(id: unknown): FileGrant | null {
  return typeof id === "string" ? (grants.get(id) ?? null) : null;
}

export function devGrantKey(file = devGrantKeyFile()): Buffer {
  try {
    return readFileSync(file);
  } catch {
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, randomBytes(32), { mode: 0o600, flag: "wx" });
      chmodSync(file, 0o600);
    } catch {
      // Another process made it first: read that one.
    }
    return readFileSync(file);
  }
}
