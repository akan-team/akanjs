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
  static settleMove(kind: "push" | "replace", from: Location, to: Location) {
    const isStill =
      kind === "replace" &&
      from.pathRoute.pageState.transition === "none" &&
      to.pathRoute.pageState.transition !== "none";
    CsrSlide.#stillEntryId = isStill ? (to.entryId ?? null) : null;
    //? A tab that does not slide, switched in place of a page pushed on, takes that page's motion over: it swipes back
    //? and leaves as the screen it replaced would, while a tab switch itself stays in place.
    if (kind === "replace" && to.entryId && to.pathRoute.pageState.transition === "none") {
      const motion = CsrSlide.#motionAt(from);
      if (motion.transition === "none") CsrSlide.#motions.delete(to.entryId);
      else CsrSlide.#motions.set(to.entryId, motion);
    }
    return isStill;
  }

  static readonly #motions = new Map<string, Pick<FramePageState, "transition" | "gesture">>();
  static #motionAt({ entryId, pathRoute: { pageState } }: Location) {
    return (
      (entryId && CsrSlide.#motions.get(entryId)) || { transition: pageState.transition, gesture: pageState.gesture }
    );
  }
  /** How an entry moves: its own page's transition, or that of the page it took the place of. */
  static motionOf(location: Location) {
    return CsrSlide.#motionAt(location).transition;
  }
  /** Whether an entry swipes back: its own page's `gesture`, or that of the page it took the place of. */
  static swipesBack(location: Location) {
    return CsrSlide.#motionAt(location).gesture;
  }
  static isStill(entryId: string | undefined) {
    return !!entryId && entryId === CsrSlide.#stillEntryId;
  }

  //? A stack can hold more than one page marked prev, such as a tab kept drawn under a page pushed on a page pushed on
  //? it; the frame draws them in stack order, so the page right under the one moving is the last, never the first.
  static #partOf(selector: string) {
    const parts = document.querySelectorAll<HTMLElement>(selector);
    return parts.length ? parts[parts.length - 1] : null;
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
      const element = changed.length ? CsrSlide.#partOf(selector) : null;
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

  //? A bar riding its page is cut where the page sliding in covers the page under, or a bar with no fill of its own
  //? would show over it: that page's bar sits a fifth of the way back, (unit - width) / 5, and its page shows on
  //? [0, unit], so the bar keeps width - unit + (unit - width) / 5 = 4/5 (width - unit) clipped off its right side.
  static underBarClip(width: number, unit: number) {
    return `inset(0px ${px(((width - unit) * 4) / 5)} 0px 0px)`;
  }

  /** What each part's style is with the page `unit` px from its place: 0 shown, the frame's width gone right. */
  static partsAt({ width, height, pageState, prevPageState }: CsrSlideFrame, unit: number): Record<string, Keyframe> {
    const progress = width > 0 ? (width - unit) / width : 1;
    const between = (prev: number, next: number) => px(lerp(prev, next, progress));
    const prevOffset = px((unit - width) / 5);
    const bottomInsetTop = (state: FramePageState) => height - state.bottomInset - state.bottomSafeArea;
    const ridesPage = pageState.navbarMotion === "page";
    const barHeight = px(Math.max(prevPageState.topInset, pageState.topInset));
    const bars: Record<string, Keyframe> = ridesPage
      ? {
          [shown("#topInsetContainer")]: { transform: `translateX(${px(unit)})` },
          [under("#topInsetContainer")]: {
            opacity: `${1 - progress / 2}`,
            transform: `translateX(${prevOffset})`,
            clipPath: CsrSlide.underBarClip(width, unit),
          },
          [shown("#topLeftActionContainer")]: { transform: `translateX(${px(unit)})` },
          [under("#topLeftActionContainer")]: { opacity: `${1 - progress}`, transform: `translateX(${prevOffset})` },
        }
      : {
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
        };
    return {
      [pageSelector]: { transform: `translateX(${px(unit)})` },
      [under("#pageContainers")]: { transform: `translateX(${prevOffset})` },
      [`${under("#pageContainers")} .akan-page-content`]: { opacity: `${1 - progress / 2}` },
      ...bars,
      [shown("#bottomInsetContainer")]: { opacity: `${progress}`, transform: `translateX(${px(unit)})` },
      [under("#bottomInsetContainer")]: { opacity: `${1 - progress}`, transform: `translateX(${prevOffset})` },
      "#topInsetContainer": {
        top: between(prevPageState.topSafeArea, pageState.topSafeArea),
        height: ridesPage ? barHeight : between(prevPageState.topInset, pageState.topInset),
      },
      "#topLeftActionContainer": {
        top: between(prevPageState.topSafeArea, pageState.topSafeArea),
        height: ridesPage ? barHeight : between(prevPageState.topInset, pageState.topInset),
        minWidth: ridesPage ? barHeight : between(prevPageState.topInset, pageState.topInset),
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
