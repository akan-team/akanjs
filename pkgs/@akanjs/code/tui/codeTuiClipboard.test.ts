import { describe, expect, test } from "bun:test";
import { CodeTuiClipboard } from "./CodeTuiClipboard";

describe("CodeTuiClipboard", () => {
  test("reads the PNG out of AppleScript's hex literal", () => {
    const bytes = CodeTuiClipboard.fromAppleScript("«data PNGf89504E470D0A1A0A»");
    expect(bytes && [...bytes]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  test("text on the clipboard answers with nothing rather than half an image", () => {
    expect(CodeTuiClipboard.fromAppleScript('"just some text"')).toBeUndefined();
    expect(CodeTuiClipboard.fromAppleScript(undefined)).toBeUndefined();
    // An odd digit count is a truncated read; half a byte written to a file is a corrupt PNG.
    expect(CodeTuiClipboard.fromAppleScript("«data PNGf89504E470D0A1A0»")).toBeUndefined();
  });
});
