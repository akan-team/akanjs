import { describe, expect, it } from "bun:test";

import { collectAttachmentIds, reconcileAttachments } from "./attachments";
import { resolveEmbed } from "./embed";

// NOTE: imports only the pure `./attachments` + `./embed` modules (type-only
// `cnst`/lexical imports are erased; `./embed` pulls only the pure `./url`).
// The decorator node classes import `@lexical/react`, whose dev ESM build trips
// bun's loader (see [[akan-lexical-editor-bun-test]]) — their importJSON/exportJSON
// round-trip is covered by `akan build` + the `/lexical-demo` route instead.

/** A serialized document with one of every media node plus surrounding text. */
const stateWithMedia = {
  root: {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", text: "intro" }] },
      { type: "akan-image", fileId: "img-1", src: "https://x/i.png" },
      { type: "akan-video", fileId: "vid-1", src: "https://x/v.mp4" },
      { type: "akan-file", fileId: "file-1", src: "https://x/f.pdf", name: "f.pdf" },
      // External embed carries no fileId → not an attachment.
      { type: "akan-embed", embedUrl: "https://www.youtube.com/embed/abc" },
      // Callout with a nested image → collected via recursion.
      {
        type: "akan-callout",
        variant: "info",
        children: [{ type: "akan-image", fileId: "img-2", src: "https://x/j.png" }],
      },
      // Excalidraw scene embeds uploaded images in its file map (keyed by the
      // excalidraw-internal id; `.id`/`.url` point at the hosted attachment).
      {
        type: "akan-excalidraw",
        height: 420,
        preview: null,
        scene: {
          elements: [],
          files: {
            "excal-internal-a": { id: "excal-1", url: "https://x/a.png", dataURL: "https://x/a.png" },
            // An inline (not-yet-uploaded) reference has no hosted id → skipped.
            "excal-internal-b": { dataURL: "data:image/png;base64,AAAA" },
          },
        },
      },
    ],
  },
};

describe("collectAttachmentIds", () => {
  it("collects fileIds from image/video/file/excalidraw nodes, recursing into children", () => {
    expect(new Set(collectAttachmentIds(stateWithMedia))).toEqual(
      new Set(["img-1", "vid-1", "file-1", "img-2", "excal-1"]),
    );
  });

  it("ignores non-media nodes and media without a fileId", () => {
    const state = {
      root: {
        type: "root",
        children: [
          { type: "paragraph", children: [{ type: "text", text: "no media" }] },
          { type: "akan-embed", embedUrl: "https://vimeo.com/1" },
          { type: "akan-image", src: "https://x/no-id.png" },
        ],
      },
    };
    expect(collectAttachmentIds(state)).toEqual([]);
  });

  it("fails safe (empty) on non-Lexical input", () => {
    expect(collectAttachmentIds(null)).toEqual([]);
    expect(collectAttachmentIds({ "block-1": {} })).toEqual([]);
    expect(collectAttachmentIds("garbage")).toEqual([]);
  });
});

describe("reconcileAttachments", () => {
  it("keeps only attachments still referenced by the document", () => {
    const attachments = [{ id: "img-1" }, { id: "vid-1" }, { id: "orphan" }, { id: "img-2" }] as Parameters<
      typeof reconcileAttachments
    >[1];
    const kept = reconcileAttachments(stateWithMedia, attachments).map((file) => file.id);
    expect(new Set(kept)).toEqual(new Set(["img-1", "vid-1", "img-2"]));
    expect(kept).not.toContain("orphan");
  });
});

describe("resolveEmbed", () => {
  const providers = ["youtube", "vimeo"];

  it("resolves the YouTube URL variants to the embed URL", () => {
    const embed = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ", providers)?.embedUrl).toBe(embed);
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ", providers)?.embedUrl).toBe(embed);
    expect(resolveEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ", providers)?.embedUrl).toBe(embed);
    expect(resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ", providers)?.type).toBe("youtube");
  });

  it("resolves a Vimeo URL", () => {
    const resolved = resolveEmbed("https://vimeo.com/123456789", providers);
    expect(resolved?.type).toBe("vimeo");
    expect(resolved?.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });

  it("rejects unsupported, unsafe, and disallowed-provider URLs", () => {
    expect(resolveEmbed("https://example.com/video", providers)).toBeNull();
    // biome-ignore lint/suspicious/noExplicitAny: exercising the unsafe-scheme guard
    expect(resolveEmbed("javascript:alert(1)" as any, providers)).toBeNull();
    expect(resolveEmbed("not a url", providers)).toBeNull();
    // youtube URL but provider not allowed
    expect(resolveEmbed("https://youtu.be/abc", ["vimeo"])).toBeNull();
  });
});
