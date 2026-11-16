import { IOS_KEYBOARD_ANIMATION_EASING } from "./device";

const RIDE_SELECTOR = "[data-akan-keyboard-ride]";
const OVERLAY_SELECTOR = "[data-akan-keyboard-overlay]";
const END_SLACK_PX = 2;

const bottomOf = (element: HTMLElement) => element.getBoundingClientRect().bottom;
const isInset = (rider: HTMLElement) => rider.dataset.akanKeyboardRide === "inset";

/**
 * Moves the page with an iOS keyboard the shell left to it. A layout change on every frame drops frames on a phone, so
 * the layout changes once and what is marked `data-akan-keyboard-ride` travels the way there as a transform, which
 * WebKit hands to Core Animation. A scroller resting at its end stays there, as a chat list does.
 *
 * By default the page box ends at the keys (`--akan-keyboard-cover`): keys coming up hold the old box until they are
 * up, since the shorter box would clip a rider still on its way, and keys going down give the taller box at once while
 * the riders start from where they were drawn. When the focused field sits in `data-akan-keyboard-overlay`, the page
 * keeps the whole screen, as a native chat screen does, so what lies under the glass keys stays drawn: the riders go
 * where the shorter box would put them and stay there, and an `inset` rider (a list's content) trades its transform
 * for bottom padding once the keys are up, so the list still scrolls to its top.
 */
export class KeyboardRide {
  static #committed = 0;
  static #target = 0;
  static #isOverlay = false;
  static #timer: ReturnType<typeof setTimeout> | null = null;
  static #insets = new Map<HTMLElement, { paddingBottom: string; rise: number }>();

  static move(height: number, durationMs: number) {
    if (height === KeyboardRide.#target) return;
    KeyboardRide.#target = height;
    const root = document.documentElement;
    if (durationMs > 0) {
      root.style.setProperty("--akan-keyboard-duration", `${durationMs}ms`);
      root.style.setProperty("--akan-keyboard-easing", IOS_KEYBOARD_ANIMATION_EASING);
    }
    const isOverlay =
      height > 0
        ? document.activeElement instanceof Element && !!document.activeElement.closest(OVERLAY_SELECTOR)
        : KeyboardRide.#isOverlay;
    KeyboardRide.#isOverlay = height > 0 && isOverlay;
    root.toggleAttribute("data-akan-keyboard", height > 0);
    root.toggleAttribute("data-akan-keyboard-overlay", KeyboardRide.#isOverlay);
    if (KeyboardRide.#timer) clearTimeout(KeyboardRide.#timer);
    KeyboardRide.#timer = null;

    const riders = [...document.querySelectorAll<HTMLElement>(RIDE_SELECTOR)].filter(
      (element) => element.getClientRects().length > 0,
    );
    //? An inset rider's box reaches past what it shows by the padding it took for the rise; it was drawn that much higher.
    const drawn = riders.map((rider) => bottomOf(rider) - (KeyboardRide.#insets.get(rider)?.rise ?? 0));
    for (const rider of riders) {
      rider.style.transition = "none";
      rider.style.transform = "";
    }
    KeyboardRide.#releaseInsets();
    const scrollers = KeyboardRide.#scrollersAtEnd(riders);
    const previous = KeyboardRide.#committed;
    const isHeld = !isOverlay && height > previous;
    KeyboardRide.#commit(height, scrollers);
    const settled = riders.map(bottomOf);
    if (isHeld || isOverlay) KeyboardRide.#commit(isOverlay ? 0 : previous, scrollers);
    const laid = isHeld || isOverlay ? riders.map(bottomOf) : settled;
    riders.forEach((rider, idx) => {
      rider.style.transform = `translateY(${drawn[idx] - laid[idx]}px)`;
    });
    void root.offsetHeight;
    const transition = `transform ${durationMs}ms ${IOS_KEYBOARD_ANIMATION_EASING}`;
    riders.forEach((rider, idx) => {
      rider.style.transition = transition;
      rider.style.transform = `translateY(${settled[idx] - laid[idx]}px)`;
    });
    KeyboardRide.#timer = setTimeout(() => {
      KeyboardRide.#timer = null;
      if (isHeld) KeyboardRide.#commit(height, KeyboardRide.#scrollersAtEnd(riders));
      const isKept = isOverlay && height > 0;
      if (isKept) KeyboardRide.#holdInsets(riders, settled, laid);
      const settling = riders.filter((rider) => !isKept || isInset(rider));
      for (const rider of settling) {
        rider.style.transition = "none";
        rider.style.transform = "";
      }
      void root.offsetHeight;
      for (const rider of settling) rider.style.transition = "";
    }, durationMs);
  }

  static #commit(height: number, scrollers: HTMLElement[]) {
    const root = document.documentElement;
    root.style.setProperty("--akan-keyboard-cover", `${height}px`);
    root.toggleAttribute("data-akan-keyboard-layout", height > 0);
    KeyboardRide.#committed = height;
    for (const scroller of scrollers) scroller.scrollTop = scroller.scrollHeight;
  }

  //? The list grows by the rise at its end and scrolls there, which draws it where the transform had carried it.
  static #holdInsets(riders: HTMLElement[], settled: number[], laid: number[]) {
    const scrollers = KeyboardRide.#scrollersAtEnd(riders.filter(isInset));
    riders.forEach((rider, idx) => {
      const rise = laid[idx] - settled[idx];
      if (!isInset(rider) || rise <= 0) return;
      KeyboardRide.#insets.set(rider, { paddingBottom: rider.style.paddingBottom, rise });
      rider.style.paddingBottom = `calc(${getComputedStyle(rider).paddingBottom} + ${rise}px)`;
    });
    for (const scroller of scrollers) scroller.scrollTop = scroller.scrollHeight;
  }

  static #releaseInsets() {
    for (const [rider, { paddingBottom }] of KeyboardRide.#insets) rider.style.paddingBottom = paddingBottom;
    KeyboardRide.#insets.clear();
  }

  static #scrollersAtEnd(riders: HTMLElement[]) {
    const scrollers = new Set<HTMLElement>();
    for (const rider of riders) {
      for (let element = rider.parentElement; element; element = element.parentElement) {
        const { overflowY } = getComputedStyle(element);
        if (overflowY !== "auto" && overflowY !== "scroll") continue;
        if (element.scrollHeight - element.scrollTop - element.clientHeight <= END_SLACK_PX) scrollers.add(element);
        break;
      }
    }
    return [...scrollers];
  }
}
