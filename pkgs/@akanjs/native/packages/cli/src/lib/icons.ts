// App icons from one PNG (CLI-8) and splash images (SH-6, plugins.md S2) for every platform.
// Sizes follow tauri-cli icon.rs (icns types, Android densities); the Android adaptive icon and
// splash icon follow the platform guidelines (108dp layers with a 72dp viewport; splash icon
// without a background: 288dp canvas, content within a 192dp circle).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  blank,
  contain,
  cornerColor,
  drawOver,
  flatten,
  isOpaque,
  parseColor,
  type Rgba,
  resize,
  roundedMask,
  toHex,
} from "./image.ts";
import { CliError, log } from "./log.ts";
import { decodePng, encodePng, type Image, PngError } from "./png.ts";
import type { ResolvedConfig } from "./project.ts";

/** Splash image box on iOS (points) and Android (dp): a square that fits the 192dp splash circle. */
export const SPLASH_BOX = 136;

export function readPng(path: string, what: string): Image {
  if (!existsSync(path)) throw new CliError(`${what}: ${path} not found`);
  try {
    return decodePng(new Uint8Array(readFileSync(path)));
  } catch (error) {
    if (error instanceof PngError) throw new CliError(`${what} (${path}): ${error.message}`);
    throw error;
  }
}

export interface IconArt {
  /** 1024×1024 RGBA. */
  master: Image;
  /** Fills transparent areas where a platform needs an opaque icon (iOS, Android adaptive background). */
  background: Rgba;
}

const loaded = new Map<string, IconArt>();

export function iconArt(config: ResolvedConfig): IconArt | null {
  if (!config.icon) return null;
  const key = `${config.icon.image}\0${config.icon.backgroundColor}`;
  const cached = loaded.get(key);
  if (cached) return cached;
  const source = readPng(config.icon.image, "icon");
  if (source.width !== source.height)
    throw new CliError(`icon (${config.icon.image}) must be square, got ${source.width}×${source.height}`);
  if (source.width < 1024)
    log.warn(`icon is ${source.width}×${source.width}; 1024×1024 is recommended (larger platform sizes are upscaled)`);
  const background =
    (config.icon.backgroundColor && parseColor(config.icon.backgroundColor)) ||
    (isOpaque(source) ? cornerColor(source) : ([255, 255, 255, 255] as Rgba));
  const art = { master: resize(source, 1024, 1024), background };
  loaded.set(key, art);
  return art;
}

export function splashArt(config: ResolvedConfig): Image | null {
  return config.splash.image ? readPng(config.splash.image, "splash.image") : null;
}

// ---------------------------------------------------------------- macOS

// PNG-carrying icns types (is32/il32 are legacy RLE and not needed since macOS 10.7).
const ICNS_TYPES: [string, number][] = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];

/**
 * Full-bleed (opaque) sources get the macOS icon grid: an 824px rounded square with a 185px
 * radius centered in 1024px, as in Apple's Big Sur template. Transparent sources are used as is.
 */
export function macosIconImage(art: IconArt): Image {
  if (!isOpaque(art.master)) return art.master;
  return drawOver(blank(1024, 1024), roundedMask(resize(art.master, 824, 824), 0, 185), 100, 100);
}

export function icns(image: Image): Uint8Array {
  const pngs = new Map<number, Uint8Array>();
  const chunks = ICNS_TYPES.map(([type, size]) => {
    let png = pngs.get(size);
    if (!png) {
      png = encodePng(resize(image, size, size));
      pngs.set(size, png);
    }
    const chunk = new Uint8Array(8 + png.length);
    chunk.set(new TextEncoder().encode(type));
    new DataView(chunk.buffer).setUint32(4, chunk.length);
    chunk.set(png, 8);
    return chunk;
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode("icns"));
  new DataView(out.buffer).setUint32(4, total);
  let o = 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ---------------------------------------------------------------- Windows, Linux

/** Windows .ico sizes: the shell picks 16-48 for lists and title bars, 256 for large views. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** An .ico with PNG entries (Windows Vista and later read PNG-compressed icon images). */
export function ico(image: Image): Uint8Array {
  const pngs = ICO_SIZES.map((size) => encodePng(resize(image, size, size)));
  const header = 6 + 16 * pngs.length;
  const out = new Uint8Array(header + pngs.reduce((n, p) => n + p.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type 1 = icon
  view.setUint16(4, pngs.length, true);
  let offset = header;
  pngs.forEach((png, i) => {
    const size = ICO_SIZES[i]!;
    const entry = 6 + 16 * i;
    out[entry] = size === 256 ? 0 : size; // 0 means 256
    out[entry + 1] = size === 256 ? 0 : size;
    view.setUint16(entry + 4, 1, true); // color planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

/**
 * The window icon for Windows and Linux (tao's Icon::from_rgba), read by native/desktop at
 * startup: [u32 width LE][u32 height LE][RGBA pixels]. No image decoder in the shell this way.
 */
export function windowIcon(image: Image, size = 256): Uint8Array {
  const scaled = resize(image, size, size);
  const out = new Uint8Array(8 + scaled.data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, size, true);
  view.setUint32(4, size, true);
  out.set(scaled.data, 8);
  return out;
}

// ---------------------------------------------------------------- iOS asset catalog

const INFO = { author: "akan-native", version: 1 };

function colorEntry(hex: string, dark: boolean) {
  const [r, g, b, a] = parseColor(hex) ?? [0, 0, 0, 255];
  const components = Object.fromEntries(
    (["red", "green", "blue", "alpha"] as const).map((k, i) => [k, ([r, g, b, a][i]! / 255).toFixed(3)]),
  );
  return {
    idiom: "universal",
    ...(dark ? { appearances: [{ appearance: "luminosity", value: "dark" }] } : {}),
    color: { "color-space": "srgb", components },
  };
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

/**
 * Writes Assets.xcassets for actool: AppIcon (one 1024 universal image; actool derives the rest),
 * AkanNativeSplashBackground (light/dark) and AkanNativeSplash (the splash image at 1x/2x/3x) for UILaunchScreen.
 * Returns the asset names the Info.plist may refer to.
 */
export function writeIosAssets(dir: string, config: ResolvedConfig): { appIcon: boolean; splashImage: boolean } {
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "Contents.json"), { info: INFO });

  const art = iconArt(config);
  if (art) {
    const set = join(dir, "AppIcon.appiconset");
    mkdirSync(set, { recursive: true });
    writeFileSync(join(set, "icon-1024.png"), encodePng(flatten(art.master, art.background)));
    writeJson(join(set, "Contents.json"), {
      images: [{ filename: "icon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
      info: INFO,
    });
  }

  const colors = join(dir, "AkanNativeSplashBackground.colorset");
  mkdirSync(colors, { recursive: true });
  writeJson(join(colors, "Contents.json"), {
    colors: [colorEntry(config.splash.backgroundColor, false), colorEntry(config.splash.backgroundColorDark, true)],
    info: INFO,
  });

  const splash = splashArt(config);
  if (splash) {
    const set = join(dir, "AkanNativeSplash.imageset");
    mkdirSync(set, { recursive: true });
    const images = [1, 2, 3].map((scale) => {
      const fit = (SPLASH_BOX * scale) / Math.max(splash.width, splash.height);
      const filename = `splash@${scale}x.png`;
      writeFileSync(
        join(set, filename),
        encodePng(resize(splash, Math.round(splash.width * fit), Math.round(splash.height * fit))),
      );
      return { filename, idiom: "universal", scale: `${scale}x` };
    });
    writeJson(join(set, "Contents.json"), { images, info: INFO });
  }
  return { appIcon: !!art, splashImage: !!splash };
}

// ---------------------------------------------------------------- Android resources

function colorsXml(colors: Record<string, string>): string {
  const lines = Object.entries(colors).map(([name, hex]) => `    <color name="${name}">${hex}</color>`);
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${lines.join("\n")}\n</resources>\n`;
}

/**
 * Writes res/ for aapt2 compile: the theme (window and splash background, splash icon), the
 * adaptive launcher icon and colors with a night variant. Only xxxhdpi bitmaps: the system
 * scales them down for lower densities.
 */
export function writeAndroidRes(dir: string, config: ResolvedConfig): { icon: boolean } {
  const { shell, splash } = config;
  const art = iconArt(config);
  const splashImage = splashArt(config);
  for (const sub of ["values", "values-night"]) mkdirSync(join(dir, sub), { recursive: true });

  writeFileSync(
    join(dir, "values", "colors.xml"),
    colorsXml({ akan_native_background: shell.backgroundColor, akan_native_splash_background: splash.backgroundColor }),
  );
  writeFileSync(
    join(dir, "values-night", "colors.xml"),
    colorsXml({
      akan_native_background: shell.backgroundColorDark,
      akan_native_splash_background: splash.backgroundColorDark,
    }),
  );
  // Framework theme only (no AppCompat). Transparent bars from the first frame: the activity draws
  // edge to edge itself (AkanNativeActivity.edgeToEdge). API 31+ has the system splash screen
  // (windowSplashScreen*); API 29 and 30 show the theme's window background until the page is drawn,
  // so there it is the splash itself: the splash color with the image in the middle.
  const theme = (items: string[]) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AkanNativeTheme" parent="@android:style/Theme.DeviceDefault.DayNight">
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowActionBar">false</item>
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:enforceStatusBarContrast">false</item>
${items.map((item) => `        ${item}\n`).join("")}    </style>
</resources>
`;
  writeFileSync(
    join(dir, "values", "themes.xml"),
    theme([
      '<item name="android:windowBackground">@drawable/akan_native_launch</item>',
      '<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
    ]),
  );
  mkdirSync(join(dir, "values-v31"), { recursive: true });
  writeFileSync(
    join(dir, "values-v31", "themes.xml"),
    theme([
      '<item name="android:windowBackground">@color/akan_native_background</item>',
      '<item name="android:windowLayoutInDisplayCutoutMode">always</item>',
      '<item name="android:windowSplashScreenBackground">@color/akan_native_splash_background</item>',
      ...(splashImage
        ? ['<item name="android:windowSplashScreenAnimatedIcon">@drawable/akan_native_splash</item>']
        : []),
    ]),
  );
  mkdirSync(join(dir, "drawable"), { recursive: true });
  writeFileSync(
    join(dir, "drawable", "akan_native_launch.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/akan_native_splash_background" />
${splashImage ? `    <item android:gravity="center"><bitmap android:gravity="center" android:src="@drawable/akan_native_splash" /></item>\n` : ""}</layer-list>
`,
  );

  if (splashImage) {
    // 288dp canvas at xxxhdpi (4 px/dp) with the image in the middle SPLASH_BOX dp.
    mkdirSync(join(dir, "drawable-xxxhdpi"), { recursive: true });
    writeFileSync(
      join(dir, "drawable-xxxhdpi", "akan_native_splash.png"),
      encodePng(contain(splashImage, 288 * 4, SPLASH_BOX * 4)),
    );
  }

  if (art) {
    mkdirSync(join(dir, "mipmap-xxxhdpi"), { recursive: true });
    mkdirSync(join(dir, "mipmap-anydpi"), { recursive: true });
    // 108dp foreground layer (432px at xxxhdpi); the launcher mask shows the middle 72dp, so the
    // whole source goes there and the corners of a square source fall outside a round mask.
    writeFileSync(join(dir, "mipmap-xxxhdpi", "ic_launcher_foreground.png"), encodePng(contain(art.master, 432, 288)));
    writeFileSync(
      join(dir, "values", "icon_colors.xml"),
      colorsXml({ akan_native_icon_background: toHex(art.background) }),
    );
    writeFileSync(
      join(dir, "mipmap-anydpi", "ic_launcher.xml"),
      `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/akan_native_icon_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
    );
  }
  return { icon: !!art };
}
