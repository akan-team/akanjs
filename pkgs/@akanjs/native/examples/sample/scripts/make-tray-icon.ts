// Draws public/tray.png: an "o" ring, black on transparent, for a template menu bar icon
// (macOS tints it for light and dark menu bars). 36×36 px = 18 pt at 2x.
import { encodePng } from "../../../packages/cli/src/lib/png.ts";

const size = 36;
const data = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
    // Anti-aliased ring between radius 8 and 14.
    const alpha = Math.max(0, Math.min(1, Math.min(d - 8, 14 - d) + 0.5));
    if (alpha > 0) data.set([0, 0, 0, Math.round(alpha * 255)], (y * size + x) * 4);
  }
}
await Bun.write(new URL("../public/tray.png", import.meta.url), encodePng({ width: size, height: size, data }));
console.info("public/tray.png");
