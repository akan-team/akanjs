import { describe, expect, test } from "bun:test";
import type { ReactFont } from "akanjs/client";
import { FontCss } from "./fontCss";

const pretendard = (paths: ReactFont["paths"], extra: Partial<ReactFont> = {}): ReactFont => ({
  name: "pretendard",
  paths,
  ...extra,
});

describe("FontCss.getPreloads", () => {
  test("preloads every optimized weight by default", () => {
    const preloads = FontCss.getPreloads([
      pretendard([
        { src: "/fonts/Regular.woff2", weight: 400 },
        { src: "/fonts/Bold.woff2", weight: 700 },
      ]),
    ]);
    expect(preloads.map((preload) => preload.href)).toEqual([
      expect.stringContaining("/_akan/fonts/pretendard-400-normal-"),
      expect.stringContaining("/_akan/fonts/pretendard-700-normal-"),
    ]);
  });

  test("skips a path marked preload: false and keeps the rest", () => {
    const preloads = FontCss.getPreloads([
      pretendard([
        { src: "/fonts/Light.woff2", weight: 300, preload: false },
        { src: "/fonts/Regular.woff2", weight: 400 },
      ]),
    ]);
    expect(preloads).toHaveLength(1);
    expect(preloads[0]?.href).toContain("pretendard-400-normal-");
  });

  test("a font-level preload: false or optimize: false preloads nothing", () => {
    const paths = [{ src: "/fonts/Regular.woff2", weight: 400 }];
    expect(FontCss.getPreloads([pretendard(paths, { preload: false })])).toEqual([]);
    expect(FontCss.getPreloads([pretendard(paths, { optimize: false })])).toEqual([]);
  });
});
