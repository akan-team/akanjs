import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { OrientationState, ScreenOrientationApi, ScreenOrientationEvents } from "./index.ts";
import { checkLock, ORIENTATION_TYPES, type OrientationType } from "./types.ts";

// Web: the Screen Orientation API (screen.orientation). lock() exists only in some browsers and
// works only in fullscreen or installed web apps; TypeScript's DOM types dropped it
// (capacitor-plugins/screen-orientation/src/web.ts:10-15), hence the local type. Capacitor maps
// every lock failure to "unavailable"; here the DOMException names keep their meaning:
// NotSupportedError → UNSUPPORTED, SecurityError/NotAllowedError → PERMISSION_DENIED (not fullscreen),
// AbortError → CANCELLED (a later lock() or unlock() won). Without screen.orientation (old
// WebKit) the type is derived from the (orientation) media query.

interface Orientation extends EventTarget {
  readonly type: string;
  lock?(orientation: string): Promise<void>;
  unlock?(): void;
}

function orientation(): Orientation | undefined {
  return typeof screen === "undefined" ? undefined : (screen as Screen & { orientation?: Orientation }).orientation;
}

export function readWebOrientation(): OrientationState {
  const type = orientation()?.type;
  if (type && (ORIENTATION_TYPES as readonly string[]).includes(type)) return { type: type as OrientationType };
  const portrait = typeof matchMedia === "function" ? matchMedia("(orientation: portrait)").matches : true;
  return { type: portrait ? "portrait-primary" : "landscape-primary" };
}

export const web = defineWebPlugin<ScreenOrientationApi, ScreenOrientationEvents>({
  methods: {
    get: async () => readWebOrientation(),
    lock(args) {
      const wanted = checkLock(args?.orientation);
      const o = orientation();
      if (typeof o?.lock !== "function")
        return Promise.reject(new AkanNativeError("UNSUPPORTED", "this browser cannot lock the screen orientation"));
      // Synchronous up to lock(): requestFullscreen() + lock() in one click keeps the user activation.
      return o.lock(wanted).catch((error: unknown) => {
        const name = (error as { name?: string })?.name;
        const message = (error as Error)?.message ?? String(error);
        if (name === "NotSupportedError") throw new AkanNativeError("UNSUPPORTED", message);
        if (name === "SecurityError" || name === "NotAllowedError") {
          throw new AkanNativeError(
            "PERMISSION_DENIED",
            `${message} (browsers lock the orientation only in fullscreen or an installed web app)`,
          );
        }
        throw AkanNativeError.from(error);
      });
    },
    async unlock() {
      orientation()?.unlock?.(); // nothing to undo where lock() does not exist
    },
  },
  events: {
    change(emit) {
      let last = readWebOrientation().type;
      const check = () => {
        const next = readWebOrientation();
        if (next.type === last) return;
        last = next.type;
        emit({ type: next.type });
      };
      const o = orientation();
      if (o) {
        o.addEventListener("change", check);
        return () => o.removeEventListener("change", check);
      }
      const q = typeof matchMedia === "function" ? matchMedia("(orientation: portrait)") : null;
      q?.addEventListener("change", check);
      return () => q?.removeEventListener("change", check);
    },
  },
});
