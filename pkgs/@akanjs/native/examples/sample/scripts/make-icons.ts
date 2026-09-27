// Draws the sample's icon.png (full bleed: the platforms round the corners) and splash.png
// (the rounded logo of public/akan-native.svg on transparency). Run: bun scripts/make-icons.ts
import { writeFileSync } from "node:fs";
import { roundedMask } from "../../../packages/cli/src/lib/image.ts";
import { encodePng, type Image } from "../../../packages/cli/src/lib/png.ts";

const FROM = [0x5b, 0x8c, 0xff];
const TO = [0xa4, 0x5b, 0xff];

/** akan-native.svg geometry (64 units): ring r=15 stroke 6, dot r=4, diagonal gradient. */
function logo(size: number): Image {
  const data = new Uint8Array(size * size * 4);
  const unit = size / 64;
  const c = size / 2;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y + 1) / (2 * size);
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const ring = clamp(0.5 - (Math.abs(d - 15 * unit) - 3 * unit));
      const dot = clamp(0.5 - (d - 4 * unit));
      const white = Math.max(ring, dot);
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) {
        const base = FROM[k]! + (TO[k]! - FROM[k]!) * t;
        data[i + k] = Math.round(base + (255 - base) * white);
      }
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

const dir = new URL("..", import.meta.url).pathname;
writeFileSync(`${dir}icon.png`, encodePng(logo(1024)));
writeFileSync(`${dir}splash.png`, encodePng(roundedMask(logo(512), 0, 512 * (14 / 64))));
console.info("wrote icon.png and splash.png");
