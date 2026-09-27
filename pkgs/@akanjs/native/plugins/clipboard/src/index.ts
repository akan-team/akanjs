// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import { AkanNativeError, definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

/**
 * Plain text on the system clipboard.
 *
 * readText resolves `{ text: "" }` when the clipboard holds no text. It may reject:
 * - PERMISSION_DENIED
 *   - iOS 16+: the user answered "Don't Allow" to the paste prompt, shown when another app copied the text
 *   - Android 10+: the app does not have window focus
 *   - web: the browser refused (Chrome asks for clipboard-read permission, Safari and Firefox show a
 *     "Paste" button that must be clicked, both need a user gesture)
 * - UNSUPPORTED on the web without `navigator.clipboard.readText` (insecure http:// origin, older browsers)
 *
 * writeText needs a user gesture on the web (and a focused document in Chrome); without
 * `navigator.clipboard` it falls back to `execCommand("copy")`, which also needs the gesture.
 */
export interface ClipboardApi {
  writeText(args: { text: string }): Promise<void>;
  readText(): Promise<{ text: string }>;
}

export const clipboard = definePlugin<ClipboardApi>("clipboard", {
  methods: ["writeText", "readText"],
  web,
});

export interface UseClipboard {
  supported: boolean;
  /** True for `resetAfter` ms after a successful copy, for "Copied" feedback next to the button. */
  copied: boolean;
  /** Last copy failure. */
  error: AkanNativeError | null;
  /** Copies text; resolves false (and sets `error`) instead of throwing. */
  copy(text: string): Promise<boolean>;
}

/**
 * Copy-button helper. Android 13+ already shows a system confirmation after copying, so show
 * `copied` in place (e.g. the button label) rather than as an extra toast.
 */
export function useClipboard(options: { resetAfter?: number } = {}): UseClipboard {
  const resetAfter = options.resetAfter ?? 2000;
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<AkanNativeError | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = React.useCallback(
    async (text: string) => {
      clearTimeout(timer.current);
      try {
        // Called before any await so the web implementation keeps the click's user activation.
        await clipboard.writeText({ text });
        setError(null);
        setCopied(true);
        timer.current = setTimeout(() => setCopied(false), resetAfter);
        return true;
      } catch (e) {
        setCopied(false);
        setError(AkanNativeError.from(e));
        return false;
      }
    },
    [resetAfter],
  );

  return { supported: clipboard.isSupported("writeText"), copied, error, copy };
}
