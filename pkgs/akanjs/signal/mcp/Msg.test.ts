import { describe, expect, test } from "bun:test";
import { FIELD_META } from "akanjs/base";
import { Msg } from "./Msg";

/** A model that declares a field masking must strip, stamped the way `via()` stamps a real one. */
class Leaky {
  password = "hunter2";
  title = "post";
}
(Leaky as unknown as Record<symbol, unknown>)[FIELD_META] = {
  password: { fieldType: "secret" },
  title: { fieldType: "property" },
};

/** A model with nothing to strip — what a `Light<Model>` looks like to this check. */
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
    // `ResourceLink` extends `BaseMetadata`, whose `name` is required, and a client SDK parses the reply against a
    // union — so a block without one does not arrive thinner, it makes the whole `prompts/get` throw.
    expect(Msg.link("akan://order/42").content).toEqual({
      type: "resource_link",
      uri: "akan://order/42",
      name: "42",
    });
    // The last path segment, with the query string off it: for a file URL that is the filename anyway.
    expect(Msg.link("https://cdn/a.png?v=2").content).toMatchObject({ name: "a.png" });
  });

  test("strips hidden and secret fields by the model the caller names", () => {
    expect(JSON.parse(payloadOf(Msg.resource("akan://post/1", new Leaky(), { model: Leaky })))).toEqual({
      title: "post",
    });
  });

  test("masks a payload that lost its class, which is the case a value-side check could never reach", () => {
    // `{ ...doc }`, `toJSON()`, and a round-trip through `JSON.stringify` all arrive with the metadata gone. Naming
    // the model is what makes those maskable: the model is an argument, so the value has nothing left to lose.
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
    // A relation still held as an id is not a document to walk, and loading it would turn one attachment into a
    // fan of queries — the half of `resolveReturn` this deliberately does not do.
    expect(Msg.mask(Post, Object.assign(new Post(), { author: "post-id" }))).toEqual({
      author: "post-id",
      title: "post",
    });
  });

  test("refuses an undeclared payload whose secret fields are populated", () => {
    expect(() => Msg.resource("akan://post/1", new Leaky())).toThrow(/password/);
    // Named, so the message says which model and what to write.
    expect(() => Msg.resource("akan://post/1", new Leaky())).toThrow(/model: cnst.Leaky/);
  });

  test("lets through what declares nothing to strip", () => {
    // A Light model excludes them by construction, and an object assembled by hand declares no fields at all.
    expect(() => Msg.resource("akan://post/3", { title: "assembled by hand" })).not.toThrow();
    expect(() => Msg.resource("akan://post/4", new Clean())).not.toThrow();
  });

  test("sees a document wrapped in a plain object, which is how one usually arrives", () => {
    // A document rarely travels alone. `{ order }` / `{ order, customer }` is the ordinary assembly, and a plain
    // object's own constructor carries no field metadata — so a check that read only the outer value saw nothing.
    expect(() => Msg.resource("akan://order/1", { order: new Leaky(), note: "for review" })).toThrow(/password/);
    // A wrapper names no single model, so each piece is masked on its way in instead.
    expect(() =>
      Msg.resource("akan://order/2", { order: Msg.mask(Leaky, new Leaky()), note: "for review" }),
    ).not.toThrow();
  });

  test("cannot see a spread payload, which is why masking takes the model rather than reading it", () => {
    // Nothing here or anywhere else can tell this from an object assembled by hand. It passes, and `Msg.mask` is
    // the reason that is now a gap in detection rather than a gap in what the framework can do about it.
    expect(() => Msg.resource("akan://order/3", { ...new Leaky() })).not.toThrow();
  });

  test("wraps a bare string into one user message", () => {
    expect(Msg.normalize("be brief")).toEqual([Msg.user("be brief")]);
  });

  test("rejects a shape the pipeline would have passed through untouched", () => {
    // `prompt()` carries `Any`, so nothing upstream inspects the value — this is the only check there is.
    expect(() => Msg.normalize(42)).toThrow("string or PromptMessage[]");
    expect(() => Msg.normalize([{ role: "system", content: { type: "text", text: "x" } }])).toThrow('role "system"');
    expect(() => Msg.normalize([{ role: "user", content: { type: "video" } }])).toThrow('content type "video"');
    expect(() => Msg.normalize([null])).toThrow("role");
  });

  test("checks the fields inside a block, not just its type", () => {
    // Every shape below is one this framework can build, and a check that stops at `content.type` sees none of
    // them — they leave here looking like prompts and throw inside the client's own parser instead.
    const bad = (content: unknown) => () => Msg.normalize([{ role: "user", content }]);
    expect(bad({ type: "resource_link", uri: "akan://a/1" })).toThrow("is missing name");
    expect(bad({ type: "text" })).toThrow("is missing text");
    expect(bad({ type: "image", data: "AAA=" })).toThrow("is missing mimeType");
    expect(bad({ type: "resource", resource: { mimeType: "application/json", text: "{}" } })).toThrow("resource.uri");
    expect(bad({ type: "resource", resource: { uri: "akan://a/1" } })).toThrow("resource.text");
    // A base64 payload is the other half of that pair and is accepted in its place.
    expect(
      Msg.normalize([{ role: "user", content: { type: "resource", resource: { uri: "a:1", blob: "AAA=" } } }]),
    ).toHaveLength(1);
    // The same range the builders enforce, for a message an author assembled without them.
    expect(bad({ type: "text", text: "x", annotations: { priority: 5 } })).toThrow("between 0 and 1");
  });

  test("carries the annotations a client drops blocks by", () => {
    // A prompt this server assembles is mostly context around one instruction. Without `priority` a client with a
    // full window drops blocks by position, so the ask can go and the attachment it was about can stay.
    expect(Msg.user("do this", { priority: 1 }).content).toMatchObject({ annotations: { priority: 1 } });
    expect(Msg.resource("akan://a/1", {}, { priority: 0.2, audience: ["assistant"] }).content).toMatchObject({
      annotations: { priority: 0.2, audience: ["assistant"] },
    });
    // `link` already took an options object, so its annotations ride there rather than in a fourth parameter.
    expect(Msg.link("akan://a/1", { name: "Cover", priority: 0.1 }).content).toMatchObject({
      name: "Cover",
      annotations: { priority: 0.1 },
    });
    // An empty object is dropped: `annotations: {}` reads as a deliberate "no audience, no priority".
    expect(Msg.user("plain").content).not.toHaveProperty("annotations");
    expect(Msg.link("akan://a/1", { name: "Cover" }).content).not.toHaveProperty("annotations");
    // Out of range throws rather than clamping — the 0..1 range is what gives the number its meaning, and a
    // client is free to ignore the field, so a silent clamp turns a typo into an order nobody chose.
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
