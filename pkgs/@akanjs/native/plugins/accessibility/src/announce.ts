import { AkanNativeError } from "../../../packages/core/src/index.ts";
import type { AnnouncePriority } from "./index.ts";

// Announcements through ARIA live regions, for the web, macOS ("desktop": "web") and Android
// (announce runs in the page there: View.announceForAccessibility and TYPE_ANNOUNCEMENT are
// deprecated in API 36, verified with javap on android-36/android.jar, and the replacement the
// platform names is a live region, which is what an aria-live region in the WebView is).
// - One region per priority stays in the page: screen readers only watch regions they already
//   know, so a region inserted together with its text is often not read. A region that was just
//   (re)inserted gets a moment before the first message.
// - Each message is a new child node (aria-relevant additions, not atomic): the same text twice is
//   read twice, and a second polite message does not replace one still being read. Messages are
//   removed after a while so swiping through the page does not find old ones.
// - A modal <dialog> makes the rest of the page inert, so the regions move into the topmost one
//   (plugins/dialog uses showModal) and back to <body> once it is gone.
// - Visually hidden with CSSOM styles (strict CSP, SEC-4): clipped to nothing, but not display:none
//   or visibility:hidden, which would take it out of the accessibility tree.

const PRIORITIES: readonly AnnouncePriority[] = ["polite", "assertive"];
const HIDDEN =
  "position:fixed;left:0;top:0;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
const REGISTER_MS = 100;
const KEEP_MS = 7000;

/** Checks announce()'s options; the iOS plugin checks the same. */
export function checkAnnounce(options: unknown): { text: string; priority: AnnouncePriority } {
  if (typeof options !== "object" || options === null) throw new AkanNativeError("INVALID_ARGS", "text is required");
  const { text, priority } = options as Record<string, unknown>;
  if (text === undefined || text === null) throw new AkanNativeError("INVALID_ARGS", "text is required");
  if (typeof text !== "string") throw new AkanNativeError("INVALID_ARGS", "text must be a string");
  if (text.trim() === "") throw new AkanNativeError("INVALID_ARGS", "text must not be empty");
  if (priority !== undefined && priority !== null && !(PRIORITIES as readonly unknown[]).includes(priority)) {
    throw new AkanNativeError("INVALID_ARGS", `priority must be one of ${PRIORITIES.join(", ")}`);
  }
  return { text, priority: (priority as AnnouncePriority | null | undefined) ?? "polite" };
}

const regions = new Map<AnnouncePriority, HTMLElement>();

function topModal(): Element | null {
  try {
    const open = document.querySelectorAll("dialog:modal");
    return open.length > 0 ? open[open.length - 1]! : null;
  } catch {
    return null; // no :modal support
  }
}

function region(priority: AnnouncePriority): { el: HTMLElement; fresh: boolean } {
  const host = topModal() ?? document.body ?? document.documentElement;
  let el = regions.get(priority);
  if (el && el.parentNode === host) return { el, fresh: false };
  if (!el) {
    el = document.createElement("div");
    el.setAttribute("aria-live", priority);
    el.setAttribute("aria-relevant", "additions");
    el.setAttribute("data-akan-native-announcer", priority);
    el.style.cssText = HIDDEN;
    regions.set(priority, el);
  }
  host.append(el);
  return { el, fresh: true };
}

/** Adds `text` to the live region of `priority`; resolves once it is in the page. */
export function announceInPage(text: string, priority: AnnouncePriority): Promise<void> {
  if (typeof document === "undefined")
    return Promise.reject(new AkanNativeError("UNSUPPORTED", "announcements need a document"));
  const { el, fresh } = region(priority);
  const message = document.createElement("div");
  message.textContent = text;
  const add = () => {
    el.append(message);
    setTimeout(() => message.remove(), KEEP_MS);
  };
  if (!fresh) {
    add();
    return Promise.resolve();
  }
  return new Promise((resolve) =>
    setTimeout(() => {
      add();
      resolve();
    }, REGISTER_MS),
  );
}
