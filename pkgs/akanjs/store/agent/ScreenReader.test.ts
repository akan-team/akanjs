import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";

let ScreenReader: typeof import("./ScreenReader").ScreenReader;
let ScreenTarget: typeof import("./ScreenTarget").ScreenTarget;

beforeAll(async () => {
  ({ ScreenReader } = await import("./ScreenReader"));
  ({ ScreenTarget } = await import("./ScreenTarget"));
});

const readOf = (html: string) => {
  document.body.innerHTML = html;
  return ScreenReader.read();
};

describe("ScreenReader", () => {
  test("keeps heading levels, list bullets, and the page title", () => {
    document.title = "Quickstart";
    const text = readOf("<h1>Intro</h1><h3>Steps</h3><p>Read this.</p><ul><li>one</li><li>two</li></ul>");
    expect(text.startsWith("Page: Quickstart")).toBe(true);
    expect(text).toContain("\n# Intro");
    expect(text).toContain("\n### Steps");
    expect(text).toContain("\nRead this.");
    expect(text).toContain("\n- one");
    expect(text).toContain("\n- two");
  });

  test("keeps a link's href inline in its sentence", () => {
    const text = readOf('<p>See <a href="/docs">the docs</a> now</p><a href="/docs">/docs</a>');
    expect(text).toContain("See the docs (/docs) now");
    // A link whose text is its href gains nothing from repeating it.
    expect(text).not.toContain("/docs (/docs)");
  });

  test("skips scripts, hidden subtrees, and the agent's own UI", () => {
    const text = readOf(
      '<p>visible</p><script>secretCode()</script><div hidden>gone</div><div aria-hidden="true">gone too</div>' +
        '<div style="display:none">styled away</div><aside data-agent-ui=""><p>transcript</p></aside>',
    );
    expect(text).toContain("visible");
    expect(text).not.toContain("secretCode");
    expect(text).not.toContain("gone");
    expect(text).not.toContain("styled away");
    expect(text).not.toContain("transcript");
  });

  // Chrome answers `false` for a `display: contents` element — it has no layout box — while happy-dom answers
  // `true`, so the browser's verdict is stubbed in to reproduce the case that dropped the whole subtree.
  test("reads through a display:contents wrapper, which has no box of its own", () => {
    document.body.innerHTML = '<div id="wrap" style="display:contents"><p>wrapped body</p></div>';
    const wrap = document.getElementById("wrap") as HTMLElement;
    wrap.checkVisibility = () => false;
    expect(ScreenReader.read()).toContain("wrapped body");
  });

  test("leaves a named marker where a skipped region was, and reads it when it is asked for by name", () => {
    const text = readOf(
      '<p>plain body</p><footer data-agent-skip="site footer"><h2>Legal</h2><p>terms body</p></footer>',
    );
    expect(text).toContain("plain body");
    expect(text).toContain("[skipped: site footer]");
    expect(text).not.toContain("terms body");
    // Naming it is the explicit ask that reads it: the marker is what the default read leaves out, not a wall.
    const region = ScreenTarget.container("site footer");
    expect(ScreenReader.read(region)).toContain("terms body");
  });

  test("a skipped region with an anchor prints it, and one with no label falls back to its tag", () => {
    const text = readOf('<footer id="footer" data-agent-skip="site footer">a</footer><nav data-agent-skip="">b</nav>');
    expect(text).toContain("[skipped: site footer (#footer)]");
    expect(text).toContain("[skipped: nav]");
  });

  test("a region that is both skipped and unrendered leaves no marker claiming it is there", () => {
    const text = readOf('<p>plain body</p><footer data-agent-skip="site footer" hidden>terms body</footer>');
    expect(text).toContain("plain body");
    expect(text).not.toContain("skipped");
  });

  test("reads controls by their akan annotation and never a password's value", () => {
    const text = readOf(
      '<input data-akan-state="task.title" value="Draft plan" />' +
        '<input type="password" value="hunter2" placeholder="pw" />' +
        '<input type="checkbox" name="done" checked />' +
        '<button data-akan-action="submitTask">Save</button>',
    );
    expect(text).toContain('[input task.title: "Draft plan"]');
    expect(text).not.toContain("hunter2");
    expect(text).toContain("[checkbox done: on]");
    expect(text).toContain("[button: Save → submitTask]");
  });

  test("says a control is disabled, so a refused write is a fact the agent could read first", () => {
    const text = readOf(
      '<input data-akan-state="task.title" value="Pinned" disabled />' +
        '<input data-akan-state="task.slug" value="open" />' +
        '<input type="checkbox" name="done" checked aria-disabled="true" />' +
        '<button data-akan-action="submitTask" disabled>Save</button>',
    );
    expect(text).toContain('[input task.title (disabled): "Pinned"]');
    expect(text).toContain('[input task.slug: "open"]');
    expect(text).toContain("[checkbox done (disabled): on]");
    expect(text).toContain("[button (disabled): Save → submitTask]");
  });

  test("truncates past the limit and says so", () => {
    const text = readOf(`<p>${"a".repeat(ScreenReader.limit + 500)}</p>`);
    expect(text.length).toBeLessThan(ScreenReader.limit + 100);
    expect(text).toContain("truncated");
  });

  test("a heading carries the anchor of the section it opens", () => {
    const text = readOf(
      `<div id="images-env"><h2>Images And Public Env</h2><p>body</p></div>
       <div id="two-headings"><h2>First</h2><h2>Second</h2></div>`,
    );
    expect(text).toContain("## Images And Public Env (#images-env)");
    // Only the heading a container leads with takes its id: the second heading is not what that name would reach.
    expect(text).toContain("## First (#two-headings)");
    expect(text).toContain("## Second");
    expect(text).not.toContain("Second (#two-headings)");
  });

  test("a truncated read names the sections below the cut, so they can still be reached", () => {
    const filler = `<p>${"a".repeat(ScreenReader.limit)}</p>`;
    const text = readOf(
      `${filler}<div id="images-env"><h2>Images And Public Env</h2><p>body</p></div>
       <div id="defaults"><h2>Defaults</h2><p>body</p></div>`,
    );
    expect(text).toContain("Further down, unread:");
    expect(text).toContain("## Images And Public Env (#images-env)");
    expect(text).toContain("## Defaults (#defaults)");
  });

  test("a heading below even the walk budget is still named", () => {
    const filler = `<p>${"b".repeat(ScreenReader.limit * 2 + 100)}</p>`;
    const text = readOf(`${filler}<div id="build-runtime"><h2>Build And Runtime</h2><p>body</p></div>`);
    expect(text).toContain("## Build And Runtime (#build-runtime)");
  });

  test("readFrom reads one heading's section and stops at the next of the same level", () => {
    document.body.innerHTML = `
      <main>
        <h2>Alpha</h2><p>alpha body</p><h3>Alpha Detail</h3><p>detail body</p>
        <h2>Beta</h2><p>beta body</p>
      </main>`;
    const heading = [...document.querySelectorAll("h2")].find((el) => el.textContent === "Alpha");
    const text = ScreenReader.readFrom(heading as HTMLElement);
    expect(text).toContain("## Alpha");
    expect(text).toContain("alpha body");
    expect(text).toContain("detail body");
    expect(text).not.toContain("beta body");
  });

  test("readFrom climbs past the title wrapper to the section that holds the heading", () => {
    // The real docs shape: the heading sits two divs inside the slide, so the innermost match is the heading alone.
    document.body.innerHTML = `
      <div id="images-env"><div class="title"><h2>Images And Public Env</h2></div><p>public env body</p></div>
      <div id="defaults"><div class="title"><h2>Defaults</h2></div><p>defaults body</p></div>`;
    const heading = document.querySelector("#images-env h2");
    const text = ScreenReader.readFrom(heading as HTMLElement);
    expect(text).toContain("public env body");
    expect(text).not.toContain("defaults body");
  });
});
