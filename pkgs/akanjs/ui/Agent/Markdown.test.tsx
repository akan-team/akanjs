import { beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let Markdown: typeof import("./Markdown").default;

/** Imported after the environment is set: `./Markdown` reaches the `akanjs/client` barrel, which calls `getEnv()`
 *  while the module is still evaluating. Same pattern as Chat.test.tsx. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "markdowntest";
  process.env.AKAN_PUBLIC_REPO_NAME = "markdowntest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  Markdown = (await import("./Markdown")).default;
});

const html = (source: string) => renderToStaticMarkup(<Markdown>{source}</Markdown>);

describe("Markdown", () => {
  test("renders emphasis, code spans and strikethrough as elements", () => {
    const out = html("a **bold** and *thin* and `code` and ~~gone~~");
    expect(out).toContain("<strong");
    expect(out).toContain("<em>thin</em>");
    expect(out).toContain("<code");
    expect(out).toContain("<del");
  });

  test("links an http url and opens it out of the page without handing the opener over", () => {
    const out = html("see [docs](https://bun.com/docs)");
    expect(out).toContain('href="https://bun.com/docs"');
    expect(out).toContain('rel="noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  test("links a mailto", () => {
    expect(html("[write](mailto:a@b.co)")).toContain('href="mailto:a@b.co"');
  });

  test("refuses a javascript: url, keeping the label as text", () => {
    const out = html("[click me](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<a ");
    expect(out).toContain("click me");
  });

  test("refuses every scheme it does not know, however it is cased", () => {
    for (const href of ["JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      const out = html(`[x](${href})`);
      expect(out).not.toContain("<a ");
      expect(out).not.toContain("alert");
    }
  });

  test("links a relative path, which carries no scheme to check", () => {
    const out = html("[here](/org/1)");
    expect(out).toContain('href="/org/1"');
    expect(out).toContain('target="_blank"');
  });

  test("captures a url that ends in parentheses whole", () => {
    const out = html("[Foo](https://en.wikipedia.org/wiki/Foo_(bar))");
    expect(out).toContain('href="https://en.wikipedia.org/wiki/Foo_(bar)"');
    expect(out).not.toContain(">)");
  });

  test("leaves no stray bracket behind when it refuses a url that ends in parentheses", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("<a ");
    expect(out).toBe('<div class="flex flex-col gap-2 break-words"><p>click</p></div>');
  });

  test("nests a bullet run under its numbered step and leaves the outer numbering alone", () => {
    const out = html("1. step\n   - point\n2. next");
    expect(out).toContain("<ol");
    expect(out).toContain("<ul");
    expect(out.match(/<ol/g)?.length).toBe(1);
    expect(out.indexOf("<ul")).toBeGreaterThan(out.indexOf("step"));
    expect(out.indexOf("next")).toBeGreaterThan(out.indexOf("</ul>"));
  });

  test("starts an ordered list at the number the model wrote", () => {
    expect(html("3. c\n4. d")).toContain('start="3"');
  });

  test("renders an image as its alt text — a model-supplied src is a fetch this panel does not make", () => {
    const out = html("![shot](https://evil.example/pixel.png)");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<a ");
    expect(out).toContain("shot");
  });

  test("escapes html rather than rendering it", () => {
    const out = html('<img src=x onerror="alert(1)"> and <b>bold</b>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;img");
  });

  test("leaves a code span's contents unformatted", () => {
    const out = html("`a **b** c`");
    expect(out).not.toContain("<strong");
    expect(out).toContain("a **b** c");
  });

  test("leaves snake_case and an unclosed delimiter literal", () => {
    const out = html("some_var_name and **unclosed");
    expect(out).not.toContain("<em>");
    expect(out).not.toContain("<strong");
    expect(out).toContain("some_var_name and **unclosed");
  });

  test("renders a table inside its own horizontal scroller", () => {
    const out = html("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(out).toContain("overflow-x-auto");
    expect(out).toContain("<table");
    expect(out).toContain("<th");
    expect(out).toContain("<td");
  });

  test("carries each column's alignment onto its header and body cells", () => {
    const out = html("| l | c | r |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |");
    expect(out.match(/text-center/g)?.length).toBe(2);
    expect(out.match(/text-right/g)?.length).toBe(2);
  });

  test("formats inside a table cell", () => {
    const out = html("| what |\n| --- |\n| a **bold** `cell` |");
    expect(out).toContain("<strong");
    expect(out).toContain("<code");
  });

  test("renders a heading as weighted text, never as the host page's outline", () => {
    const out = html("# Title");
    expect(out).not.toContain("<h1");
    expect(out).toContain("Title");
  });
});
