"use client";
import { debugFrame, type Location } from "akanjs/client";
import { isNativeShell } from "akanjs/client/native";
import { splashScreen } from "akanjs/client/native/splash-screen";
import { CsrPageReadiness } from "./csrPageReadiness";

//* The shell keeps its splash up until the first page is drawn, since the devkit turns its hide on load off: hidden at
//* load, the splash faded onto a document not yet painted, and then onto the page's loading fallbacks.
export class NativeSplash {
  static readonly drawTimeoutMs = 4_000;
  static #hidden = false;

  static hideOnceDrawn(location: Location) {
    if (NativeSplash.#hidden || !isNativeShell() || !splashScreen.isSupported("hide")) return () => undefined;
    const startedAt = Date.now();
    let frame = 0;
    const isDrawn = () =>
      !CsrPageReadiness.drawsLater(location) ||
      CsrPageReadiness.isDrawn(location.entryId) ||
      Date.now() - startedAt >= NativeSplash.drawTimeoutMs;
    const hide = () => {
      NativeSplash.#hidden = true;
      void splashScreen.hide().catch((error: unknown) => debugFrame("splash.hide.failed", { error: String(error) }));
    };
    //? One frame more once drawn, so the page is painted under the splash before it fades.
    const check = () => {
      frame = requestAnimationFrame(isDrawn() ? hide : check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }
}
