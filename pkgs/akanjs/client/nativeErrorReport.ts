import { getEnv } from "akanjs/base";
import type { RscClientErrorSender } from "../server/rscClientErrorSender";
import type { BrowserErrorKind, BrowserErrorShell } from "../signal/browserError";
import { desktopPlatform, nativePlatform } from "./nativeHost";

export class NativeErrorReport {
  static readonly path = "/_akan/client-report";
  //? The server takes an id for 30 to 60 minutes after signing it, and a shell's page outlives that, so it asks again.
  static readonly answerLifetimeMs = 30 * 60_000;
  static #answer: Promise<RscClientErrorSender | null> | null = null;
  static #answeredAt = 0;

  static listen() {
    const shell = nativePlatform() ?? desktopPlatform();
    if (!shell || typeof window === "undefined") return;
    window.addEventListener("error", (event) => {
      if (event.error) NativeErrorReport.report(event.error, "error", shell);
    });
    window.addEventListener("unhandledrejection", (event) =>
      NativeErrorReport.report(event.reason, "rejection", shell),
    );
  }

  static report(error: unknown, kind: BrowserErrorKind, shell: BrowserErrorShell) {
    NativeErrorReport.#sender(shell).then(
      (sender) => sender?.send(error, kind, null),
      () => null,
    );
  }

  static reset() {
    NativeErrorReport.#answer = null;
    NativeErrorReport.#answeredAt = 0;
  }

  static #sender(shell: BrowserErrorShell): Promise<RscClientErrorSender | null> {
    const now = Date.now();
    if (!NativeErrorReport.#answer || now - NativeErrorReport.#answeredAt >= NativeErrorReport.answerLifetimeMs) {
      NativeErrorReport.#answeredAt = now;
      NativeErrorReport.#answer = NativeErrorReport.#ask(shell);
    }
    return NativeErrorReport.#answer;
  }

  static async #ask(shell: BrowserErrorShell): Promise<RscClientErrorSender | null> {
    const url = `${new URL(getEnv().serverHttpUri).origin}${NativeErrorReport.path}`;
    const res = await fetch(url, { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
    const requestId = res.status === 200 ? (await res.text()).trim() : "";
    if (!requestId) return null;
    const { RscClientErrorSender } = await import("../server/rscClientErrorSender");
    return new RscClientErrorSender(requestId, { url, shell });
  }
}
