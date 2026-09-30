import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { icns, macosIconImage, writeAndroidRes, writeIosAssets } from "../src/lib/icons.ts";
import { contain, flatten, parseColor, resize, roundedMask } from "../src/lib/image.ts";
import { decodePng, encodePng, type Image, PngError } from "../src/lib/png.ts";
import { loadProject, type ResolvedConfig } from "../src/lib/project.ts";

// ------------------------------------------------------------ hand-made PNGs

function chunk(name: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(type, 4);
  out.set(data, 8);
  const both = new Uint8Array(4 + data.length);
  both.set(type);
  both.set(data, 4);
  view.setUint32(8 + data.length, Bun.hash.crc32(both) >>> 0);
  return out;
}

/** A PNG from packed, unfiltered rows; row y uses filters[y % filters.length]. */
function makePng(opts: {
  width: number;
  height: number;
  colorType: number;
  depth: number;
  rows: number[][];
  filters?: number[];
  plte?: number[];
  trns?: number[];
  interlace?: boolean;
}): Uint8Array {
  const { width, height, colorType, depth, rows } = opts;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]!;
  const bpp = Math.max(1, (channels * depth) >> 3);
  const filters = opts.filters ?? [0];
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const f = filters[y % filters.length]!;
    raw.push(f);
    const up = y > 0 ? rows[y - 1]! : row.map(() => 0);
    row.forEach((v, x) => {
      const a = x >= bpp ? row[x - bpp]! : 0;
      const b = up[x]!;
      const c = x >= bpp ? up[x - bpp]! : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const predicted = [0, a, b, (a + b) >> 1, paeth][f]!;
      raw.push((v - predicted) & 0xff);
    });
  });
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([depth, colorType, 0, 0, opts.interlace ? 1 : 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...(opts.plte ? [chunk("PLTE", new Uint8Array(opts.plte))] : []),
    ...(opts.trns ? [chunk("tRNS", new Uint8Array(opts.trns))] : []),
    chunk("IDAT", new Uint8Array(deflateSync(new Uint8Array(raw)))),
    chunk("IEND", new Uint8Array(0)),
  ];
  return Buffer.concat(parts);
}

const pixels = (image: Image) =>
  Array.from({ length: image.width * image.height }, (_, i) => [...image.data.subarray(i * 4, i * 4 + 4)]);

describe("PNG decoder", () => {
  test("RGBA 8 with every filter type", () => {
    // 3×5, each row a different filter, values that exercise wrap-around.
    const rows = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => (x * 37 + y * 91 + 200) & 0xff),
    );
    const image = decodePng(makePng({ width: 3, height: 5, colorType: 6, depth: 8, rows, filters: [0, 1, 2, 3, 4] }));
    expect(image.width).toBe(3);
    expect([...image.data]).toEqual(rows.flat());
  });

  test("gray 1/8/16 bit, gray+alpha, RGB 16, tRNS color keys", () => {
    // 1-bit gray: 10 px packed into 2 bytes per row.
    const bits = decodePng(makePng({ width: 10, height: 1, colorType: 0, depth: 1, rows: [[0b10110000, 0b01000000]] }));
    expect(pixels(bits).map((p) => p[0])).toEqual([255, 0, 255, 255, 0, 0, 0, 0, 0, 255]);
    const gray8 = decodePng(makePng({ width: 2, height: 1, colorType: 0, depth: 8, rows: [[7, 200]], trns: [0, 200] }));
    expect(pixels(gray8)).toEqual([
      [7, 7, 7, 255],
      [200, 200, 200, 0],
    ]);
    const gray16 = decodePng(
      makePng({ width: 1, height: 1, colorType: 0, depth: 16, rows: [[0xab, 0xcd]], filters: [1] }),
    );
    expect(pixels(gray16)).toEqual([[0xab, 0xab, 0xab, 255]]);
    const ga = decodePng(
      makePng({
        width: 2,
        height: 2,
        colorType: 4,
        depth: 8,
        rows: [
          [10, 20, 30, 40],
          [50, 60, 70, 80],
        ],
        filters: [4, 3],
      }),
    );
    expect(pixels(ga)).toEqual([
      [10, 10, 10, 20],
      [30, 30, 30, 40],
      [50, 50, 50, 60],
      [70, 70, 70, 80],
    ]);
    const rgb16 = decodePng(
      makePng({ width: 1, height: 1, colorType: 2, depth: 16, rows: [[1, 2, 3, 4, 5, 6]], trns: [1, 2, 3, 4, 5, 6] }),
    );
    expect(pixels(rgb16)).toEqual([[1, 3, 5, 0]]);
    const rgb8 = decodePng(
      makePng({ width: 2, height: 1, colorType: 2, depth: 8, rows: [[1, 2, 3, 4, 5, 6]], filters: [2] }),
    );
    expect(pixels(rgb8)).toEqual([
      [1, 2, 3, 255],
      [4, 5, 6, 255],
    ]);
  });

  test("palette 8 and 2 bit with tRNS", () => {
    const plte = [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9];
    const p8 = decodePng(
      makePng({ width: 3, height: 1, colorType: 3, depth: 8, rows: [[2, 0, 1]], plte, trns: [128] }),
    );
    expect(pixels(p8)).toEqual([
      [0, 0, 255, 255],
      [255, 0, 0, 128],
      [0, 255, 0, 255],
    ]);
    const p2 = decodePng(makePng({ width: 4, height: 1, colorType: 3, depth: 2, rows: [[0b11100100]], plte }));
    expect(pixels(p2).map((p) => p.slice(0, 3))).toEqual([
      [9, 9, 9],
      [0, 0, 255],
      [0, 255, 0],
      [255, 0, 0],
    ]);
  });

  test("rejects interlaced, corrupt and non-PNG input with a clear error", () => {
    const interlaced = makePng({ width: 1, height: 1, colorType: 0, depth: 8, rows: [[1]], interlace: true });
    expect(() => decodePng(interlaced)).toThrow(/interlaced/);
    const good = makePng({ width: 1, height: 1, colorType: 0, depth: 8, rows: [[1]] });
    const corrupt = good.slice();
    corrupt[20] = corrupt[20]! ^ 1; // inside IHDR
    expect(() => decodePng(corrupt)).toThrow(/bad CRC/);
    expect(() => decodePng(new TextEncoder().encode("GIF89a"))).toThrow(PngError);
    expect(() => decodePng(makePng({ width: 1, height: 1, colorType: 3, depth: 8, rows: [[0]] }))).toThrow(/PLTE/);
  });
});

describe("PNG encoder", () => {
  test("round trips RGBA and writes RGB when opaque", () => {
    const data = new Uint8Array(17 * 9 * 4).map((_, i) => (i * 53) & 0xff);
    const image = { width: 17, height: 9, data };
    expect([...decodePng(encodePng(image)).data]).toEqual([...data]);
    const opaque = { width: 5, height: 5, data: new Uint8Array(100).map((_, i) => (i % 4 === 3 ? 255 : i * 7)) };
    const bytes = encodePng(opaque);
    expect(bytes[25]).toBe(2); // IHDR color type RGB
    expect([...decodePng(bytes).data]).toEqual([...opaque.data]);
  });
});

describe("image operations", () => {
  test("area-average downscale", () => {
    // 4×4 black/white checker → 2×2 mid gray; 3 → 2 averages partial pixels.
    const checker = {
      width: 4,
      height: 4,
      data: new Uint8Array(64).map((_, i) => (i % 4 === 3 ? 255 : (((i >> 2) % 4) + ((i >> 4) % 2)) % 2 ? 255 : 0)),
    };
    for (const p of pixels(resize(checker, 2, 2))) expect(p).toEqual([128, 128, 128, 255]);
    const line = { width: 3, height: 1, data: new Uint8Array([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]) };
    expect(pixels(resize(line, 2, 1)).map((p) => p[0])).toEqual([30, 150]);
  });

  test("premultiplied alpha: transparent pixels do not bleed their color", () => {
    const image = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0]) };
    expect(pixels(resize(image, 1, 1))).toEqual([[255, 0, 0, 128]]);
  });

  test("upscale keeps the corners, contain centers, flatten and mask", () => {
    const two = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 255, 200, 200, 200, 255]) };
    const up = pixels(resize(two, 4, 1)).map((p) => p[0]);
    expect(up[0]).toBe(0);
    expect(up[3]).toBe(200);
    const boxed = contain({ width: 2, height: 1, data: new Uint8Array(8).fill(255) }, 8, 4);
    expect(pixels(boxed).map((p) => p[3])).toEqual([
      ...Array(24).fill(0),
      0,
      0,
      255,
      255,
      255,
      255,
      0,
      0,
      0,
      0,
      255,
      255,
      255,
      255,
      0,
      0,
      ...Array(24).fill(0),
    ]);
    expect(pixels(flatten({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 0]) }, [1, 2, 3, 255]))).toEqual([
      [1, 2, 3, 255],
    ]);
    const masked = roundedMask({ width: 10, height: 10, data: new Uint8Array(400).fill(255) }, 0, 5);
    expect(masked.data[3]).toBe(0); // corner
    expect(masked.data[(5 * 10 + 5) * 4 + 3]).toBe(255); // center
    expect(parseColor("#0a0B0c")).toEqual([10, 11, 12, 255]);
    expect(parseColor("red")).toBeNull();
  });
});

// ------------------------------------------------------------ platform outputs

const opaqueIcon = () => {
  const data = new Uint8Array(1024 * 1024 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([0x5b, 0x8c, 0xff, 255], i);
  return { width: 1024, height: 1024, data };
};

function config(dir: string, extra: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const icon = join(dir, "icon.png");
  const splash = join(dir, "splash.png");
  writeFileSync(icon, encodePng(opaqueIcon()));
  writeFileSync(splash, encodePng({ width: 20, height: 10, data: new Uint8Array(800).fill(200) }));
  return {
    app: { id: "com.akanjs.test", name: "Test", fileName: "test", version: "1.0.0", build: 1 },
    web: { dir: "dist", base: "/" },
    plugins: [],
    env: { defaults: {}, platforms: {} },
    shell: { backgroundColor: "#ffffff", backgroundColorDark: "#000000" },
    usageDescriptions: {},
    permissions: {},
    deepLinks: { schemes: [], domains: [] },
    desktop: {
      quitOnLastWindowClosed: true,
      recovery: "errorPage",
      window: { fullscreen: false, skipTaskbar: false },
      screenCapture: "picker",
    },
    updates: null,
    icon: { image: icon },
    splash: {
      backgroundColor: "#112233",
      backgroundColorDark: "#445566",
      image: splash,
      autoHide: true,
      timeout: 10_000,
    },
    ...extra,
  };
}

describe("icon outputs", () => {
  test("icns: header, PNG entries at the right sizes; macOS grid for full-bleed icons", () => {
    const art = { master: opaqueIcon(), background: [0x5b, 0x8c, 0xff, 255] as [number, number, number, number] };
    const macos = macosIconImage(art);
    expect(macos.data[3]).toBe(0); // transparent margin around the rounded square
    expect(macos.data[(512 * 1024 + 512) * 4 + 3]).toBe(255);
    const bytes = icns(macos);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("icns");
    expect(view.getUint32(4)).toBe(bytes.length);
    const sizes: Record<string, number> = {};
    for (let p = 8; p < bytes.length; ) {
      const type = new TextDecoder().decode(bytes.subarray(p, p + 4));
      const length = view.getUint32(p + 4);
      sizes[type] = decodePng(bytes.subarray(p + 8, p + length)).width;
      p += length;
    }
    expect(sizes).toEqual({
      icp4: 16,
      icp5: 32,
      icp6: 64,
      ic07: 128,
      ic08: 256,
      ic09: 512,
      ic10: 1024,
      ic11: 32,
      ic12: 64,
      ic13: 256,
      ic14: 512,
    });
  });

  test("iOS asset catalog: one 1024 opaque app icon, splash colors and images", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-icons-"));
    const out = join(dir, "Assets.xcassets");
    expect(writeIosAssets(out, config(dir))).toEqual({ appIcon: true, splashImage: true });
    const icon = JSON.parse(readFileSync(join(out, "AppIcon.appiconset", "Contents.json"), "utf8"));
    expect(icon.images).toEqual([
      { filename: "icon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" },
    ]);
    const colors = JSON.parse(
      readFileSync(join(out, "AkanNativeSplashBackground.colorset", "Contents.json"), "utf8"),
    ).colors;
    expect(colors[0].color.components).toEqual({ red: "0.067", green: "0.133", blue: "0.200", alpha: "1.000" });
    expect(colors[1].appearances).toEqual([{ appearance: "luminosity", value: "dark" }]);
    // 20×10 splash fitted into 136 pt: 136×68 at 1x, 408×204 at 3x
    expect(decodePng(new Uint8Array(readFileSync(join(out, "AkanNativeSplash.imageset", "splash@3x.png")))).width).toBe(
      408,
    );
    expect(
      decodePng(new Uint8Array(readFileSync(join(out, "AkanNativeSplash.imageset", "splash@1x.png")))).height,
    ).toBe(68);
    const noIcon = join(dir, "NoIcon.xcassets");
    expect(
      writeIosAssets(noIcon, config(dir, { icon: null, splash: { ...config(dir).splash, image: undefined } })),
    ).toEqual({ appIcon: false, splashImage: false });
    expect(existsSync(join(noIcon, "AppIcon.appiconset"))).toBe(false);
  });

  test("Android res: theme with splash colors, night variants, adaptive icon", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-icons-"));
    const res = join(dir, "res");
    expect(writeAndroidRes(res, config(dir))).toEqual({ icon: true });
    // API 31+: the system splash screen; 29 and 30: the window background is the splash (layer-list).
    const theme = readFileSync(join(res, "values-v31", "themes.xml"), "utf8");
    expect(theme).toContain('parent="@android:style/Theme.DeviceDefault.DayNight"');
    expect(theme).toContain(
      '<item name="android:windowSplashScreenBackground">@color/akan_native_splash_background</item>',
    );
    expect(theme).toContain("@drawable/akan_native_splash");
    const legacy = readFileSync(join(res, "values", "themes.xml"), "utf8");
    expect(legacy).toContain('<item name="android:windowBackground">@drawable/akan_native_launch</item>');
    expect(legacy).not.toContain("windowSplashScreen");
    expect(readFileSync(join(res, "drawable", "akan_native_launch.xml"), "utf8")).toContain(
      'android:src="@drawable/akan_native_splash"',
    );
    expect(readFileSync(join(res, "values-night", "colors.xml"), "utf8")).toContain(
      '<color name="akan_native_splash_background">#445566</color>',
    );
    expect(readFileSync(join(res, "values", "icon_colors.xml"), "utf8")).toContain("#5b8cff"); // corner color of an opaque icon
    expect(readFileSync(join(res, "mipmap-anydpi", "ic_launcher.xml"), "utf8")).toContain(
      "@mipmap/ic_launcher_foreground",
    );
    const fg = decodePng(new Uint8Array(readFileSync(join(res, "mipmap-xxxhdpi", "ic_launcher_foreground.png"))));
    expect([fg.width, fg.data[3], fg.data[(216 * 432 + 216) * 4 + 3]]).toEqual([432, 0, 255]); // 72dp of 108dp
    const splash = decodePng(new Uint8Array(readFileSync(join(res, "drawable-xxxhdpi", "akan_native_splash.png"))));
    expect(splash.width).toBe(1152);

    const bare = join(dir, "bare");
    expect(
      writeAndroidRes(bare, config(dir, { icon: null, splash: { ...config(dir).splash, image: undefined } })),
    ).toEqual({ icon: false });
    expect(readFileSync(join(bare, "values-v31", "themes.xml"), "utf8")).not.toContain(
      "windowSplashScreenAnimatedIcon",
    );
    expect(readFileSync(join(bare, "drawable", "akan_native_launch.xml"), "utf8")).not.toContain('akan_native_splash"');
    expect(existsSync(join(bare, "mipmap-anydpi"))).toBe(false);
  });
});

describe("icon and splash config", () => {
  async function load(body: string) {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-config-"));
    writeFileSync(join(dir, "icon.png"), encodePng({ width: 1, height: 1, data: new Uint8Array(4).fill(255) }));
    writeFileSync(
      join(dir, "akan-native.config.ts"),
      `export default { app: { id: "com.akanjs.t", name: "T", version: "1.0.0" }, web: { dir: "dist" }, ${body} };`,
    );
    return loadProject(dir);
  }

  test("defaults follow the shell colors", async () => {
    const { config, appDir } = await load(
      `shell: { backgroundColor: "#101010", backgroundColorDark: "#202020" }, icon: "./icon.png"`,
    );
    expect(config.icon).toEqual({ image: join(appDir, "icon.png") });
    expect(config.splash).toEqual({
      backgroundColor: "#101010",
      backgroundColorDark: "#202020",
      image: undefined,
      autoHide: true,
      timeout: 10_000,
    });
    const one = await load(`splash: { backgroundColor: "#abcdef", autoHide: false, timeout: 500 }`);
    expect(one.config.icon).toBeNull();
    expect(one.config.splash).toMatchObject({
      backgroundColor: "#abcdef",
      backgroundColorDark: "#abcdef",
      autoHide: false,
      timeout: 500,
    });
  });

  test("clear errors for bad values", async () => {
    const message = (body: string) =>
      load(body).then(
        () => "",
        (e: Error) => e.message,
      );
    expect(await message(`icon: "./missing.png"`)).toContain("missing.png not found");
    expect(await message(`icon: "./icon.jpg"`)).toContain("icon must be a path to a .png file");
    expect(await message(`icon: { image: "./icon.png", backgroundColor: "blue" }`)).toContain(
      "icon.backgroundColor must be a color",
    );
    expect(await message(`splash: { backgroundColor: { light: "#ffffff" } }`)).toContain(
      "splash.backgroundColor.dark must be a color",
    );
    expect(await message(`splash: { timeout: 0 }`)).toContain("splash.timeout must be");
    expect(await message(`splash: { autoHide: "yes" }`)).toContain("splash.autoHide must be true or false");
  });
});
