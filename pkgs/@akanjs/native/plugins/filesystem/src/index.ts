import {
  AkanNativeError,
  definePlugin,
  type FileRef,
  type Plugin,
  platform,
} from "../../../packages/core/src/index.ts";
import { bytesToBase64, fileRefId } from "./common.ts";
import { web } from "./web.ts";

/**
 * Where a path lives. Paths are always relative to one of these; absolute paths and ".." are
 * rejected with INVALID_ARGS, and symbolic links that lead outside the base with PERMISSION_DENIED.
 *
 * | base      | macOS                                   | iOS                                | Android                                        | web (OPFS) |
 * |-----------|-----------------------------------------|------------------------------------|------------------------------------------------|------------|
 * | data      | ~/Library/Application Support/<id>/files | Library/Application Support/files | files/ (Context.filesDir)                      | /data      |
 * | cache     | ~/Library/Caches/<id>/files             | Library/Caches/files               | cache/files                                    | /cache     |
 * | documents | ~/Documents                             | Documents                          | Android/data/<id>/files/Documents (external)   | /documents |
 * | temp      | $TMPDIR/<id>/files                      | tmp/files                          | cache/temp                                     | /temp      |
 *
 * - data: kept until the app is removed, included in device backups.
 * - cache, temp: the OS may delete them when storage runs low (iOS, Android) or at any time the app
 *   is not running (iOS tmp). Not backed up.
 * - documents: user-visible documents. On macOS the first access asks the user for the Documents
 *   folder (TCC). On iOS the Files app shows it only if the app's Info.plist sets
 *   UIFileSharingEnabled and LSSupportsOpeningDocumentsInPlace. On Android it is the app's own
 *   external folder: no permission, removed with the app.
 * - web: the origin private file system (navigator.storage.getDirectory()), one folder per base.
 */
export type BaseDirectory = "data" | "cache" | "documents" | "temp";
export type Encoding = "utf8" | "base64";
export type EntryType = "file" | "directory" | "symlink" | "other";

export interface PathOptions {
  /** Relative to `base`, "/"-separated, e.g. "notes/today.txt". */
  path: string;
  base: BaseDirectory;
}

export interface ReadFileOptions extends PathOptions {
  /**
   * "utf8" returns the text, "base64" the bytes as base64. Without an encoding the file is not
   * sent over the bridge at all: the result is a FileRef whose `url` serves the file (fetch it,
   * or use it as an <img>/<video> src), which is the way to read large or binary files.
   */
  encoding?: Encoding;
}

export type WriteFileOptions = PathOptions & {
  /** Add to the end of the file instead of replacing it. Replacing writes are atomic (temp file + rename). */
  append?: boolean;
  /** Create missing parent folders. Without it a missing parent rejects NOT_FOUND. */
  recursive?: boolean;
} & (
    | {
        /** Text, or base64 with encoding: "base64". For large binary content write base64 chunks with append. */
        data: string;
        /** Default "utf8". */
        encoding?: Encoding;
        url?: never;
      }
    | {
        /**
         * Copy the content of this URL: a FileRef of this session (camera.takePhoto, file-picker,
         * readFile), or a blob:, data: or same-origin URL, which the page fetches first.
         */
        url: string;
        data?: never;
        encoding?: never;
      }
  );

export interface FileInfo {
  /** Symbolic links are followed by stat and reported as "symlink" by readDir. */
  type: EntryType;
  /** Bytes; 0 for folders. */
  size: number;
  /** Last modification, ms since the epoch (like Date.now()). 0 where unknown (OPFS folders). */
  mtime: number;
}

export interface DirEntry extends FileInfo {
  name: string;
}

export interface MoveOptions {
  from: string;
  to: string;
  /** Base of `from`, and of `to` unless `toBase` is given. */
  base: BaseDirectory;
  toBase?: BaseDirectory;
}

export interface FilesystemApi {
  readFile(options: PathOptions & { encoding: Encoding }): Promise<{ data: string }>;
  readFile(options: PathOptions & { encoding?: undefined }): Promise<FileRef>;
  readFile(options: ReadFileOptions): Promise<{ data: string } | FileRef>;
  /** Creates or replaces the file (or appends to it). Parent folders must exist unless `recursive`. */
  writeFile(options: WriteFileOptions): Promise<void>;
  /** Entries of a folder ("" is the base itself), sorted by name. */
  readDir(options: PathOptions): Promise<{ entries: DirEntry[] }>;
  stat(options: PathOptions): Promise<FileInfo>;
  exists(options: PathOptions): Promise<{ value: boolean }>;
  /** Without `recursive` the parent must exist and the folder must not (INVALID_ARGS). */
  mkdir(options: PathOptions & { recursive?: boolean }): Promise<void>;
  /** Removes a file, a symbolic link (not its target) or a folder; non-empty folders need `recursive`. */
  remove(options: PathOptions & { recursive?: boolean }): Promise<void>;
  /**
   * Moves a file or folder, also across bases (copy + remove where the bases are on different
   * volumes). An existing file at `to` is replaced; an existing folder rejects INVALID_ARGS.
   */
  rename(options: MoveOptions): Promise<void>;
  /** Copies a file, or a folder with everything in it. Same rules for `to` as rename. */
  copy(options: MoveOptions): Promise<void>;
  /** Absolute locations of the bases, for display and logs only; other methods take relative paths. */
  paths(): Promise<Record<BaseDirectory, string>>;
}

const handle = definePlugin<FilesystemApi>("filesystem", {
  methods: ["readFile", "writeFile", "readDir", "stat", "exists", "mkdir", "remove", "rename", "copy", "paths"],
  web,
});

/**
 * iOS and Android copy FileRefs of the session natively. Anything else given as `url` to a native
 * host (a blob: URL from a web implementation, a data: URL, every URL on macOS, whose Bun host has
 * no FileRef lookup) is fetched by the page and sent as base64.
 */
function inlinedByPage(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  return !((platform === "ios" || platform === "android") && fileRefId(url));
}

async function fetchAsBase64(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new AkanNativeError("NOT_FOUND", `could not read ${url}`, { cause: error });
  }
  if (!response.ok) throw new AkanNativeError("NOT_FOUND", `could not read ${url} (${response.status})`);
  return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
}

/**
 * The iOS bridge parses requests with JSONSerialization, which drops a U+FEFF (byte order mark) at
 * the start of any string value (verified). Such text goes as base64 there, so the bytes on disk are
 * the ones written everywhere.
 */
export function protectLeadingBom(options: WriteFileOptions): WriteFileOptions {
  if (
    platform !== "ios" ||
    typeof options?.data !== "string" ||
    (options.encoding ?? "utf8") !== "utf8" ||
    !options.data.startsWith("\uFEFF")
  ) {
    return options;
  }
  return {
    ...options,
    data: bytesToBase64(new TextEncoder().encode(options.data)),
    encoding: "base64",
  } as WriteFileOptions;
}

export type Filesystem = Plugin<FilesystemApi>;

export const filesystem: Filesystem = Object.freeze({
  ...handle,
  writeFile(options: WriteFileOptions): Promise<void> {
    if (handle.implementation("writeFile") !== "native") return handle.writeFile(options);
    if (!inlinedByPage(options?.url)) return handle.writeFile(protectLeadingBom(options));
    const { url, ...rest } = options;
    return fetchAsBase64(url!).then((data) =>
      handle.writeFile({ ...rest, data, encoding: "base64" } as WriteFileOptions),
    );
  },
});
