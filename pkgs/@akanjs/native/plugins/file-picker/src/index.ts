// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import {
  AkanNativeError,
  definePlugin,
  type FileRef,
  type Plugin,
  platform,
} from "../../../packages/core/src/index.ts";
import { bytesToBase64, isFileRef } from "./common.ts";
import { web } from "./web.ts";

/** A file the user picked: a copy served by the host (web: a blob: URL of the browser's File). */
export interface PickedFile extends FileRef {
  /** The file's name as the user saw it, e.g. "Invoice.pdf". Never a path. */
  name: string;
}

export interface DirectoryFile extends PickedFile {
  /** Relative to the picked folder, "/"-separated, e.g. "2026/March/receipt.pdf". */
  path: string;
}

export interface PickFilesOptions {
  /**
   * Allowed types: MIME types ("application/pdf", "image/*") or extensions ("pdf", ".csv").
   * Omitted, empty or "*\/*": any file. A type the platform cannot map turns the filter off rather
   * than hide files the user may be looking for.
   */
  types?: string[];
  /** Let the user pick more than one file. Default false. */
  multiple?: boolean;
}

export interface SaveFileOptions {
  /** Suggested file name; the user can change it (the result says what was chosen, where known). */
  name: string;
  /** Text, or base64 with encoding: "base64". */
  data?: string;
  /** Default "utf8". */
  encoding?: "utf8" | "base64";
  /** Instead of data: a FileRef of this session (camera, filesystem.readFile, pickFiles) or a blob:/data:/same-origin URL. */
  url?: string;
  /** MIME type of the content (Android files the document under it). Default: from the name's extension. */
  mime?: string;
}

export interface SaveFileResult {
  /** False when the user closed the dialog. On the web without showSaveFilePicker this is true once the download started. */
  saved: boolean;
  /** The name the file was saved under, when the platform tells (it may differ from the suggestion). */
  name?: string;
}

export interface PickDirectoryOptions {
  /** Most files to return (1–10000, default 1000); `truncated` tells whether there were more. */
  limit?: number;
}

export interface PickDirectoryResult {
  /** The folder's name; null when the user closed the dialog. */
  name: string | null;
  /** Every file inside, recursively, as copies; hidden files and folders (".*") are left out. */
  files: DirectoryFile[];
  truncated: boolean;
}

/**
 * System file dialogs.
 * - pickFiles: UIDocumentPickerViewController (iOS, as copies), ACTION_OPEN_DOCUMENT (Android, copied
 *   into the app cache), an NSOpenPanel sheet on the calling window (macOS), <input type=file> (web).
 * - saveFile: the export picker (iOS), ACTION_CREATE_DOCUMENT (Android), an NSSavePanel sheet
 *   (macOS), showSaveFilePicker or a download (web).
 * - pickDirectory: a read-only snapshot of a folder the user picks: its files, copied like pickFiles.
 * Results are copies registered as FileRefs; no absolute path reaches the page. Closing a dialog
 * resolves (`files: []`, `saved: false`, `name: null`); a second dialog while one is open rejects
 * CANCELLED. On the web call these from a click handler, before any await (user activation).
 */
export interface FilePickerApi {
  pickFiles(options?: PickFilesOptions): Promise<{ files: PickedFile[] }>;
  saveFile(options: SaveFileOptions): Promise<SaveFileResult>;
  pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult>;
}

const handle = definePlugin<FilePickerApi>("file-picker", {
  methods: ["pickFiles", "saveFile", "pickDirectory"],
  web,
});

/**
 * iOS and Android read FileRefs of the session natively. Other URLs given to a native host (blob:
 * URLs of web implementations, data: URLs, every URL on macOS, whose Bun host cannot look FileRefs
 * up) are fetched by the page and sent as base64.
 */
async function inline(options: SaveFileOptions): Promise<SaveFileOptions> {
  const url = options.url!;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new AkanNativeError("NOT_FOUND", `could not read ${url}`, { cause: error });
  }
  if (!response.ok) throw new AkanNativeError("NOT_FOUND", `could not read ${url} (${response.status})`);
  const blob = await response.blob();
  const { url: _, ...rest } = options;
  return {
    ...rest,
    mime: options.mime ?? (blob.type.split(";")[0] || undefined),
    data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    encoding: "base64",
  };
}

export type FilePicker = Plugin<FilePickerApi>;

/**
 * The iOS bridge parses requests with JSONSerialization, which drops a U+FEFF (byte order mark) at
 * the start of any string value (verified); such text goes as base64 there.
 */
function protectLeadingBom(options: SaveFileOptions): SaveFileOptions {
  if (
    platform !== "ios" ||
    typeof options?.data !== "string" ||
    (options.encoding ?? "utf8") !== "utf8" ||
    !options.data.startsWith("\uFEFF")
  ) {
    return options;
  }
  return { ...options, data: bytesToBase64(new TextEncoder().encode(options.data)), encoding: "base64" };
}

export const filePicker: FilePicker = Object.freeze({
  ...handle,
  saveFile(options: SaveFileOptions): Promise<SaveFileResult> {
    const url = options?.url;
    const native = handle.implementation("saveFile") === "native";
    // The web implementation is called synchronously: showSaveFilePicker needs the click's activation.
    if (!native) return handle.saveFile(options);
    if (typeof url !== "string" || url.length === 0) return handle.saveFile(protectLeadingBom(options));
    if ((platform === "ios" || platform === "android") && isFileRef(url)) return handle.saveFile(options);
    return inline(options).then((inlined) => handle.saveFile(inlined));
  },
});

export interface UseFilePicker {
  supported: { pickFiles: boolean; saveFile: boolean; pickDirectory: boolean };
  pending: boolean;
  /** Last failure. Closing a dialog is not a failure. */
  error: AkanNativeError | null;
  /** These resolve null on failure (see `error`). */
  pickFiles(options?: PickFilesOptions): Promise<PickedFile[] | null>;
  saveFile(options: SaveFileOptions): Promise<SaveFileResult | null>;
  pickDirectory(options?: PickDirectoryOptions): Promise<PickDirectoryResult | null>;
}

export function useFilePicker(): UseFilePicker {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<AkanNativeError | null>(null);

  const wrap = React.useCallback(<T>(start: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    // start() runs before any await, so web dialogs keep the click's user activation.
    return start().then(
      (value) => (setPending(false), value),
      (e: unknown) => {
        setPending(false);
        setError(AkanNativeError.from(e));
        return null;
      },
    );
  }, []);

  return {
    supported: {
      pickFiles: filePicker.isSupported("pickFiles"),
      saveFile: filePicker.isSupported("saveFile"),
      pickDirectory: filePicker.isSupported("pickDirectory"),
    },
    pending,
    error,
    pickFiles: React.useCallback((options) => wrap(() => filePicker.pickFiles(options).then((r) => r.files)), [wrap]),
    saveFile: React.useCallback((options) => wrap(() => filePicker.saveFile(options)), [wrap]),
    pickDirectory: React.useCallback((options) => wrap(() => filePicker.pickDirectory(options)), [wrap]),
  };
}
