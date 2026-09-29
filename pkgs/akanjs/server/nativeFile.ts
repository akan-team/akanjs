import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getEnv } from "akanjs/base";
import type { AkanIpcMessage } from "akanjs/service";

export type NativeFileMode = "read" | "write" | "folder";

type Resolved = Extract<AkanIpcMessage, { type: "file.resolved" }>;

//* A file the user picked in the desktop app for its server (file-picker `forServer`) arrives as a grant, never as
//* a path. The server the app carries asks the shell that showed the dialog, over the IPC channel the shell started
//* it with. `akan start` behind a dev build checks the grant's signature against ~/.akan/native/dev-file-grant.key,
//* which only this user can read; @akanjs/native desktop/src/grants.ts writes both.
export class NativeFile {
  static timeoutMs = 5_000;
  static operationMode: () => string = () => getEnv().operationMode;
  static readonly #waiting = new Map<string, (answer: Resolved) => void>();
  static #listener: ((message: unknown) => void) | null = null;

  /** The path behind `grant`, which the user must have given for `mode`. */
  static async resolve(grant: string, mode: NativeFileMode): Promise<string> {
    const found = grant.startsWith("dev:") ? NativeFile.#devGrant(grant) : await NativeFile.#ask(grant);
    if (found.mode !== mode) throw new Error(`The file was granted to ${found.mode}, not to ${mode}.`);
    return found.path;
  }

  /** A path inside a folder grant; one that climbs out of the folder is refused. */
  static async resolveIn(grant: string, relative: string): Promise<string> {
    const folder = await NativeFile.resolve(grant, "folder");
    const target = path.resolve(folder, relative);
    const inside = path.relative(folder, target);
    if (inside.startsWith("..") || path.isAbsolute(inside))
      throw new Error(`${relative} is outside the folder the user granted.`);
    return target;
  }

  static #ask(grant: string): Promise<{ path: string; mode: NativeFileMode }> {
    const send = process.send?.bind(process);
    if (!send) return Promise.reject(new Error("A file grant resolves only inside the desktop app that gave it."));
    NativeFile.#listen();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        NativeFile.#waiting.delete(id);
        reject(new Error("The desktop app did not answer for the file grant."));
      }, NativeFile.timeoutMs);
      NativeFile.#waiting.set(id, (answer) => {
        clearTimeout(timer);
        NativeFile.#waiting.delete(id);
        if (answer.path && answer.mode) resolve({ path: answer.path, mode: answer.mode });
        else reject(new Error(answer.error ?? "The desktop app refused the file grant."));
      });
      send({ type: "file.resolve", id, grant } satisfies AkanIpcMessage);
    });
  }

  static #listen() {
    if (NativeFile.#listener) return;
    NativeFile.#listener = (message) => {
      const answer = message as AkanIpcMessage | null;
      if (answer?.type === "file.resolved") NativeFile.#waiting.get(answer.id)?.(answer);
    };
    process.on("message", NativeFile.#listener);
  }

  static #devGrant(grant: string): { path: string; mode: NativeFileMode } {
    //? A grant that carries its path would read whatever a caller names on any server but the developer's own.
    if (NativeFile.operationMode() !== "local")
      throw new Error("A dev build's file grant resolves only on akan start, in operationMode local.");
    const [, mode, encoded = "", signature = ""] = grant.split(":");
    if (mode !== "read" && mode !== "write" && mode !== "folder") throw new Error("The file grant is malformed.");
    const key = readFileSync(
      process.env.AKAN_NATIVE_DEV_GRANT_KEY || path.join(homedir(), ".akan", "native", "dev-file-grant.key"),
    );
    const expected = createHmac("sha256", key).update(`${mode}:${encoded}`).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new Error("The file grant was not signed by this computer's dev build.");
    return { path: Buffer.from(encoded, "base64url").toString(), mode };
  }
}
