import { AkanError } from "akanjs/base";

export type BrowserErrorKind = "uncaught" | "caught" | "recoverable" | "error" | "rejection";

export type BrowserErrorShell = "ios" | "android" | "macos" | "windows" | "linux";

export interface BrowserErrorData {
  /** How the page heard it: a React root's uncaught, caught or recoverable error, `window.onerror`, or a rejection. */
  kind: BrowserErrorKind;
  name: string;
  message: string;
  stack: string | null;
  routeId: string | null;
  digest: string | null;
  buildId: string | null;
  userAgent: string | null;
  /** The native shell whose page sent it; null for a page a browser opened. */
  shell: BrowserErrorShell | null;
}

//? Security: rebuilt from text a page's script sent, so every field is data to show, never code to run or trust.
export class BrowserError extends AkanError<"browserError", BrowserErrorData> {
  declare readonly data: BrowserErrorData;
  constructor(data: BrowserErrorData) {
    super("browserError", `${data.name}: ${data.message}`, { data });
    this.name = "BrowserError";
    this.stack = data.stack ? `${this.name}: ${this.message}\n${data.stack}` : `${this.name}: ${this.message}`;
  }
}
