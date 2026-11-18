"use client";
import type { Location, PathRoute } from "akanjs/client";

type FramePageState = PathRoute["pageState"];
type Keyframe = Record<string, string>;

export interface CsrSlideFrame {
  width: number;
  height: number;
  pageState: FramePageState;
  prevPageState: FramePageState;
}

interface CsrSlidePlay {
  fromUnit: number;
  toUnit: number;
  duration: number;
  keep?: boolean;
}

const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const px = (value: number) => `${value}px`;
const shown = (selector: string) => `${selector} > [data-page-type="current"]`;
const under = (selector: string) => `${selector} > [data-page-type="prev"]`;
const pageSelector = `${shown("#pageContainers")} .akan-page-content`;

//* A stack slide runs as Web Animations of transform and opacity, which WebKit hands to Core Animation and Chromium to
//* its compositor, so a busy main thread no longer drops its frames; driven by a spring, every frame was script on the
//* main thread. The spring is set where each part comes to rest, and a part's keyframes are what the spring's styles
//* would be at either end, so the two never disagree once the animation ends.
export class CsrSlide {
  //? UIKit's push leaves fast and settles slowly; at a constant speed a full-width slide reads as a jump.
  static readonly easing = "cubic-bezier(0.25, 1, 0.5, 1)";
  readonly #animations: Animation[];
  readonly #page: HTMLElement | null;

  private constructor(animations: Animation[], page: HTMLElement | null) {
    this.#animations = animations;
    this.#page = page;
  }

  static get supported() {
    return typeof document !== "undefined" && typeof document.documentElement.animate === "function";
  }

  static get isCalm() {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  static #stillEntryId: string | null = null;
  //? A replace moves as the page it replaces does: a tab that does not slide, switched to one that does, is still a
  //? tab switch and changes in place. Every transition hook of the page it lands on reads the entry kept here.
  static holdStill(kind: "push" | "replace", from: Location, to: Location) {
    const isStill =
      kind === "replace" &&
      from.pathRoute.pageState.transition === "none" &&
      to.pathRoute.pageState.transition !== "none";
    CsrSlide.#stillEntryId = isStill ? (to.entryId ?? null) : null;
    return isStill;
  }
  static isStill(entryId: string | undefined) {
    return !!entryId && entryId === CsrSlide.#stillEntryId;
  }

  static play(frame: CsrSlideFrame, { fromUnit, toUnit, duration, keep = false }: CsrSlidePlay): CsrSlide | null {
    if (!CsrSlide.supported || duration <= 0) return null;
    const from = CsrSlide.partsAt(frame, fromUnit);
    const to = CsrSlide.partsAt(frame, toUnit);
    const animations: Animation[] = [];
    let page: HTMLElement | null = null;
    for (const [selector, start] of Object.entries(from)) {
      const end = to[selector];
      const changed = Object.keys(start).filter((property) => start[property] !== end[property]);
      const element = changed.length ? document.querySelector<HTMLElement>(selector) : null;
      if (!element) continue;
      if (selector === pageSelector) page = element;
      const pick = (keyframe: Keyframe) =>
        Object.fromEntries(changed.map((property) => [property, keyframe[property]]));
      animations.push(
        element.animate([pick(start), pick(end)], {
          duration,
          easing: CsrSlide.easing,
          fill: keep ? "forwards" : "none",
        }),
      );
    }
    return animations.length ? new CsrSlide(animations, page) : null;
  }

  /** What each part's style is with the page `unit` px from its place: 0 shown, the frame's width gone right. */
  static partsAt({ width, height, pageState, prevPageState }: CsrSlideFrame, unit: number): Record<string, Keyframe> {
    const progress = width > 0 ? (width - unit) / width : 1;
    const between = (prev: number, next: number) => px(lerp(prev, next, progress));
    const prevOffset = px((unit - width) / 5);
    const bottomInsetTop = (state: FramePageState) => height - state.bottomInset - state.bottomSafeArea;
    return {
      [pageSelector]: { transform: `translateX(${px(unit)})` },
      [under("#pageContainers")]: { transform: `translateX(${prevOffset})` },
      [`${under("#pageContainers")} .akan-page-content`]: { opacity: `${1 - progress / 2}` },
      [shown("#topInsetContainer")]: {
        opacity: `${progress}`,
        transform: `translateX(${px((width / 5) * (1 - progress))})`,
      },
      [under("#topInsetContainer")]: {
        opacity: `${1 - progress}`,
        transform: `translateX(${px((-width / 5) * progress)})`,
      },
      [shown("#topLeftActionContainer")]: { opacity: `${progress}` },
      [under("#topLeftActionContainer")]: { opacity: `${1 - progress}` },
      [shown("#bottomInsetContainer")]: { opacity: `${progress}`, transform: `translateX(${px(unit)})` },
      [under("#bottomInsetContainer")]: { opacity: `${1 - progress}`, transform: `translateX(${prevOffset})` },
      "#topInsetContainer": {
        top: between(prevPageState.topSafeArea, pageState.topSafeArea),
        height: between(prevPageState.topInset, pageState.topInset),
      },
      "#topLeftActionContainer": {
        top: between(prevPageState.topSafeArea, pageState.topSafeArea),
        height: between(prevPageState.topInset, pageState.topInset),
        minWidth: between(prevPageState.topInset, pageState.topInset),
      },
      "#bottomInsetContainer": {
        top: between(bottomInsetTop(prevPageState), bottomInsetTop(pageState)),
        height: between(prevPageState.bottomInset, pageState.bottomInset),
      },
      "#topSafeArea": { height: between(prevPageState.topSafeArea, pageState.topSafeArea) },
      "#bottomSafeArea": {
        top: between(height - prevPageState.bottomSafeArea, height - pageState.bottomSafeArea),
        height: between(prevPageState.bottomSafeArea, pageState.bottomSafeArea),
      },
    };
  }

  /** Where the page is right now, as the spring's unit, or null when this slide does not move it. */
  unitNow(): number | null {
    if (!this.#page || typeof DOMMatrixReadOnly === "undefined") return null;
    const { transform } = getComputedStyle(this.#page);
    return !transform || transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
  }

  get finished() {
    return Promise.all(this.#animations.map((animation) => animation.finished.catch(() => undefined))).then(
      () => undefined,
    );
  }

  cancel() {
    for (const animation of this.#animations) animation.cancel();
  }
}
