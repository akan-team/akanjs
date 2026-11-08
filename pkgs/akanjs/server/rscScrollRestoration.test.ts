import "../test/registerDom";
import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { RscScrollRestoration } from "./rscScrollRestoration";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
//? What React's `$RC` does with a boundary it has outlined: moves the hidden segment's nodes into place.
const revealSegment = () => {
  const segment = document.getElementById("S:0");
  document.querySelector("main")?.append(...(segment?.childNodes ?? []));
  segment?.remove();
};

let scrolledTo: string[] = [];
let scrollIntoView: Mock<(this: Element) => void>;

beforeEach(() => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    "http://localhost/en/pokemon/pikachu#moves",
  );
  document.body.innerHTML = '<main><p>stats</p></main><div hidden id="S:0"><h2 id="moves">Moves</h2></div>';
  window.scrollTo(0, 0);
  scrolledTo = [];
  scrollIntoView = spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
    scrolledTo.push(this.id);
  });
});

afterEach(() => {
  scrollIntoView.mockRestore();
});

describe("RscScrollRestoration on a document opened at a fragment", () => {
  test("scrolls to the target once React reveals the segment holding it", async () => {
    new RscScrollRestoration().restoreDocumentLoad();
    await settle();
    expect(scrolledTo).toEqual([]);

    revealSegment();
    await settle();

    expect(scrolledTo).toEqual(["moves"]);
  });

  test("scrolls to a target already on the page when the document is still at the top", () => {
    document.body.innerHTML = '<main><p>stats</p><h2 id="moves">Moves</h2></main>';

    new RscScrollRestoration().restoreDocumentLoad();

    expect(scrolledTo).toEqual(["moves"]);
  });

  test("leaves a document the browser or the visitor has scrolled alone", async () => {
    window.scrollTo(0, 400);

    new RscScrollRestoration().restoreDocumentLoad();
    revealSegment();
    await settle();

    expect(scrolledTo).toEqual([]);
  });

  test("leaves a reloaded or revisited document at the offset the browser restored, the top included", async () => {
    for (const type of ["reload", "back_forward"]) {
      const navigation = spyOn(performance, "getEntriesByType").mockReturnValue([
        { type } as unknown as PerformanceEntry,
      ]);
      try {
        new RscScrollRestoration().restoreDocumentLoad();
        revealSegment();
        await settle();

        expect(scrolledTo).toEqual([]);
        expect(navigation).toHaveBeenCalledWith("navigation");
      } finally {
        navigation.mockRestore();
      }
    }
  });

  test("gives up once the visitor scrolls before the target appears", async () => {
    new RscScrollRestoration().restoreDocumentLoad();
    window.dispatchEvent(new Event("wheel"));
    revealSegment();
    await settle();

    expect(scrolledTo).toEqual([]);
  });
});
