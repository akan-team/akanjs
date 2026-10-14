import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import type { ResolvedHead } from "../csrTypes";
import { RouteHead } from "./RouteHead";

const html = async (node: ReactNode) => await new Response(await renderToReadableStream(node)).text();

describe("RouteHead", () => {
  test("a deeper level takes over each singleton tag and keeps the rest of the chain", async () => {
    const merged = RouteHead.mergeNodes([
      <>
        <title key="title">Root</title>
        <meta name="description" content="root" />
        <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="/root.ico" sizes="16x16" />
        <link rel="icon" href="/root-32.ico" sizes="32x32" />
        <link rel="preconnect" href="https://cdn.example" />
      </>,
      null,
      [<title key="title">Leaf</title>, <link key="icon" rel="icon" href="/leaf.svg" />],
    ]);
    const text = await html(merged);

    expect(text.match(/<title>/g)).toHaveLength(1);
    expect(text).toContain("Leaf</title>");
    expect(text).toContain('content="root"');
    expect(text.match(/name="theme-color"/g)).toHaveLength(2);
    expect(text).toContain("/leaf.svg");
    expect(text).not.toContain("/root.ico");
    expect(text).not.toContain("/root-32.ico");
    expect(text).toContain("https://cdn.example");
  });

  test("a single level passes through untouched", () => {
    const only = <title>Only</title>;
    expect(RouteHead.mergeNodes([undefined, only, null])).toBe(only);
    expect(RouteHead.merge([undefined, null])).toBeUndefined();
  });

  test("keys name what makes two tags the same tag", () => {
    expect(RouteHead.keyOf("meta", { property: "og:Title" })).toBe("meta:property:og:title");
    expect(RouteHead.keyOf("meta", { charSet: "utf-8" })).toBe("meta:charset");
    expect(RouteHead.keyOf("link", { rel: "canonical", href: "/a" })).toBe("link:canonical");
    expect(RouteHead.keyOf("link", { rel: "alternate", hrefLang: "ko", href: "/ko" })).toBe("link:alternate:ko");
    expect(RouteHead.keyOf("link", { rel: "stylesheet", href: "/a.css" })).toBeNull();
    expect(RouteHead.keyOf("script", {})).toBeNull();
  });

  test("snapshot nodes merge by the same keys", () => {
    const merged = RouteHead.merge([
      {
        node: null,
        headSnapshot: {
          version: 1,
          nodes: [
            { tag: "title", text: "Root" },
            { tag: "link", attrs: { rel: "manifest", href: "/m.webmanifest" } },
          ],
        },
      },
      { node: null, headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Leaf" }] } },
    ]);

    expect(merged).toMatchObject({
      headSnapshot: {
        nodes: [
          { tag: "link", attrs: { rel: "manifest", href: "/m.webmanifest" } },
          { tag: "title", text: "Leaf" },
        ],
      },
    });
  });

  test("a JSX level beside a snapshot level reaches the snapshot the shell renders", () => {
    const leaf: ResolvedHead = {
      node: <title>Leaf</title>,
      headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Leaf" }] },
    };
    const merged = RouteHead.merge([
      <>
        <title>Root</title>
        <link rel="icon" href="/root.ico" sizes="32x32" />
        <meta name="theme-color" content="#fff" media={undefined} />
      </>,
      leaf,
    ]);

    expect(merged).toMatchObject({
      headSnapshot: {
        nodes: [
          { tag: "link", attrs: { rel: "icon", href: "/root.ico", sizes: "32x32" } },
          { tag: "meta", attrs: { name: "theme-color", content: "#fff" } },
          { tag: "title", text: "Leaf" },
        ],
      },
    });
  });

  test("a tag no snapshot can carry keeps the merged node, so nothing vanishes from the shell", async () => {
    const leaf: ResolvedHead = {
      node: <title>Leaf</title>,
      headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Leaf" }] },
    };
    const merged = RouteHead.merge([
      <script key="ld" type="application/ld+json">
        {"{}"}
      </script>,
      leaf,
    ]);

    expect(merged).not.toHaveProperty("headSnapshot");
    const text = await html(merged as ReactNode);
    expect(text).toContain("application/ld+json");
    expect(text).toContain("Leaf</title>");
  });

  test("a page names its own URL: a layout's canonical and og:url never reach it", async () => {
    const layouts = (
      <>
        <title>Root</title>
        <link rel="canonical" href="https://example.com" />
        <meta property="og:url" content="https://example.com" />
        <meta property="og:title" content="Root" />
      </>
    );

    const untitled = await html(RouteHead.mergePage(layouts, undefined) as ReactNode);
    const titled = await html(RouteHead.mergePage(layouts, <title>Leaf</title>) as ReactNode);
    const own = await html(
      RouteHead.mergePage(layouts, <link rel="canonical" href="https://example.com/leaf" />) as ReactNode,
    );

    for (const text of [untitled, titled]) {
      expect(text).not.toContain("canonical");
      expect(text).not.toContain("og:url");
      expect(text).toContain('content="Root"');
    }
    expect(titled).toContain("Leaf</title>");
    expect(own).toContain('href="https://example.com/leaf"');
    expect(own.match(/canonical/g)).toHaveLength(1);
    const only = <title>Only</title>;
    expect(RouteHead.mergePage(only, undefined)).toBe(only);
    expect(
      RouteHead.mergePage(
        {
          node: null,
          headSnapshot: {
            version: 1,
            nodes: [
              { tag: "link", attrs: { rel: "canonical", href: "https://example.com" } },
              { tag: "title", text: "Root" },
            ],
          },
        },
        undefined,
      ),
    ).toEqual({ node: null, headSnapshot: { version: 1, nodes: [{ tag: "title", text: "Root" }] } });
  });
});
