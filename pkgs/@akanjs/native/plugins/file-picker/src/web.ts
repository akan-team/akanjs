// Web: <input type=file> for pickFiles and (webkitdirectory) pickDirectory, as
// capacitor-plugins/camera/src/web.ts picks files; saveFile uses showSaveFilePicker where it exists
// (Chromium) and a download link elsewhere, which cannot report a cancel or the final name.
// Every dialog is opened synchronously in the call: input.click() and showSaveFilePicker need the
// click's user activation.
import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import {
  base64ToBytes,
  checkFlag,
  checkLimit,
  checkMime,
  checkName,
  checkObject,
  checkSaveSource,
  checkTypes,
  isHidden,
  type SaveSource,
} from "./common.ts";
import type { DirectoryFile, FilePickerApi, PickDirectoryResult, PickedFile, SaveFileResult } from "./index.ts";

/** The accept attribute: MIME types as they are, extensions with a dot. */
export function acceptAttribute(types: string[]): string {
  return types.map((t) => (t.includes("/") ? t : `.${t}`)).join(",");
}

const picked = (file: File): PickedFile => ({
  url: URL.createObjectURL(file),
  name: file.name,
  mime: file.type || "application/octet-stream",
  size: file.size,
});

/** Shows a file input and settles with its files; [] when the dialog was closed (the "cancel" event). */
function chooseFiles(setup: (input: HTMLInputElement) => void): Promise<File[]> {
  if (typeof document === "undefined")
    return Promise.reject(new AkanNativeError("UNSUPPORTED", "no document to show a file dialog in"));
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    setup(input);
    // Kept in the document while the dialog is open, as capacitor-plugins/camera/src/web.ts does.
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => done([]), { once: true });
    input.click();
  });
}

/** What pickDirectory makes of the files an <input webkitdirectory> returns. */
export function directoryResult(files: File[], limit: number): PickDirectoryResult {
  let name: string | null = null;
  const out: DirectoryFile[] = [];
  let truncated = false;
  for (const file of files) {
    // webkitRelativePath is "<folder>/<path inside it>"
    const [folder, ...rest] = (file.webkitRelativePath || file.name).split("/");
    name ??= folder ?? null;
    const path = rest.join("/");
    if (!path || isHidden(path)) continue;
    if (out.length === limit) {
      truncated = true;
      break;
    }
    out.push({ ...picked(file), path });
  }
  return { name, files: out, truncated };
}

async function content(source: SaveSource, mime: string | undefined): Promise<Blob> {
  if (source.kind === "data") {
    const body = source.encoding === "base64" ? base64ToBytes(source.data) : source.data;
    return new Blob([body as BlobPart], mime ? { type: mime } : {});
  }
  let response: Response;
  try {
    response = await fetch(source.url);
  } catch (error) {
    throw new AkanNativeError("NOT_FOUND", `could not read ${source.url}`, { cause: error });
  }
  if (!response.ok) throw new AkanNativeError("NOT_FOUND", `could not read ${source.url} (${response.status})`);
  return response.blob();
}

interface SavePickerWindow {
  showSaveFilePicker?(options: { suggestedName?: string }): Promise<{
    name: string;
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

function download(blob: Blob, name: string): SaveFileResult {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { saved: true, name };
}

export const web = defineWebPlugin<FilePickerApi>({
  methods: {
    pickFiles(options) {
      const o = checkObject(options, true);
      const types = checkTypes(o.types);
      const multiple = checkFlag(o.multiple, "multiple");
      return chooseFiles((input) => {
        if (types.length) input.accept = acceptAttribute(types);
        input.multiple = multiple;
      }).then((files) => ({ files: files.map(picked) }));
    },

    saveFile(options) {
      const o = checkObject(options, false);
      const name = checkName(o.name);
      const source = checkSaveSource(o);
      const mime = checkMime(o.mime);
      if (typeof document === "undefined") throw new AkanNativeError("UNSUPPORTED", "no document to save from");
      const picker = (globalThis as SavePickerWindow).showSaveFilePicker;
      if (typeof picker !== "function") return content(source, mime).then((blob) => download(blob, name));
      // Ask for the destination first, while the click's activation lasts; read the content after.
      return picker.call(globalThis, { suggestedName: name }).then(
        async (handle) => {
          const out = await handle.createWritable();
          await out.write(await content(source, mime));
          await out.close();
          return { saved: true, name: handle.name };
        },
        async (error: unknown) => {
          const kind = (error as { name?: string })?.name;
          if (kind === "AbortError") return { saved: false };
          // No user activation left (an await before the call): fall back to a download.
          if (kind === "SecurityError" || kind === "NotAllowedError")
            return download(await content(source, mime), name);
          throw AkanNativeError.from(error);
        },
      );
    },

    pickDirectory(options) {
      const o = checkObject(options, true);
      const limit = checkLimit(o.limit);
      if (typeof HTMLInputElement === "undefined" || !("webkitdirectory" in HTMLInputElement.prototype)) {
        throw new AkanNativeError("UNSUPPORTED", "this browser cannot pick folders (<input webkitdirectory>)");
      }
      return chooseFiles((input) => {
        input.webkitdirectory = true;
        input.multiple = true;
      }).then((files) => (files.length ? directoryResult(files, limit) : { name: null, files: [], truncated: false }));
    },
  },
});
