import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AkanNativeTarget } from "../akanConfig";
import { tempDirs } from "../testHelpers";
import { NativeWebDir } from "./nativeWebDir";

const makeTempRoot = tempDirs("akan-native-web-");

const target: AkanNativeTarget = {
  name: "admin",
  basePath: "/admin/",
  indexPath: "/home",
  appName: "Portal",
  appId: "com.portal.admin",
  version: "1.0.0",
  buildNum: 1,
};

const write = async (file: string, content: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
};

describe("NativeWebDir", () => {
  test("injects the target global once, first in <head>, even when the inlined bundle names it", () => {
    const bundle = '<script type="module">if(!window.__AKAN_MOBILE_TARGET__)boot("</head>")</script>';
    const html = NativeWebDir.injectTarget(`<html><HEAD lang="en">${bundle}</head><body></body></html>`, target);

    expect(html).toBe(
      `<html><HEAD lang="en">\n<script>window.__AKAN_MOBILE_TARGET__={"name":"admin","basePath":"admin","indexPath":"/home"};</script>${bundle}</head><body></body></html>`,
    );
    expect(NativeWebDir.injectTarget(html, target)).toBe(html);
  });

  test("assembles the page, the pruned public folder and the fonts, from scratch every time", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "dist/csr/admin.html"), "<html><head></head><body>app</body></html>");
    await write(path.join(root, "dist/public/images/logo.png"), "png");
    await write(path.join(root, "dist/public/index.html"), "stale page from public");
    await write(path.join(root, "dist/.akan/artifact/fonts/pretendard/400.woff2"), "font");
    const web = new NativeWebDir(path.join(root, "web"));
    await write(path.join(root, "web/leftover.txt"), "from the last build");

    const files = await web.assemble(target, {
      html: path.join(root, "dist/csr/admin.html"),
      publicDir: path.join(root, "dist/public"),
      fontsDir: path.join(root, "dist/.akan/artifact/fonts"),
    });

    expect(files).toEqual(["_akan/fonts/pretendard/400.woff2", "images/logo.png", "index.html"]);
    expect(await Bun.file(path.join(root, "web/index.html")).text()).toContain("window.__AKAN_MOBILE_TARGET__");
  });

  test("builds without a public folder or fonts", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "index.html"), "<html><head></head></html>");

    const files = await new NativeWebDir(path.join(root, "web")).assemble(target, {
      html: path.join(root, "index.html"),
      publicDir: path.join(root, "missing-public"),
    });

    expect(files).toEqual(["index.html"]);
  });

  test("refuses a missing bundle and a public folder that takes the runtime's reserved path", async () => {
    const root = await makeTempRoot();
    const web = new NativeWebDir(path.join(root, "web"));
    await expect(web.assemble(target, { html: path.join(root, "none.html") })).rejects.toThrow(
      "CSR html for native target 'admin' not found",
    );

    await write(path.join(root, "index.html"), "<html><head></head></html>");
    await write(path.join(root, "public/__akan_native/x.js"), "x");
    await expect(
      web.assemble(target, { html: path.join(root, "index.html"), publicDir: path.join(root, "public") }),
    ).rejects.toThrow("public/__akan_native is reserved for the native runtime");
  });
});
