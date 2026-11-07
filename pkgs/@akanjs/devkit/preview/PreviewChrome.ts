import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type PreviewEngine = "webkit" | "chrome";

// Bun.WebView's `webkit` backend is the macOS system framework and throws on every other platform.
export class PreviewChrome {
  /** Read by `Bun.WebView` itself; listed so the availability check agrees with what the launcher will do. */
  static readonly pathEnvKey = "BUN_CHROME_PATH";

  /** Set this to drive Chrome on macOS too, e.g. to reproduce what a pod sees. */
  static readonly backendEnvKey = "AKAN_CODE_WEBVIEW_BACKEND";

  /** The executables Bun looks for on PATH before giving up. */
  static readonly executables = [
    "chromium",
    "chromium-browser",
    "google-chrome-stable",
    "google-chrome",
    "brave-browser",
    "microsoft-edge",
    "chrome",
  ];

  /** Must match the macOS app bundles Bun searches, or the probe refuses a browser the launcher would find. */
  static readonly appBundles = [
    "Google Chrome.app/Contents/MacOS/Google Chrome",
    "Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "Chromium.app/Contents/MacOS/Chromium",
    "Brave Browser.app/Contents/MacOS/Brave Browser",
    "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  static get backend(): PreviewEngine {
    const declared = process.env[PreviewChrome.backendEnvKey];
    if (declared === "webkit" || declared === "chrome") return declared;
    return process.platform === "darwin" ? "webkit" : "chrome";
  }

  static executable() {
    const declared = process.env[PreviewChrome.pathEnvKey];
    if (declared) return declared;
    for (const name of PreviewChrome.executables) {
      const found = Bun.which(name);
      if (found) return found;
    }
    if (process.platform !== "darwin") return undefined;
    for (const root of ["/Applications", path.join(homedir(), "Applications")])
      for (const bundle of PreviewChrome.appBundles) {
        const candidate = path.join(root, bundle);
        if (existsSync(candidate)) return candidate;
      }
    return undefined;
  }

  static get available() {
    return PreviewChrome.isAvailable();
  }

  static isAvailable(engine: PreviewEngine = PreviewChrome.backend) {
    return engine === "webkit" ? process.platform === "darwin" : !!PreviewChrome.executable();
  }

  static backendOption(engine: PreviewEngine = PreviewChrome.backend) {
    if (engine === "webkit") return "webkit";
    // Docker's default 64MB /dev/shm is below what Chromium's renderer allocates; the crash looks like a hung load.
    const argv = ["--disable-dev-shm-usage"];
    // Chromium refuses uid 0 with its sandbox on, and uid 0 is the ordinary uid in a container.
    if (process.getuid?.() === 0) argv.push("--no-sandbox");
    return { type: "chrome" as const, argv };
  }

  /** The generated image has no browser or fonts; a fontless container renders every glyph as a box. */
  static readonly dockerRuns = [
    "apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji fonts-noto-cjk && rm -rf /var/lib/apt/lists/*",
  ];

  static unavailableReason(engine: PreviewEngine = PreviewChrome.backend) {
    if (PreviewChrome.isAvailable(engine)) return undefined;
    if (engine === "webkit")
      return `The webkit WebView backend exists only on macOS. Set ${PreviewChrome.backendEnvKey}=chrome and install a browser.`;
    return [
      "The page preview needs a browser and this machine has none on PATH.",
      `Install one (${PreviewChrome.dockerRuns[0]}) or point ${PreviewChrome.pathEnvKey} at an existing Chrome.`,
    ].join(" ");
  }
}
