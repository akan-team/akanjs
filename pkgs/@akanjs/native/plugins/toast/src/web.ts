import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { ToastApi } from "./index.ts";
import { checkShow, createToastQueue, MAX_QUEUED, type ToastItem } from "./queue.ts";

// In-page toast for the web, macOS ("desktop": "web") and iOS ("ios": "web"), shaped like Android's:
// a rounded box near the bottom that takes no touches and no focus, one toast at a time.
// - capacitor-plugins/toast/src/web.ts:12-15 appends a <pwa-toast> element, which only renders when
//   the app also loads @ionic/pwa-elements (otherwise the call resolves and nothing shows). Plain DOM here.
// - capacitor-plugins/toast/ios/Sources/ToastPlugin/Toast.swift:45-60 adds a label per call, so
//   toasts in quick succession cover each other; here they queue (queue.ts), as Android's do.
// - popover="manual" + showPopover() puts the box in the top layer, above any app z-index and above
//   modal <dialog>s (plugins/dialog), without moving focus. Engines without popovers get the top z-index.
// - The box is aria-hidden. Screen readers get the text from one live region (role=status) that
//   stays in the page: a live region inserted together with its text is often not read. While a
//   modal <dialog> is open the region moves into it, since the rest of the page is inert then.
// - One constructed stylesheet (a strict CSP blocks runtime <style>, SEC-4, see plugins/dialog/src/web.ts),
//   classes prefixed akan-native-toast, `all: initial` so app CSS for div does not leak in. Light/dark
//   follows prefers-color-scheme; with prefers-reduced-motion the box fades without moving.
// - A bottom toast is lifted above the on-screen keyboard (visualViewport), where Android shows it.

const P = "akan-native-toast";
const FADE_MS = 180;

const CSS = `
.${P}{all:initial;display:block;box-sizing:border-box;position:fixed;inset:auto;left:50%;z-index:2147483647;margin:0;
padding:10px 18px;border:0;border-radius:18px;width:max-content;max-width:min(560px,calc(100vw - 32px));height:auto;overflow:hidden;
background:rgba(38,38,40,.94);color:#fff;font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 6px 24px rgba(0,0,0,.24);
pointer-events:none;user-select:none;-webkit-user-select:none;
opacity:0;transform:translateX(-50%);translate:0 12px;transition:opacity ${FADE_MS}ms ease-out,translate ${FADE_MS}ms ease-out}
.${P}-bottom{bottom:calc(56px + env(safe-area-inset-bottom,0px))}
.${P}-top{top:calc(48px + env(safe-area-inset-top,0px));translate:0 -12px}
.${P}-center{top:50%;transform:translate(-50%,-50%);translate:0 0;scale:.96;transition:opacity ${FADE_MS}ms ease-out,scale ${FADE_MS}ms ease-out}
.${P}.${P}-on{opacity:1;translate:0 0;scale:1}
@media (prefers-color-scheme:dark){.${P}{background:rgba(232,232,237,.96);color:#1c1c1e;box-shadow:0 6px 24px rgba(0,0,0,.5)}}
@media (prefers-reduced-motion:reduce){.${P}{translate:0 0;scale:1;transition:opacity ${FADE_MS}ms linear}}
.${P}-live{position:fixed;left:0;top:0;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;

let sheet: CSSStyleSheet | null = null;

function injectStyle(): void {
  if (sheet || document.getElementById(`${P}-style`)) return;
  if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in document) {
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return;
    } catch {
      sheet = null;
    }
  }
  const style = document.createElement("style");
  style.id = `${P}-style`;
  style.textContent = CSS;
  (document.head ?? document.documentElement).append(style);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let live: HTMLElement | null = null;

/** A modal <dialog> makes the rest of the page inert, live regions included. */
function topModal(): Element | null {
  try {
    const open = document.querySelectorAll("dialog:modal");
    return open.length > 0 ? open[open.length - 1]! : null;
  } catch {
    return null; // no :modal support
  }
}

/** The persistent live region; `fresh` when it was just (re)inserted and needs a moment to be registered. */
function liveRegion(): { region: HTMLElement; fresh: boolean } {
  const host = topModal() ?? document.body ?? document.documentElement;
  if (live && live.parentNode === host) return { region: live, fresh: false };
  if (!live) {
    live = document.createElement("div");
    live.className = `${P}-live`;
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
  }
  host.append(live);
  return { region: live, fresh: true };
}

/** Moves a bottom toast above the soft keyboard when it covers the layout viewport's bottom. */
function liftAboveKeyboard(box: HTMLElement): void {
  const vv = typeof visualViewport === "undefined" ? null : visualViewport;
  if (!vv || vv.scale > 1.01) return; // pinch zoom moves the visual viewport as well
  const covered = innerHeight - vv.offsetTop - vv.height;
  if (covered > 80) box.style.bottom = `${Math.round(covered + 16)}px`;
}

function display(item: ToastItem): Promise<void> {
  injectStyle();
  const parent = document.body ?? document.documentElement;
  const box = document.createElement("div");
  box.className = `${P} ${P}-${item.position}`;
  box.setAttribute("aria-hidden", "true");
  box.textContent = item.text;
  if (item.position === "bottom") liftAboveKeyboard(box);
  parent.append(box);
  const popover = typeof box.showPopover === "function";
  if (popover) {
    try {
      box.popover = "manual";
      box.showPopover();
    } catch {
      // not in the top layer; the z-index still applies
    }
  }
  void box.offsetWidth; // lay out the hidden state first so the transition runs
  box.classList.add(`${P}-on`);

  const { region, fresh } = liveRegion();
  region.textContent = ""; // the same text twice is announced twice
  const announced = wait(fresh ? 150 : 50).then(() => {
    region.textContent = item.text;
  });

  return Promise.all([announced, wait(item.ms + FADE_MS)])
    .then(() => {
      box.classList.remove(`${P}-on`);
      return wait(FADE_MS);
    })
    .finally(() => {
      if (popover && box.matches(":popover-open")) box.hidePopover();
      box.remove();
      if (region.textContent === item.text) region.textContent = "";
    });
}

const queue = createToastQueue(display);

export const web = defineWebPlugin<ToastApi>({
  methods: {
    async show(options) {
      const item = checkShow(options);
      if (typeof document === "undefined") throw new AkanNativeError("UNSUPPORTED", "toasts need a document");
      if (!queue.push(item))
        console.warn(`[akan-native] toast: ${MAX_QUEUED} toasts are already queued, dropped "${item.text}"`);
    },
  },
});
