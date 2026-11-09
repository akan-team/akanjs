import { describe, expect, test } from "bun:test";
import type { ReactFont } from "akanjs/client";
import { FontCss } from "./fontCss";

const pretendard = (paths: ReactFont["paths"], extra: Partial<ReactFont> = {}): ReactFont => ({
  name: "pretendard",
  paths,
  ...extra,
});

const preloadedFaces = (fonts: ReactFont[]) =>
  FontCss.getPreloads(fonts).map((preload) => preload.href.replace(/^\/_akan\/fonts\/(.+)-[a-z0-9]+\.woff2$/, "$1"));

const nineWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => ({
  src: `/fonts/Pretendard-${weight}.woff2`,
  weight,
}));

describe("FontCss.getPreloads", () => {
  test("preloads only the regular face of a family that declares several weights", () => {
    const preloads = FontCss.getPreloads([pretendard(nineWeights)]);
    expect(preloads).toEqual([
      { href: expect.stringMatching(/^\/_akan\/fonts\/pretendard-400-normal-[a-z0-9]+\.woff2$/), type: "font/woff2" },
    ]);
  });

  test("preload: true adds a face to the regular one", () => {
    const paths = nineWeights.map((path) => (path.weight === 700 ? { ...path, preload: true } : path));
    expect(preloadedFaces([pretendard(paths)])).toEqual(["pretendard-400-normal", "pretendard-700-normal"]);
  });

  test("preload: false never preloads, and no other weight stands in for a regular face set to false", () => {
    const paths = nineWeights.map((path) =>
      path.weight === 400 || path.weight === 700 ? { ...path, preload: false } : path,
    );
    expect(preloadedFaces([pretendard(paths)])).toEqual([]);
    expect(
      preloadedFaces([
        pretendard([
          { src: "/fonts/Regular.woff2", weight: 400, preload: false },
          { src: "/fonts/Bold.woff2", weight: 700, preload: true },
        ]),
      ]),
    ).toEqual(["pretendard-700-normal"]);
  });

  test("a single-weight family preloads that weight, whatever it is", () => {
    const lemonmilk: ReactFont = { name: "lemonmilk", paths: [{ src: "/fonts/LemonMilk-Bold.woff2", weight: 700 }] };
    expect(preloadedFaces([pretendard(nineWeights), lemonmilk])).toEqual([
      "pretendard-400-normal",
      "lemonmilk-700-normal",
    ]);
  });

  test("without a 400 face, picks the face a browser draws regular text with", () => {
    const pick = (weights: (number | string)[]) =>
      preloadedFaces([pretendard(weights.map((weight) => ({ src: `/fonts/${weight}.woff2`, weight })))]);
    expect(pick([300, 500])).toEqual(["pretendard-500-normal"]);
    expect(pick([300, 600])).toEqual(["pretendard-300-normal"]);
    expect(pick([100, 300])).toEqual(["pretendard-300-normal"]);
    expect(pick([600, 800])).toEqual(["pretendard-600-normal"]);
    expect(pick([700, "100 900"])).toEqual(["pretendard-100-900-normal"]);
    expect(pick(["bold", "normal"])).toEqual(["pretendard-normal-normal"]);
  });

  test("prefers a normal face over an italic one", () => {
    const font = pretendard(
      [
        { src: "/fonts/Italic.woff2", weight: 400, style: "italic" },
        { src: "/fonts/Bold.woff2", weight: 700 },
      ],
      { styles: ["normal", "italic"] },
    );
    expect(preloadedFaces([font])).toEqual(["pretendard-700-normal"]);
  });

  test("a font-level preload: false or optimize: false preloads nothing", () => {
    const paths = [{ src: "/fonts/Regular.woff2", weight: 400 }];
    expect(FontCss.getPreloads([pretendard(paths, { preload: false })])).toEqual([]);
    expect(FontCss.getPreloads([pretendard(paths, { optimize: false })])).toEqual([]);
  });
});
