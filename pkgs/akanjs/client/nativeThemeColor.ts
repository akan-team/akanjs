import { Logger } from "akanjs/common";
import { isNativeApp } from "./nativeHost";

export class NativeThemeColor {
  static #sent: string | null = null;
  static #canvas: CanvasRenderingContext2D | null | undefined;

  static follow(color: string | null) {
    if (!isNativeApp()) return;
    const hex = color === null ? null : NativeThemeColor.hex(color);
    if (hex === NativeThemeColor.#sent) return;
    NativeThemeColor.#sent = hex;
    void import("@akanjs/native/plugins/appearance")
      .then(async ({ appearance }) => {
        if (!appearance.isSupported("setThemeColor") || !appearance.isAllowed("setThemeColor")) return;
        await appearance.setThemeColor({ color: hex });
      })
      .catch((error: unknown) => {
        Logger.warn(`The status bar did not take the theme color ${hex}: ${String(error)}`);
      });
  }

  static hex(color: string): string | null {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (!CSS.supports("color", color)) return null;
    const context = NativeThemeColor.#context();
    if (!context) return null;
    //? A shell parses only hex, and painting one pixel resolves oklch(), color-mix() and names the way the page's CSS does.
    context.clearRect(0, 0, 1, 1);
    //? Canvas ignores a color it cannot parse (light-dark() passes CSS.supports), which would repaint the previous one.
    context.fillStyle = "transparent";
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return NativeThemeColor.pixelHex(context.getImageData(0, 0, 1, 1).data);
  }

  static pixelHex([red = 0, green = 0, blue = 0, alpha = 0]: Iterable<number>): string | null {
    if (!alpha) return null;
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  static #context(): CanvasRenderingContext2D | null {
    if (NativeThemeColor.#canvas === undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      NativeThemeColor.#canvas = canvas.getContext("2d", { willReadFrequently: true });
    }
    return NativeThemeColor.#canvas;
  }
}
