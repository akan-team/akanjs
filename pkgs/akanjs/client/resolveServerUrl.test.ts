import { afterEach, describe, expect, test } from "bun:test";
import { resetEnvCache } from "akanjs/base";
import { resolveServerUrl } from "./resolveServerUrl";

const preservedEnv = { ...process.env };
const holder = globalThis as unknown as {
  window?: { location: URL };
  __AKAN_NATIVE__?: { platform: string; env?: Record<string, string> };
  __AKAN_NATIVE_DEV__?: { gateway: string };
};

const onPage = (href: string, env: Record<string, string>) => {
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "minimal",
    AKAN_PUBLIC_REPO_NAME: "akan",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
    AKAN_PUBLIC_RENDER_ENV: "csr",
    ...env,
  });
  holder.window = { location: new URL(href) };
  resetEnvCache();
};

afterEach(() => {
  process.env = { ...preservedEnv };
  delete holder.window;
  delete holder.__AKAN_NATIVE__;
  delete holder.__AKAN_NATIVE_DEV__;
  resetEnvCache();
});

describe("resolveServerUrl", () => {
  test("a desktop page reaches the file on the server it carries, not on its own app:// origin", () => {
    holder.__AKAN_NATIVE__ = { platform: "macos", env: { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:52345" } };
    onPage("app://localhost/en", { AKAN_PUBLIC_ENV: "main" });

    expect(resolveServerUrl("/api/localFile/getBlob/a.png")).toBe("http://127.0.0.1:52345/api/localFile/getBlob/a.png");
  });

  test("leaves bundled assets, absolute and protocol-relative URLs alone", () => {
    holder.__AKAN_NATIVE__ = { platform: "macos", env: { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:52345" } };
    onPage("app://localhost/en", { AKAN_PUBLIC_ENV: "main" });

    for (const url of [
      "/images/logo.png",
      "/apis/x",
      "https://cdn.example.com/a.png",
      "//cdn.example.com/a.png",
      "data:,x",
    ])
      expect(resolveServerUrl(url)).toBe(url);
  });

  test("a page on the server's own origin keeps the relative URL", () => {
    onPage("http://localhost:8282/en?csr=true", { AKAN_PUBLIC_ENV: "local" });
    expect(resolveServerUrl("/api/localFile/getBlob/a.png")).toBe("/api/localFile/getBlob/a.png");

    holder.__AKAN_NATIVE__ = { platform: "ios" };
    holder.__AKAN_NATIVE_DEV__ = { gateway: "http://localhost:52011" };
    onPage("app://localhost/en?csr=true", { AKAN_PUBLIC_ENV: "local" });
    expect(resolveServerUrl("/api/localFile/getBlob/a.png")).toBe("/api/localFile/getBlob/a.png");
  });

  test("an SSR render and the server keep the relative URL", () => {
    onPage("https://minimal.example.com/en", { AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_RENDER_ENV: "ssr" });
    expect(resolveServerUrl("/api/localFile/getBlob/a.png")).toBe("/api/localFile/getBlob/a.png");

    delete holder.window;
    resetEnvCache();
    expect(resolveServerUrl("/api/localFile/getBlob/a.png")).toBe("/api/localFile/getBlob/a.png");
  });
});
