import { defineWebPlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { announceInPage, checkAnnounce } from "./announce.ts";
import type { AccessibilityApi, AccessibilityEvents, AccessibilityState } from "./index.ts";

// The page's view, used on the web and on macOS ("desktop": "web": the shell has no op for
// NSWorkspace's accessibility settings; WebKit maps Reduce Motion to prefers-reduced-motion).
// - screenReader: null. Browsers do not reveal assistive technology, which is why
//   capacitor-plugins/screen-reader/src/web.ts:6-8 rejects isEnabled() on the web; a null keeps
//   getState() usable for the other fields.
// - reduceMotion: `prefers-reduced-motion: reduce`, watched with matchMedia for change events.
// - fontScale: the computed size of `font-size: medium`, which is the user's default font size
//   (browser settings, 16 px by default). No event tells when it changes, so it is read again
//   when the page becomes visible (the setting is changed elsewhere).
// - announce: live regions (announce.ts).

function motionQuery(): MediaQueryList | null {
  return typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
}

export function readFontScale(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 1;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;font-size:medium";
  (document.body ?? document.documentElement).append(probe);
  const px = Number.parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return Number.isFinite(px) && px > 0 ? Math.round((px / 16) * 1000) / 1000 : 1;
}

export function readWebState(): AccessibilityState {
  return { screenReader: null, reduceMotion: motionQuery()?.matches ?? false, fontScale: readFontScale() };
}

export const web = defineWebPlugin<AccessibilityApi, AccessibilityEvents>({
  methods: {
    getState: async () => readWebState(),
    announce(options) {
      const { text, priority } = checkAnnounce(options);
      return announceInPage(text, priority);
    },
  },
  events: {
    change(emit) {
      let last = readWebState();
      const check = () => {
        const next = readWebState();
        if (shallowEqual(next, last)) return;
        last = next;
        emit(next);
      };
      const onVisible = () => {
        if (document.visibilityState === "visible") check();
      };
      const q = motionQuery();
      q?.addEventListener("change", check);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
      return () => {
        q?.removeEventListener("change", check);
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      };
    },
  },
});
