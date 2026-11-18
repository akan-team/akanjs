import "../test/registerDom";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultPageState } from "akanjs/client";
import { CsrSlide, type CsrSlideFrame } from "./csrSlide";

interface Played {
  id: string;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
}

let played: Played[] = [];
const animate = HTMLElement.prototype.animate;

beforeEach(() => {
  played = [];
  HTMLElement.prototype.animate = function (this: HTMLElement, keyframes, options) {
    const entry: Played = {
      id: this.id || `${this.parentElement?.id} > ${this.dataset.pageType ?? this.className}`,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancelled: false,
    };
    played.push(entry);
    return {
      finished: Promise.resolve(),
      cancel: () => {
        entry.cancelled = true;
      },
    } as unknown as Animation;
  };
  document.body.innerHTML = `
    <div id="pageContainers">
      <div id="pageContainer-a" data-page-type="prev"><div class="akan-page-content"></div></div>
      <div id="pageContainer-b" data-page-type="current"><div class="akan-page-content"></div></div>
      <div id="pageContainer-c" data-page-type="cached"><div class="akan-page-content"></div></div>
    </div>
    <div id="topSafeArea"></div>
    <div id="topInsetContainer">
      <div id="topInsetContent-a" data-page-type="prev"></div>
      <div id="topInsetContent-b" data-page-type="current"></div>
    </div>
    <div id="bottomSafeArea"></div>`;
});

afterEach(() => {
  HTMLElement.prototype.animate = animate;
  document.body.innerHTML = "";
});

const frame = (pageState: Partial<CsrSlideFrame["pageState"]>, prevPageState: Partial<CsrSlideFrame["pageState"]>) => ({
  width: 400,
  height: 800,
  pageState: { ...defaultPageState, ...pageState },
  prevPageState: { ...defaultPageState, ...prevPageState },
});

describe("CsrSlide", () => {
  test("slides the page in over the page under, which drifts a fifth of the way and dims, and swaps their bars", () => {
    const slide = CsrSlide.play(frame({ topInset: 0 }, { topInset: 48 }), { fromUnit: 400, toUnit: 0, duration: 350 });

    expect(slide).not.toBeNull();
    const of = (id: string) => played.find((entry) => entry.id === id)?.keyframes;
    expect(of("pageContainer-b > akan-page-content")).toEqual([
      { transform: "translateX(400px)" },
      { transform: "translateX(0px)" },
    ]);
    expect(of("pageContainer-a")).toEqual([{ transform: "translateX(0px)" }, { transform: "translateX(-80px)" }]);
    expect(of("pageContainer-a > akan-page-content")).toEqual([{ opacity: "1" }, { opacity: "0.5" }]);
    expect(of("topInsetContent-b")).toEqual([
      { opacity: "0", transform: "translateX(80px)" },
      { opacity: "1", transform: "translateX(0px)" },
    ]);
    expect(of("topInsetContent-a")).toEqual([
      { opacity: "1", transform: "translateX(0px)" },
      { opacity: "0", transform: "translateX(-80px)" },
    ]);
    expect(of("topInsetContainer")).toEqual([{ height: "48px" }, { height: "0px" }]);
    expect(played.every((entry) => entry.options.duration === 350 && entry.options.fill === "none")).toBe(true);
    expect(played.map((entry) => entry.id)).not.toContain("pageContainer-c");
  });

  test("a navbar riding its page moves with it, and the bar under is cut where the page coming in covers it", () => {
    CsrSlide.play(frame({ topInset: 48, navbarMotion: "page" }, { topInset: 0 }), {
      fromUnit: 400,
      toUnit: 0,
      duration: 350,
    });

    const of = (id: string) => played.find((entry) => entry.id === id)?.keyframes;
    expect(of("topInsetContent-b")).toEqual([{ transform: "translateX(400px)" }, { transform: "translateX(0px)" }]);
    expect(of("topInsetContent-a")).toEqual([
      { opacity: "1", transform: "translateX(0px)", clipPath: "inset(0px 0px 0px 0px)" },
      { opacity: "0.5", transform: "translateX(-80px)", clipPath: "inset(0px 320px 0px 0px)" },
    ]);
    expect(played.map((entry) => entry.id)).not.toContain("topInsetContainer");
    expect(CsrSlide.partsAt(frame({ topInset: 48, navbarMotion: "page" }, { topInset: 0 }), 200)).toMatchObject({
      "#topInsetContainer": { height: "48px" },
      '#pageContainers > [data-page-type="prev"] .akan-page-content': { opacity: "0.75" },
    });
  });

  test("leaves a frame part alone when it rests where it started, and parts the page does not draw", () => {
    CsrSlide.play(frame({}, {}), { fromUnit: 400, toUnit: 0, duration: 350 });

    const ids = played.map((entry) => entry.id);
    expect(ids).not.toContain("topInsetContainer");
    expect(ids).not.toContain("topSafeArea");
    expect(ids).not.toContain("bottomInsetContainer");
  });

  test("a slide back from where the finger let go keeps its end until the page under takes the screen", async () => {
    const slide = CsrSlide.play(frame({}, {}), { fromUnit: 150, toUnit: 400, duration: 120, keep: true });

    expect(played.find((entry) => entry.id === "pageContainer-b > akan-page-content")?.keyframes).toEqual([
      { transform: "translateX(150px)" },
      { transform: "translateX(400px)" },
    ]);
    expect(played.every((entry) => entry.options.fill === "forwards")).toBe(true);
    await slide?.finished;
    slide?.cancel();
    expect(played.every((entry) => entry.cancelled)).toBe(true);
  });

  test("reads where its page is mid-slide, so an interruption goes on from there", () => {
    const slide = CsrSlide.play(frame({}, {}), { fromUnit: 400, toUnit: 0, duration: 350 });
    const page = document.querySelector<HTMLElement>("#pageContainer-b .akan-page-content");
    if (page) page.style.transform = "translateX(230px)";
    expect(slide?.unitNow()).toBe(230);
  });

  test("hands the slide back to the spring where Web Animations are missing or there is no time to slide", () => {
    expect(CsrSlide.play(frame({}, {}), { fromUnit: 400, toUnit: 0, duration: 0 })).toBeNull();
    HTMLElement.prototype.animate = undefined as unknown as HTMLElement["animate"];
    expect(CsrSlide.play(frame({}, {}), { fromUnit: 400, toUnit: 0, duration: 350 })).toBeNull();
  });
});
