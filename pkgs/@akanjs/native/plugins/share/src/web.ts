import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { ShareApi, ShareOptions, ShareResult } from "./index.ts";
import { checkOptions } from "./options.ts";

// navigator.share, as capacitor-plugins/share/src/web.ts, plus files and canShare(data).
// Used on the web and in the desktop WebView (WKWebView on app://localhost is a secure context with
// navigator.share and canShare({ files }), verified; WebView2 is Chromium, whose Web Share opens
// Windows' share dialog, not verified yet). Android's WebView and WebKitGTK (Linux, verified in
// the test container) have no navigator.share.
// Without files, navigator.share is called synchronously so it runs inside the click's user
// activation. With files they are fetched first; the activation lasts a few seconds, enough for
// local blob: and /__akan_native/file/ URLs.

export function webShareAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
};

/** A file name for the share target: the URL's last path segment if it has an extension. */
export function fileName(url: string, mime: string, index: number, base?: string): string {
  if (!url.startsWith("blob:") && !url.startsWith("data:")) {
    try {
      const last = new URL(url, base ?? globalThis.location?.href).pathname.split("/").pop();
      if (last && /\.[A-Za-z0-9]{1,8}$/.test(last)) return decodeURIComponent(last);
    } catch {
      // fall through to a generic name
    }
  }
  const type = mime.split(";")[0]!.trim().toLowerCase();
  const ext = EXTENSIONS[type] ?? (type.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin");
  return `file${index + 1}.${ext}`;
}

async function loadFiles(urls: string[]): Promise<File[]> {
  return Promise.all(
    urls.map(async (url, i) => {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (error) {
        throw new AkanNativeError("NOT_FOUND", `could not read ${url}`, { cause: error });
      }
      if (!response.ok) throw new AkanNativeError("NOT_FOUND", `could not read ${url} (${response.status})`);
      const blob = await response.blob();
      return new File([blob], fileName(url, blob.type, i), { type: blob.type });
    }),
  );
}

function toData(options: ShareOptions): ShareData {
  const data: ShareData = {};
  if (options.title) data.title = options.title;
  if (options.text) data.text = options.text;
  if (options.url) data.url = options.url;
  return data;
}

function run(data: ShareData): Promise<ShareResult> {
  return navigator.share(data).then(
    () => ({ completed: true }),
    (error: unknown) => {
      const name = (error as { name?: string })?.name;
      if (name === "AbortError") return { completed: false }; // the sheet was closed
      if (name === "InvalidStateError") throw new AkanNativeError("CANCELLED", "a share sheet is already open");
      if (name === "TypeError" || name === "DataError")
        throw new AkanNativeError("INVALID_ARGS", String((error as Error).message));
      throw AkanNativeError.from(error); // NotAllowedError (no user activation, permissions policy) → PERMISSION_DENIED
    },
  );
}

export const web = defineWebPlugin<ShareApi>({
  methods: {
    share(options) {
      const checked = checkOptions(options);
      if (!webShareAvailable()) {
        throw new AkanNativeError(
          "UNSUPPORTED",
          "the Web Share API is not available here (desktop Firefox, insecure context)",
        );
      }
      const data = toData(checked);
      if (!checked.files) return run(data);
      return loadFiles(checked.files).then((files) => {
        const withFiles: ShareData = { ...data, files };
        if (typeof navigator.canShare === "function" && !navigator.canShare(withFiles)) {
          throw new AkanNativeError("UNSUPPORTED", "this browser cannot share these files");
        }
        return run(withFiles);
      });
    },
    async canShare(options) {
      if (!webShareAvailable()) return { value: false };
      // No options (or {}: native hosts receive both as empty args) asks whether sharing exists at all.
      if (!options || Object.keys(options).length === 0) return { value: true };
      let checked: ShareOptions;
      try {
        checked = checkOptions(options);
      } catch {
        return { value: false }; // as navigator.canShare: invalid data is "cannot share", not an error
      }
      const data = toData(checked);
      if (typeof navigator.canShare !== "function") return { value: !checked.files };
      if (checked.files) {
        try {
          data.files = await loadFiles(checked.files);
        } catch {
          return { value: false };
        }
      }
      return { value: navigator.canShare(data) };
    },
  },
});
