//? UIKit moves the keyboard on its private curve 7; this is the cubic-bezier it is usually fitted with.
export const IOS_KEYBOARD_ANIMATION_EASING = "cubic-bezier(0.38, 0.7, 0.125, 1)";

const RIDE_SELECTOR = "[data-akan-keyboard-ride]";
const END_SLACK_PX = 2;

const bottomOf = (element: HTMLElement) => element.getBoundingClientRect().bottom;

/**
 * Moves the page with an iOS keyboard the shell left to it. A layout change on every frame drops frames on a phone, so
 * the page box (`--akan-keyboard-cover`) changes once and what is marked `data-akan-keyboard-ride` travels the way
 * there as a transform, which WebKit hands to Core Animation. Keys coming up hold the old box until they are up, since
 * the new, shorter box would clip a rider still on its way; keys going down give the taller box at once and the riders
 * start from where they were drawn. A scroller resting at its end stays there, as a chat list does.
 */
export class KeyboardRide {
  static #committed = 0;
  static #target = 0;
  static #timer: ReturnType<typeof setTimeout> | null = null;

  static move(height: number, durationMs: number) {
    if (height === KeyboardRide.#target) return;
    KeyboardRide.#target = height;
    const root = document.documentElement;
    if (durationMs > 0) {
      root.style.setProperty("--akan-keyboard-duration", `${durationMs}ms`);
      root.style.setProperty("--akan-keyboard-easing", IOS_KEYBOARD_ANIMATION_EASING);
    }
    root.toggleAttribute("data-akan-keyboard", height > 0);
    if (KeyboardRide.#timer) clearTimeout(KeyboardRide.#timer);
    KeyboardRide.#timer = null;

    const riders = [...document.querySelectorAll<HTMLElement>(RIDE_SELECTOR)].filter(
      (element) => element.getClientRects().length > 0,
    );
    const drawn = riders.map(bottomOf);
    for (const rider of riders) {
      rider.style.transition = "none";
      rider.style.transform = "";
    }
    const scrollers = KeyboardRide.#scrollersAtEnd(riders);
    const previous = KeyboardRide.#committed;
    const isRising = height > previous;
    KeyboardRide.#commit(height, scrollers);
    const settled = riders.map(bottomOf);
    if (isRising) KeyboardRide.#commit(previous, scrollers);
    const laid = isRising ? riders.map(bottomOf) : settled;
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
      if (isRising) KeyboardRide.#commit(height, KeyboardRide.#scrollersAtEnd(riders));
      for (const rider of riders) {
        rider.style.transition = "none";
        rider.style.transform = "";
      }
      void root.offsetHeight;
      for (const rider of riders) rider.style.transition = "";
    }, durationMs);
  }

  static #commit(height: number, scrollers: HTMLElement[]) {
    const root = document.documentElement;
    root.style.setProperty("--akan-keyboard-cover", `${height}px`);
    root.toggleAttribute("data-akan-keyboard-layout", height > 0);
    KeyboardRide.#committed = height;
    for (const scroller of scrollers) scroller.scrollTop = scroller.scrollHeight;
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
