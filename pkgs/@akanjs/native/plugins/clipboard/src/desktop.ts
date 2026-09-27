// Desktop, outside the page, so no user gesture and no WebKit paste callout are involved.
// - macOS: pbcopy / pbpaste from the Bun Worker. A native NSPasteboard path (as electrobun
//   nativeWrapper.mm:8641-8666 does) waits for the Q-P6 decision on desktop native code.
// - Windows and Linux: the shell's `clipboard.writeText` { text } → null and `clipboard.readText`
//   → { text } (native/desktop/src/win/clipboard.rs: CF_UNICODETEXT; linux/clipboard.rs: the GTK
//   CLIPBOARD selection, not PRIMARY).
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { ClipboardApi } from "./index.ts";

// pbcopy/pbpaste encode text in the locale's charset. An app started from Finder has no LANG, and
// then other apps see MacRoman mojibake ("한글" pasted as "ÌïúÍ∏Ä", verified with NSPasteboard).
const UTF8 = { LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" };

function checkText(text: unknown): string {
  if (typeof text !== "string") throw new AkanNativeError("INVALID_ARGS", "text must be a string");
  return text;
}

async function run(argv: string[], input?: string): Promise<string> {
  const proc = Bun.spawn(argv, {
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...UTF8 },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new AkanNativeError("INTERNAL", `${argv[0]} failed (${code}): ${err.trim()}`);
  return out;
}

/**
 * `pasteboard` is a pbcopy -pboard name; tests use "ruler" to leave the user's clipboard alone.
 * `platform` lets tests check the shell ops of Windows and Linux on any OS.
 */
export function createDesktopClipboard(
  pasteboard: "general" | "ruler" | "find" | "font" = "general",
  platform: NodeJS.Platform = process.platform,
) {
  if (platform !== "darwin") {
    return defineDesktopPlugin<ClipboardApi>({
      id: "clipboard",
      methods: {
        async writeText(args, ctx: DesktopContext) {
          await ctx.shell("clipboard.writeText", { text: checkText(args?.text) });
        },
        // No text on the clipboard (an image, files) is { text: "" }, as on macOS.
        readText: async (_args, ctx: DesktopContext) => ({
          text: ((await ctx.shell("clipboard.readText")) as { text: string | null }).text ?? "",
        }),
      },
    });
  }
  return defineDesktopPlugin<ClipboardApi>({
    id: "clipboard",
    methods: {
      async writeText(args) {
        await run(["/usr/bin/pbcopy", "-pboard", pasteboard], checkText(args?.text));
      },
      async readText() {
        // pbpaste prints nothing when the pasteboard holds no text (an image, files): { text: "" }.
        return { text: await run(["/usr/bin/pbpaste", "-pboard", pasteboard, "-Prefer", "txt"]) };
      },
    },
  });
}

export default createDesktopClipboard();
