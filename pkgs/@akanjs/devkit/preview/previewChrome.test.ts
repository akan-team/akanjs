import { afterEach, describe, expect, test } from "bun:test";
import { PreviewChrome } from "./PreviewChrome";

const saved = {
  backend: process.env[PreviewChrome.backendEnvKey],
  path: process.env[PreviewChrome.pathEnvKey],
};

afterEach(() => {
  if (saved.backend === undefined) delete process.env[PreviewChrome.backendEnvKey];
  else process.env[PreviewChrome.backendEnvKey] = saved.backend;
  if (saved.path === undefined) delete process.env[PreviewChrome.pathEnvKey];
  else process.env[PreviewChrome.pathEnvKey] = saved.path;
});

describe("PreviewChrome", () => {
  test("picks the system framework on macOS and Chrome everywhere else", () => {
    expect(PreviewChrome.backend).toBe(process.platform === "darwin" ? "webkit" : "chrome");
  });

  test("an explicit backend wins over the platform default", () => {
    process.env[PreviewChrome.backendEnvKey] = "chrome";
    expect(PreviewChrome.backend).toBe("chrome");
    process.env[PreviewChrome.backendEnvKey] = "webkit";
    expect(PreviewChrome.backend).toBe("webkit");
  });

  test("an unknown backend name falls back rather than reaching the launcher", () => {
    process.env[PreviewChrome.backendEnvKey] = "firefox";
    expect(PreviewChrome.backend).toBe(process.platform === "darwin" ? "webkit" : "chrome");
  });

  test("the Chrome option carries the two flags a container needs and Bun does not add", () => {
    process.env[PreviewChrome.backendEnvKey] = "chrome";
    const option = PreviewChrome.backendOption();
    expect(typeof option).toBe("object");
    expect((option as { argv: string[] }).argv).toContain("--disable-dev-shm-usage");
  });

  test("the webkit option is the bare string the constructor validates", () => {
    process.env[PreviewChrome.backendEnvKey] = "webkit";
    expect(PreviewChrome.backendOption()).toBe("webkit");
  });

  test("BUN_CHROME_PATH is honoured, because Bun's own launcher reads it", () => {
    process.env[PreviewChrome.pathEnvKey] = "/opt/custom/chrome";
    expect(PreviewChrome.executable()).toBe("/opt/custom/chrome");
  });

  test("availability tracks the resolved backend", () => {
    process.env[PreviewChrome.backendEnvKey] = "chrome";
    process.env[PreviewChrome.pathEnvKey] = "/opt/custom/chrome";
    expect(PreviewChrome.available).toBe(true);
    expect(PreviewChrome.unavailableReason()).toBeUndefined();
  });

  test("the unavailable message names the install step rather than only the symptom", () => {
    process.env[PreviewChrome.backendEnvKey] = "chrome";
    delete process.env[PreviewChrome.pathEnvKey];
    if (PreviewChrome.available) return;
    const reason = PreviewChrome.unavailableReason() ?? "";
    expect(reason).toContain("chromium");
    expect(reason).toContain(PreviewChrome.pathEnvKey);
  });

  test("the image steps install fonts, or every rendered glyph is a box", () => {
    const step = PreviewChrome.dockerRuns.join(" ");
    expect(step).toContain("chromium");
    expect(step).toContain("fonts-noto-cjk");
    // Leftover apt lists bloat every image layer that takes this step.
    expect(step).toContain("rm -rf /var/lib/apt/lists/*");
  });
});
