type DotTone = "glow" | "dust" | "planet";

interface SkyDot {
  x: number;
  y: number;
  r: number;
  tone: DotTone;
  twinkle: number;
}

export class CosmosSky {
  static readonly width = 1600;
  static readonly height = 1000;
  static readonly dots = CosmosSky.#scatterDots(20, 12, 0.4);

  static #random(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  static #round(value: number) {
    return Math.round(value * 10) / 10;
  }

  static #scatterDots(cols: number, rows: number, density: number) {
    const random = CosmosSky.#random(20261002);
    const cellW = CosmosSky.width / cols;
    const cellH = CosmosSky.height / rows;
    const dots: SkyDot[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (random() > density) continue;
        const size = random();
        const tone = random();
        dots.push({
          x: CosmosSky.#round((col + random()) * cellW),
          y: CosmosSky.#round((row + random()) * cellH),
          r: size < 0.62 ? 0.8 : size < 0.9 ? 1.2 : 1.8,
          tone: tone < 0.74 ? "glow" : tone < 0.88 ? "dust" : "planet",
          twinkle: size > 0.62 && random() < 0.22 ? Math.floor(random() * 5) : -1,
        });
      }
    }
    return dots;
  }
}
