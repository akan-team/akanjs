// Web: the origin private file system (navigator.storage.getDirectory(), Chrome 86+, Safari 15.2+,
// Firefox 111+), one top-level folder per base. OPFS is private to the origin and invisible to the
// user, so "documents" is only a name here. Writes use FileSystemFileHandle.createWritable, which
// writes to a swap file and commits on close (atomic); Safari has it since 26.
// The API has no rename across folders everywhere (FileSystemHandle.move is not in every engine),
// so rename is copy + remove, streamed for large files.
import {
  AkanNativeError,
  defineWebPlugin,
  type FileRef,
  type WebCallContext,
} from "../../../packages/core/src/index.ts";
import {
  BASES,
  base64ToBytes,
  bytesToBase64,
  checkBase,
  checkEncoding,
  checkFlag,
  checkObject,
  checkPath,
  checkScope,
  checkWriteSource,
  decodeUtf8,
  invalid,
  mimeFor,
  serialQueue,
  sortEntries,
} from "./common.ts";
import type { BaseDirectory, DirEntry, FileInfo, FilesystemApi } from "./index.ts";

// The parts of the File System API used here, typed locally: TypeScript's DOM lib has entries()
// only in DOM.AsyncIterable.
interface FileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable?(options?: { keepExistingData?: boolean }): Promise<Writable>;
}
interface DirHandle {
  readonly kind: "directory";
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterable<[string, FileHandle | DirHandle]>;
}
interface Writable extends WritableStream<Uint8Array> {
  write(data: Blob | BufferSource | string): Promise<void>;
  seek(position: number): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}
type Handle = FileHandle | DirHandle;

const queue = serialQueue();

function mapError(error: unknown): AkanNativeError {
  if (error instanceof AkanNativeError) return error;
  const name = (error as { name?: string })?.name;
  const message = String((error as Error)?.message ?? error);
  switch (name) {
    case "NotFoundError":
      return new AkanNativeError("NOT_FOUND", message || "not found");
    case "TypeMismatchError": // a file where a folder is expected, or the other way round
    case "InvalidModificationError": // removing a non-empty folder without recursive
      return new AkanNativeError("INVALID_ARGS", message);
    case "NotAllowedError":
    case "SecurityError":
      return new AkanNativeError("PERMISSION_DENIED", message);
    default:
      return new AkanNativeError("INTERNAL", message);
  }
}

/** Runs one operation in call order and maps DOMExceptions to AkanNativeError codes. */
function op<T>(task: () => Promise<T>): Promise<T> {
  return queue(task).catch((error: unknown) => {
    throw mapError(error);
  });
}

async function baseDir(base: BaseDirectory): Promise<DirHandle> {
  const storage = globalThis.navigator?.storage as { getDirectory?: () => Promise<unknown> } | undefined;
  if (typeof storage?.getDirectory !== "function") {
    throw new AkanNativeError(
      "UNSUPPORTED",
      "the origin private file system is not available here (insecure context or old browser)",
    );
  }
  const root = (await storage.getDirectory()) as DirHandle;
  return root.getDirectoryHandle(base, { create: true });
}

async function dirAt(base: BaseDirectory, segments: string[], create = false): Promise<DirHandle> {
  let dir = await baseDir(base);
  for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create });
  return dir;
}

/** The entry `name` in `parent`, or null. */
async function lookup(parent: DirHandle, name: string): Promise<Handle | null> {
  try {
    return await parent.getFileHandle(name);
  } catch (error) {
    const kind = (error as { name?: string })?.name;
    if (kind === "TypeMismatchError") return parent.getDirectoryHandle(name);
    if (kind === "NotFoundError") return null;
    throw error;
  }
}

/** Parent folder and entry of a path (entry null when missing). The parent must exist. */
async function locate(
  base: BaseDirectory,
  segments: string[],
): Promise<{ parent: DirHandle; name: string; entry: Handle | null }> {
  const parent = await dirAt(base, segments.slice(0, -1));
  const name = segments.at(-1)!;
  return { parent, name, entry: await lookup(parent, name) };
}

const notFound = (path: string) => new AkanNativeError("NOT_FOUND", `${path} does not exist`);

async function info(handle: Handle): Promise<FileInfo> {
  if (handle.kind === "directory") return { type: "directory", size: 0, mtime: 0 };
  const file = await handle.getFile();
  return { type: "file", size: file.size, mtime: file.lastModified };
}

async function isEmpty(dir: DirHandle): Promise<boolean> {
  for await (const _ of dir.entries()) return false;
  return true;
}

async function writable(handle: FileHandle, keepExistingData: boolean): Promise<Writable> {
  if (typeof handle.createWritable !== "function") {
    throw new AkanNativeError(
      "UNSUPPORTED",
      "this browser cannot write files from the page (FileSystemFileHandle.createWritable)",
    );
  }
  return handle.createWritable({ keepExistingData });
}

async function copyInto(source: Handle, parent: DirHandle, name: string): Promise<void> {
  if (source.kind === "file") {
    const target = await parent.getFileHandle(name, { create: true });
    const out = await writable(target, false);
    await (await source.getFile()).stream().pipeTo(out); // pipeTo closes (commits) the writable
    return;
  }
  const dir = await parent.getDirectoryHandle(name, { create: true });
  for await (const [child, handle] of source.entries()) await copyInto(handle, dir, child);
}

async function move(args: unknown, keepSource: boolean, ctx?: WebCallContext): Promise<void> {
  const o = checkObject(args);
  const base = checkBase(o.base);
  const toBase = o.toBase === undefined || o.toBase === null ? base : checkBase(o.toBase, "toBase");
  const from = checkPath(o.from, false, "from");
  const to = checkPath(o.to, false, "to");
  checkScope(ctx?.scope, base, from);
  checkScope(ctx?.scope, toBase, to);
  if (base === toBase) {
    if (from.join("/") === to.join("/")) throw invalid("from and to are the same path");
    if (to.length > from.length && from.every((s, i) => to[i] === s))
      throw invalid("cannot move or copy a folder into itself");
  }
  const src = await locate(base, from).catch((error) => {
    throw (error as { name?: string })?.name === "NotFoundError" ? notFound(String(o.from)) : error;
  });
  if (!src.entry) throw notFound(String(o.from));
  const dst = await locate(toBase, to);
  if (dst.entry) {
    if (dst.entry.kind === "directory") throw invalid(`${o.to} already exists and is a folder`);
    if (src.entry.kind === "directory") throw invalid(`${o.to} already exists and is a file`);
  }
  await copyInto(src.entry, dst.parent, dst.name);
  if (!keepSource) await src.parent.removeEntry(src.name, { recursive: true });
}

async function readFile(args: unknown, ctx?: WebCallContext): Promise<{ data: string } | FileRef> {
  const o = checkObject(args);
  const base = checkBase(o.base);
  const segments = checkPath(o.path, false);
  checkScope(ctx?.scope, base, segments);
  const encoding = checkEncoding(o.encoding, true);
  return op(async () => {
    const { entry } = await locate(base, segments);
    if (!entry) throw notFound(String(o.path));
    if (entry.kind !== "file") throw invalid(`${o.path} is a folder`);
    const file = await entry.getFile();
    if (encoding === undefined) return { url: URL.createObjectURL(file), mime: mimeFor(entry.name), size: file.size };
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { data: encoding === "utf8" ? decodeUtf8(bytes) : bytesToBase64(bytes) };
  });
}

export const web = defineWebPlugin<FilesystemApi>({
  methods: {
    readFile: readFile as FilesystemApi["readFile"],

    writeFile(args, ctx?: WebCallContext) {
      const o = checkObject(args);
      const base = checkBase(o.base);
      const segments = checkPath(o.path, false);
      checkScope(ctx?.scope, base, segments);
      const source = checkWriteSource(o);
      const append = checkFlag(o.append, "append");
      const recursive = checkFlag(o.recursive, "recursive");
      return op(async () => {
        let content: Blob | Uint8Array | string;
        if (source.kind === "url") {
          const response = await fetch(source.url).catch((error: unknown) => {
            throw new AkanNativeError("NOT_FOUND", `could not read ${source.url}`, { cause: error });
          });
          if (!response.ok) throw new AkanNativeError("NOT_FOUND", `could not read ${source.url} (${response.status})`);
          content = await response.blob();
        } else {
          content = source.encoding === "base64" ? base64ToBytes(source.data) : source.data;
        }
        const parent = await dirAt(base, segments.slice(0, -1), recursive).catch((error) => {
          throw (error as { name?: string })?.name === "NotFoundError" ? notFound(`the folder of ${o.path}`) : error;
        });
        const name = segments.at(-1)!;
        const existing = await lookup(parent, name);
        if (existing?.kind === "directory") throw invalid(`${o.path} is a folder`);
        const handle = await parent.getFileHandle(name, { create: true });
        const out = await writable(handle, append);
        try {
          if (append) await out.seek((await handle.getFile()).size);
          await out.write(content as Blob | BufferSource | string);
          await out.close();
        } catch (error) {
          await out.abort().catch(() => {});
          throw error;
        }
      });
    },

    readDir(args, ctx?: WebCallContext) {
      const o = checkObject(args);
      const base = checkBase(o.base);
      const segments = checkPath(o.path, true);
      checkScope(ctx?.scope, base, segments);
      return op(async () => {
        const dir = await dirAt(base, segments).catch((error) => {
          const kind = (error as { name?: string })?.name;
          if (kind === "NotFoundError") throw notFound(String(o.path));
          if (kind === "TypeMismatchError") throw invalid(`${o.path} is not a folder`);
          throw error;
        });
        const entries: DirEntry[] = [];
        for await (const [name, handle] of dir.entries()) entries.push({ name, ...(await info(handle)) });
        return { entries: sortEntries(entries) };
      });
    },

    stat(args, ctx?: WebCallContext) {
      const o = checkObject(args);
      const base = checkBase(o.base);
      const segments = checkPath(o.path, true);
      checkScope(ctx?.scope, base, segments);
      return op(async () => {
        if (segments.length === 0) return info(await baseDir(base));
        const { entry } = await locate(base, segments).catch((error) => {
          throw (error as { name?: string })?.name === "NotFoundError" ? notFound(String(o.path)) : error;
        });
        if (!entry) throw notFound(String(o.path));
        return info(entry);
      });
    },

    exists(args, ctx?: WebCallContext) {
      const o = checkObject(args);
      const base = checkBase(o.base);
      const segments = checkPath(o.path, true);
      checkScope(ctx?.scope, base, segments);
      return op(async () => {
        if (segments.length === 0) return { value: true };
        try {
          return { value: (await locate(base, segments)).entry !== null };
        } catch (error) {
          const kind = (error as { name?: string })?.name;
          if (kind === "NotFoundError" || kind === "TypeMismatchError") return { value: false };
          throw error;
        }
      });
    },

    mkdir(args, ctx?: WebCallContext) {
      const o = checkObject(args);
      const base = checkBase(o.base);
      const segments = checkPath(o.path, true);
      checkScope(ctx?.scope, base, segments);
      const recursive = checkFlag(o.recursive, "recursive");
      return op(async () => {
        if (recursive) {
          await dirAt(base, segments, true).catch((error) => {
            throw (error as { name?: string })?.name === "TypeMismatchError"
              ? invalid(`a file is in the way of ${o.path}`)
              : error;
          });
          return;
        }
        if (segments.length === 0) throw invalid("the base folder already exists");
        const { parent, name, entry } = await locate(base, segments).catch((error) => {
          throw (error as { name?: string })?.name === "NotFoundError" ? notFound(`the folder of ${o.path}`) : error;
        });
        if (entry) throw invalid(`${o.path} already exists`);
        await parent.getDirectoryHandle(name, { create: true });
      });
    },

    remove(args, ctx?: WebCallContext) {
      const o = checkObject(args);
      const base = checkBase(o.base);
      const segments = checkPath(o.path, false);
      checkScope(ctx?.scope, base, segments);
      const recursive = checkFlag(o.recursive, "recursive");
      return op(async () => {
        const { parent, name, entry } = await locate(base, segments).catch((error) => {
          throw (error as { name?: string })?.name === "NotFoundError" ? notFound(String(o.path)) : error;
        });
        if (!entry) throw notFound(String(o.path));
        if (entry.kind === "directory" && !recursive && !(await isEmpty(entry)))
          throw invalid(`${o.path} is not empty (pass recursive: true)`);
        await parent.removeEntry(name, { recursive });
      });
    },

    rename: (args, ctx?: WebCallContext) => op(() => move(args, false, ctx)),
    copy: (args, ctx?: WebCallContext) => op(() => move(args, true, ctx)),

    async paths() {
      return Object.fromEntries(BASES.map((base) => [base, `opfs:/${base}`])) as Record<BaseDirectory, string>;
    },
  },
});
