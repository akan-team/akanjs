import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { ClipboardApi } from "./index.ts";

// navigator.clipboard as in capacitor-plugins/clipboard/src/web.ts, plus an execCommand("copy")
// fallback for writing where the async API is missing (insecure http:// dev servers on a phone)
// or refused. Both methods start the browser call synchronously: Safari and Firefox only honour
// clipboard access inside the click that triggered it.

function checkText(text: unknown): string {
  if (typeof text !== "string") throw new AkanNativeError("INVALID_ARGS", "text must be a string");
  return text;
}

/** Copies through a temporary textarea. Only works inside a user gesture. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", ""); // no soft keyboard
  // 16px: iOS Safari zooms into smaller focused text fields.
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px";
  document.body.appendChild(area);
  let copied = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length); // select() alone selects nothing on iOS
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    area.remove();
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
    active?.focus({ preventScroll: true });
  }
  return copied;
}

export const web = defineWebPlugin<ClipboardApi>({
  methods: {
    writeText(args) {
      const text = checkText(args?.text);
      const api = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (typeof api?.writeText !== "function") {
        if (legacyCopy(text)) return Promise.resolve();
        throw new AkanNativeError("UNSUPPORTED", "the Clipboard API is not available here (insecure context?)");
      }
      return api.writeText(text).catch((error: unknown) => {
        // Chrome: "Document is not focused"; Safari: no user gesture. The old path sometimes still works.
        if (legacyCopy(text)) return;
        throw AkanNativeError.from(error); // NotAllowedError → PERMISSION_DENIED
      });
    },
    async readText() {
      const api = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (typeof api?.readText !== "function") {
        throw new AkanNativeError(
          "UNSUPPORTED",
          "reading the clipboard is not available here (insecure context or no Clipboard API)",
        );
      }
      try {
        return { text: await api.readText() };
      } catch (error) {
        throw AkanNativeError.from(error); // NotAllowedError (denied, or the Paste button was dismissed) → PERMISSION_DENIED
      }
    },
  },
});
