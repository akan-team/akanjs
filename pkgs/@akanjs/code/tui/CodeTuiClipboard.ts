import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export class CodeTuiClipboard {
  static readonly imageTypes = [".png", ".jpg", ".jpeg", ".gif", ".webp"] as const;

  // A pasted image arrives as its file path (a macOS screenshot too, via its temp file). Split only where a new
  // absolute path starts: a screenshot's own name contains spaces.
  static imagePathsIn(text: string) {
    const pieces = text.split("\n").flatMap((line) => line.split(/ (?=\/)/));
    const images: string[] = [];
    const rest: string[] = [];
    for (const piece of pieces) {
      const file = CodeTuiClipboard.imagePathIn(piece);
      if (file) images.push(file);
      else if (piece.trim()) rest.push(piece);
    }
    return { images, rest: rest.join(" ") };
  }

  static imagePathIn(text: string) {
    const file = text
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\ /g, " ");
    if (!file || file.includes("\n")) return undefined;
    const lower = file.toLowerCase();
    if (!CodeTuiClipboard.imageTypes.some((ext) => lower.endsWith(ext))) return undefined;
    return existsSync(file) ? file : undefined;
  }

  /** The PNG on the clipboard as a file, or undefined when the clipboard holds no image. */
  static async image(): Promise<string | undefined> {
    const png = await CodeTuiClipboard.#read();
    if (!png?.length) return undefined;
    const file = path.join(tmpdir(), `akan-code-${Date.now()}.png`);
    await Bun.write(file, png);
    return file;
  }

  /** Whether there is an image to fetch, which is cheap enough to ask on a timer. */
  static has() {
    try {
      return Bun.Image.hasClipboardImage();
    } catch {
      return false;
    }
  }

  static async #read(): Promise<Uint8Array | undefined> {
    // Bun reads the clipboard natively; the shell-outs below cover a clipboard flavour it declines.
    try {
      const image = Bun.Image.fromClipboard();
      if (image) return new Uint8Array(await image.png().toBuffer());
    } catch {
      // unreadable here: the fallbacks get their turn
    }
    if (process.platform === "darwin") return await CodeTuiClipboard.#darwin();
    for (const command of [
      ["wl-paste", "--no-newline", "--type", "image/png"],
      ["xclip", "-selection", "clipboard", "-t", "image/png", "-o"],
    ]) {
      const bytes = await CodeTuiClipboard.#bytes(command);
      if (bytes?.length) return bytes;
    }
    return undefined;
  }

  // `osascript` cannot write bytes, so macOS hands the PNG over as AppleScript's hex literal `«data PNGf…»`.
  static async #darwin() {
    const bytes = await CodeTuiClipboard.#bytes(["osascript", "-e", CodeTuiClipboard.ask]);
    return CodeTuiClipboard.fromAppleScript(bytes ? new TextDecoder().decode(bytes) : undefined);
  }

  static readonly ask = "the clipboard as «class PNGf»";

  /** `«data PNGf…»` → the bytes; anything else → undefined. */
  static fromAppleScript(out: string | undefined) {
    const hex = /«data PNGf([0-9A-Fa-f]*)»/.exec(out ?? "")?.[1];
    if (!hex || hex.length % 2) return undefined;
    return Uint8Array.from((hex.match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16)));
  }

  static async #bytes(command: string[]) {
    try {
      const proc = Bun.spawn(command, { stdout: "pipe", stderr: "ignore" });
      const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
      return (await proc.exited) === 0 ? bytes : undefined;
    } catch {
      return undefined;
    }
  }
}
