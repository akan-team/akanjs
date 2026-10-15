import { describe, expect, it } from "bun:test";

import { RichUrl } from "./richUrl";

describe("RichUrl.link", () => {
  it("keeps web, mail and phone links and paths on this site", () => {
    for (const url of ["https://a.com/x", "http://a.com", "mailto:a@b.co", "tel:+82101234", "/doc/1", "#top", "?q=1"])
      expect(RichUrl.link(url)).toBe(url);
  });

  it("refuses script, data and file schemes however the browser would still read them", () => {
    for (const url of [
      "javascript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "vbscript:x",
      "data:text/html,<script>x</script>",
      "file:///etc/passwd",
      "blob:https://a.com/1",
    ])
      expect(RichUrl.link(url)).toBeNull();
  });

  it("refuses what is not a url at all", () => {
    expect(RichUrl.link("")).toBeNull();
    expect(RichUrl.link("   ")).toBeNull();
    expect(RichUrl.link(42)).toBeNull();
    expect(RichUrl.link(null)).toBeNull();
  });
});

describe("RichUrl.typedLink", () => {
  it("takes an absolute web, mail or phone link, the same in the toolbar and on paste", () => {
    expect(RichUrl.typedLink("https://a.com")).toBe("https://a.com/");
    expect(RichUrl.typedLink("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(RichUrl.typedLink("tel:+82101234")).toBe("tel:+82101234");
  });

  it("is no link for a bare word, a path, or an unsafe scheme", () => {
    for (const url of ["hello", "www.a.com", "/doc/1", "#top", "javascript:alert(1)", "data:text/html,x"])
      expect(RichUrl.typedLink(url)).toBeNull();
  });
});

describe("RichUrl.media", () => {
  it("keeps https, a path on this site, and http — local blob storage serves http://localhost", () => {
    expect(RichUrl.media("https://cdn.a.com/i.png")).toBe("https://cdn.a.com/i.png");
    expect(RichUrl.media("/api/localFile/getBlob/i.png")).toBe("/api/localFile/getBlob/i.png");
    expect(RichUrl.media("http://localhost:8282/api/localFile/getBlob/i.png")).toBe(
      "http://localhost:8282/api/localFile/getBlob/i.png",
    );
  });

  it("refuses inline, script and page-relative sources", () => {
    for (const url of ["data:image/png;base64,AAAA", "javascript:x", "blob:https://a.com/1", "i.png", "mailto:a@b.co"])
      expect(RichUrl.media(url)).toBeNull();
  });
});

describe("RichUrl.internalPath", () => {
  it("keeps a rooted path on this site", () => {
    expect(RichUrl.internalPath("/user/u1")).toBe("/user/u1");
    expect(RichUrl.internalPath("/ticket/t1?tab=log#c3")).toBe("/ticket/t1?tab=log#c3");
  });

  it("refuses every spelling a browser resolves to another origin", () => {
    for (const url of ["//evil.com", "/\\evil.com", "https://evil.com/user/u1", "javascript:x", "user/u1", "#u1"])
      expect(RichUrl.internalPath(url)).toBeNull();
  });
});

describe("RichUrl.external", () => {
  it("normalizes an absolute http(s) url and refuses the rest", () => {
    expect(RichUrl.external("https://a.com")).toBe("https://a.com/");
    expect(RichUrl.external("/doc/1")).toBeNull();
    expect(RichUrl.external("mailto:a@b.co")).toBeNull();
  });
});

describe("RichUrl.embed", () => {
  const providers = ["youtube", "vimeo"];

  it("resolves the YouTube url variants to the player url", () => {
    const player = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      player,
    ]) {
      expect(RichUrl.embed(url, providers)).toEqual({ type: "youtube", embedUrl: player });
    }
  });

  it("resolves a Vimeo page and its own player url", () => {
    const player = "https://player.vimeo.com/video/123456789";
    expect(RichUrl.embed("https://vimeo.com/123456789", providers)).toEqual({ type: "vimeo", embedUrl: player });
    expect(RichUrl.embed(player, providers)).toEqual({ type: "vimeo", embedUrl: player });
  });

  it("matches the provider's host exactly", () => {
    expect(RichUrl.embed("https://evil-youtube.com/watch?v=dQw4w9WgXcQ", providers)).toBeNull();
    expect(RichUrl.embed("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", providers)).toBeNull();
    expect(RichUrl.embed("https://notvimeo.com/123", providers)).toBeNull();
  });

  it("refuses an id that is not one, so nothing can be spliced into the player path", () => {
    expect(RichUrl.embed("https://www.youtube.com/watch?v=../../x", providers)).toBeNull();
    expect(RichUrl.embed("https://youtu.be/dQw4w9WgXcQ/extra", providers)).toBeNull();
    expect(RichUrl.embed("https://vimeo.com/abc", providers)).toBeNull();
  });

  it("refuses unsafe, unsupported and disallowed-provider urls", () => {
    expect(RichUrl.embed("https://example.com/video", providers)).toBeNull();
    expect(RichUrl.embed("javascript:alert(1)", providers)).toBeNull();
    expect(RichUrl.embed("data:text/html,x", providers)).toBeNull();
    expect(RichUrl.embed("not a url", providers)).toBeNull();
    expect(RichUrl.embed("https://youtu.be/dQw4w9WgXcQ", ["vimeo"])).toBeNull();
  });

  it("allows every known provider when none is named", () => {
    expect(RichUrl.embed("https://vimeo.com/1")?.type).toBe("vimeo");
    expect(RichUrl.embed("https://youtu.be/dQw4w9WgXcQ")?.type).toBe("youtube");
  });
});
