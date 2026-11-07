import { describe, expect, test } from "bun:test";
import { PreviewView } from "./PreviewView";

const serve = (html: string, status = 200) =>
  Bun.serve({ port: 0, fetch: () => new Response(html, { status, headers: { "content-type": "text/html" } }) });

describe("PreviewView", () => {
  test("reports whether this Bun build can drive a headless page at all", () => {
    expect(typeof PreviewView.available).toBe("boolean");
  });

  test("formats a console call the way the console prints it", () => {
    expect(PreviewView.formatConsole(["%cstyled%c %s of %d", "color:red", "", "two", 3, "extra"])).toBe(
      "styled two of 3 extra",
    );
    expect(PreviewView.formatConsole(["a\n\n\n  \nb"])).toBe("a\nb");
    expect(PreviewView.formatConsole(["x".repeat(2_000)])).toHaveLength(1_500);
  });

  test.skipIf(!PreviewView.available)(
    "finds an empty body and a console error on a real page",
    async () => {
      const server = serve('<!doctype html><html><body></body><script>console.error("boom")</script></html>');
      try {
        const probe = await PreviewView.probe(`http://localhost:${server.port}/`);
        expect(probe.pageErrors.join(" ")).toContain("rendered empty");
        expect(probe.consoleErrors.join(" ")).toContain("boom");
      } finally {
        server.stop(true);
      }
    },
    30_000,
  );

  test.skipIf(!PreviewView.available)(
    "reads the status, the live title, a failed dev build and a page wider than the viewport",
    async () => {
      const server = serve(
        [
          "<!doctype html><html><head><title>Before</title></head><body>",
          '<div style="width:900px">wide</div>',
          '<div class="__akan_hmr_overlay" data-status="error">Build failed: page.tsx</div>',
          '<script>document.title = "After";</script>',
          "</body></html>",
        ].join(""),
        404,
      );
      try {
        const probe = await PreviewView.probe(`http://localhost:${server.port}/missing`, { width: 390, height: 844 });
        expect(probe.status).toBe(404);
        expect(probe.title).toBe("After");
        expect(probe.text).toBe("wide Build failed: page.tsx");
        expect(probe.pageErrors).toEqual(["The dev build failed: Build failed: page.tsx"]);
        expect(probe.domFindings.join(" ")).toContain("first wider element: div");
      } finally {
        server.stop(true);
      }
    },
    30_000,
  );

  test.skipIf(!PreviewView.available)(
    "gives up on a server that takes the connection and never answers",
    async () => {
      const server = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => undefined) });
      try {
        await expect(PreviewView.probe(`http://localhost:${server.port}/`, { timeoutMs: 1_500 })).rejects.toThrow(
          "Timed out loading",
        );
      } finally {
        server.stop(true);
      }
    },
    30_000,
  );
});
