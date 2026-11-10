import { describe, expect, test } from "bun:test";
import { FIELD_META } from "akanjs/base";
import { Msg } from "./Msg";
import { PromptError } from "./promptError";

/** A model that declares a field masking must strip, stamped the way `via()` stamps a real one. */
class Leaky {
  password = "hunter2";
  title = "post";
}
(Leaky as unknown as Record<symbol, unknown>)[FIELD_META] = {
  password: { fieldType: "secret" },
  title: { fieldType: "property" },
};

class Clean {
  title = "post";
}
(Clean as unknown as Record<symbol, unknown>)[FIELD_META] = { title: { fieldType: "property" } };

const payloadOf = (message: ReturnType<typeof Msg.resource>) => {
  const { content } = message;
  if (content.type !== "resource") throw new Error("expected an embedded resource");
  return content.resource.text;
};

describe("Msg", () => {
  test("builds text messages under both roles", () => {
    expect(Msg.user("hello")).toEqual({ role: "user", content: { type: "text", text: "hello" } });
    expect(Msg.assistant("sure")).toEqual({ role: "assistant", content: { type: "text", text: "sure" } });
  });

  test("embeds a resource as json and links one without a payload", () => {
    expect(Msg.resource("akan://order/1", { id: "1" })).toEqual({
      role: "user",
      content: {
        type: "resource",
        resource: { uri: "akan://order/1", mimeType: "application/json", text: '{"id":"1"}' },
      },
    });
    expect(Msg.link({ url: "https://cdn/a.png", filename: "a.png", mimetype: "image/png" }).content).toEqual({
      type: "resource_link",
      uri: "https://cdn/a.png",
      name: "a.png",
      mimeType: "image/png",
    });
  });

  test("takes a bare uri and lets an explicit name win over the filename", () => {
    expect(Msg.link("akan://order/1", { name: "Order", description: "the order" }).content).toEqual({
      type: "resource_link",
      uri: "akan://order/1",
      name: "Order",
      description: "the order",
    });
    expect(Msg.link({ url: "https://cdn/a.png", filename: "a.png" }, { name: "Cover" }).content).toMatchObject({
      name: "Cover",
    });
  });

  test("always names a link, because the spec has no nameless one", () => {
    expect(Msg.link("akan://order/42").content).toEqual({
      type: "resource_link",
      uri: "akan://order/42",
      name: "42",
    });
    expect(Msg.link("https://cdn/a.png?v=2").content).toMatchObject({ name: "a.png" });
  });

  test("strips hidden and secret fields by the model the caller names", () => {
    expect(JSON.parse(payloadOf(Msg.resource("akan://post/1", new Leaky(), { model: Leaky })))).toEqual({
      title: "post",
    });
  });

  test("masks a payload that lost its class, which is the case a value-side check could never reach", () => {
    for (const value of [{ ...new Leaky() }, JSON.parse(JSON.stringify(new Leaky()))]) {
      expect(Msg.mask(Leaky, value)).toEqual({ title: "post" });
    }
  });

  test("masks through arrays and into a populated relation, but leaves an unpopulated one as an id", () => {
    class Post {
      author: unknown;
      title = "post";
    }
    (Post as unknown as Record<symbol, unknown>)[FIELD_META] = {
      author: { fieldType: "property", isClass: true, modelRef: Leaky },
      title: { fieldType: "property" },
    };
    const populated = Object.assign(new Post(), { author: new Leaky() });
    expect(Msg.mask(Post, [populated])).toEqual([{ author: { title: "post" }, title: "post" }]);
    expect(Msg.mask(Post, Object.assign(new Post(), { author: "post-id" }))).toEqual({
      author: "post-id",
      title: "post",
    });
  });

  test("refuses an undeclared payload whose secret fields are populated", () => {
    expect(() => Msg.resource("akan://post/1", new Leaky())).toThrow(/password/);
    expect(() => Msg.resource("akan://post/1", new Leaky())).toThrow(/model: cnst.Leaky/);
  });

  test("lets through what declares nothing to strip", () => {
    expect(() => Msg.resource("akan://post/3", { title: "assembled by hand" })).not.toThrow();
    expect(() => Msg.resource("akan://post/4", new Clean())).not.toThrow();
  });

  test("sees a document wrapped in a plain object, which is how one usually arrives", () => {
    expect(() => Msg.resource("akan://order/1", { order: new Leaky(), note: "for review" })).toThrow(/password/);
    expect(() =>
      Msg.resource("akan://order/2", { order: Msg.mask(Leaky, new Leaky()), note: "for review" }),
    ).not.toThrow();
  });

  test("cannot see a spread payload, which is why masking takes the model rather than reading it", () => {
    expect(() => Msg.resource("akan://order/3", { ...new Leaky() })).not.toThrow();
  });

  test("wraps a bare string into one user message", () => {
    expect(Msg.normalize("be brief")).toEqual([Msg.user("be brief")]);
  });

  test("rejects a shape the pipeline would have passed through untouched", () => {
    expect(() => Msg.normalize(42)).toThrow("string or PromptMessage[]");
    expect(() => Msg.normalize([{ role: "system", content: { type: "text", text: "x" } }])).toThrow('role "system"');
    expect(() => Msg.normalize([{ role: "user", content: { type: "video" } }])).toThrow('content type "video"');
    expect(() => Msg.normalize([null])).toThrow("role");
    expect(() => Msg.normalize(42)).toThrow(PromptError);
    let refused: unknown;
    try {
      Msg.normalize(42);
    } catch (error) {
      refused = error;
    }
    expect(PromptError.is(refused, "invalidPrompt")).toBe(true);
  });

  test("checks the fields inside a block, not just its type", () => {
    const bad = (content: unknown) => () => Msg.normalize([{ role: "user", content }]);
    expect(bad({ type: "resource_link", uri: "akan://a/1" })).toThrow("is missing name");
    expect(bad({ type: "text" })).toThrow("is missing text");
    expect(bad({ type: "image", data: "AAA=" })).toThrow("is missing mimeType");
    expect(bad({ type: "resource", resource: { mimeType: "application/json", text: "{}" } })).toThrow("resource.uri");
    expect(bad({ type: "resource", resource: { uri: "akan://a/1" } })).toThrow("resource.text");
    expect(
      Msg.normalize([{ role: "user", content: { type: "resource", resource: { uri: "a:1", blob: "AAA=" } } }]),
    ).toHaveLength(1);
    expect(bad({ type: "text", text: "x", annotations: { priority: 5 } })).toThrow("between 0 and 1");
  });

  test("carries the annotations a client drops blocks by", () => {
    expect(Msg.user("do this", { priority: 1 }).content).toMatchObject({ annotations: { priority: 1 } });
    expect(Msg.resource("akan://a/1", {}, { priority: 0.2, audience: ["assistant"] }).content).toMatchObject({
      annotations: { priority: 0.2, audience: ["assistant"] },
    });
    expect(Msg.link("akan://a/1", { name: "Cover", priority: 0.1 }).content).toMatchObject({
      name: "Cover",
      annotations: { priority: 0.1 },
    });
    expect(Msg.user("plain").content).not.toHaveProperty("annotations");
    expect(Msg.link("akan://a/1", { name: "Cover" }).content).not.toHaveProperty("annotations");
    expect(() => Msg.user("x", { priority: 5 })).toThrow("between 0 and 1");
  });

  test("accepts every content type the spec defines", () => {
    const messages = [
      Msg.user("t"),
      Msg.image("AAA=", "image/png"),
      Msg.audio("AAA=", "audio/mpeg"),
      Msg.link("akan://a/1"),
      Msg.resource("akan://a/1", {}),
    ];
    expect(Msg.normalize(messages)).toBe(messages);
  });
});
