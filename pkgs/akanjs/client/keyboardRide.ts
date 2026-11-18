import { nativeKeyboardEasing } from "./device";

const RIDE_SELECTOR = "[data-akan-keyboard-ride]";
const OVERLAY_SELECTOR = "[data-akan-keyboard-overlay]";
const END_SLACK_PX = 2;

const GLIDE_ATTRIBUTE = "data-akan-keyboard-glide";

const bottomOf = (element: HTMLElement) => element.getBoundingClientRect().bottom;
const topOf = (element: HTMLElement) => element.getBoundingClientRect().top;
//? A chat list laid out from its bottom (`flex-direction: column-reverse`) scrolls from 0 at its end to negative values.
const isReversed = (scroller: HTMLElement) => getComputedStyle(scroller).flexDirection === "column-reverse";
const isAtEnd = (scroller: HTMLElement) =>
  isReversed(scroller)
    ? Math.abs(scroller.scrollTop) <= END_SLACK_PX
    : scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= END_SLACK_PX;
const endOf = (scroller: HTMLElement) => (isReversed(scroller) ? 0 : scroller.scrollHeight - scroller.clientHeight);
const isInset = (rider: HTMLElement) => rider.dataset.akanKeyboardRide === "inset";
const untypedInputs = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
const isTyped = (field: HTMLElement) =>
  field.isContentEditable ||
  field instanceof HTMLTextAreaElement ||
  (field instanceof HTMLInputElement && !untypedInputs.has(field.type));
const KEPT_HEIGHT_KEY = "akan:keyboard-height";

/**
 * Moves the page with a phone keyboard the shell left to it. A layout change on every frame drops frames on a phone, so
 * the layout changes once and what is marked `data-akan-keyboard-ride` travels the way there as a transform, which
 * WebKit hands to Core Animation. A scroller resting at its end stays there, as a chat list does.
 *
 * By default the page box ends at the keys (`--akan-keyboard-cover`): keys coming up hold the old box until they are
 * up, since the shorter box would clip a rider still on its way, and keys going down give the taller box at once while
 * the riders start from where they were drawn. When the focused field sits in `data-akan-keyboard-overlay`, the page
 * keeps the whole screen, as a native chat screen does, so what lies under the glass keys stays drawn: the riders go
 * where the shorter box would put them and stay there. An `inset` rider (a list's content) rises as far as the rider
 * holding the focused field and takes that rise as bottom padding at once, so the list still scrolls to its top, and a
 * list resting at its end scrolls the rise with the keys, and back down with them. While it does, its scroller carries
 * `data-akan-keyboard-glide`: a list's own keep-at-end logic yields to it. A list too short to scroll that far moves
 * the rest as a transform on the keys' curve, which a short list's layer affords.
 */
export class KeyboardRide {
  static #committed = 0;
  static #target = 0;
  static #isOverlay = false;
  static #timer: ReturnType<typeof setTimeout> | null = null;
  static #insets = new Map<HTMLElement, { paddingBottom: string; base: string; rise: number }>();
  static #glides = new Map<HTMLElement, number>();
  static #carried = new Set<HTMLElement>();
  static #caret: { field: HTMLElement; color: string } | null = null;
  static #movedAt = 0;
  static #measured = new WeakMap<HTMLElement, { height: number; laid: number; settled: number }>();
  static #kept: number | null = null;
  static #isWatching = false;

  static watchFocus() {
    if (KeyboardRide.#isWatching) return;
    KeyboardRide.#isWatching = true;
    document.addEventListener("focusin", (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement) || !isTyped(field)) return;
      //? After the page's own focus handlers laid it out; the shell reports the keys a frame or more later.
      setTimeout(() => KeyboardRide.#prepare(field), 0);
    });
  }

  static move(height: number, durationMs: number) {
    if (height === KeyboardRide.#target) return;
    KeyboardRide.#movedAt = performance.now();
    KeyboardRide.#target = height;
    const root = document.documentElement;
    if (durationMs > 0) {
      root.style.setProperty("--akan-keyboard-duration", `${durationMs}ms`);
      root.style.setProperty("--akan-keyboard-easing", nativeKeyboardEasing());
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

    const shown = KeyboardRide.#shown();
    //? WebKit on iOS drew no frame for the whole ride while it carried a long list as a transform; a scroll it draws.
    const lists = isOverlay ? shown.filter(isInset) : [];
    const riders = shown.filter((rider) => !lists.includes(rider));
    KeyboardRide.#stopGlides();
    const listEnds = lists.map((list) => KeyboardRide.#scrollersAtEnd([list]).at(0) ?? null);
    //? An inset rider's box reaches past what it shows by the padding it took for the rise; it was drawn that much higher.
    const drawn = riders.map((rider) => bottomOf(rider) - (KeyboardRide.#insets.get(rider)?.rise ?? 0));
    for (const rider of riders) {
      rider.style.transition = "none";
      rider.style.transform = "";
    }
    KeyboardRide.#releaseInsets(lists);
    const listBoxes = lists.map((list) => KeyboardRide.#scrollerOf(list) ?? list);
    const previous = KeyboardRide.#committed;
    const isHeld = !isOverlay && height > previous;
    const active = document.activeElement;
    const lead = riders.findIndex((rider) => !!active && rider.contains(active));
    const isRising = isOverlay && height > 0;
    const known = isRising && (lead >= 0 || !lists.length) ? KeyboardRide.#knownOf(riders, height) : null;
    const { settled, laid, listsSettled } =
      known ?? KeyboardRide.#measure({ riders, listBoxes, height, previous, isHeld, isOverlay });
    if (isRising && !known) KeyboardRide.#remember(riders, height, laid, settled);
    if (height > 0) KeyboardRide.#keep(height);
    //? A list keeps its distance to the field it sits above; its own box can run on under a bar the keys cover.
    const leadRise = lead < 0 ? null : (laid[lead] ?? 0) - (settled[lead] ?? 0);
    //? WebKit on iOS draws the caret where a transitioned field lands, ahead of the field, until the field gets there.
    KeyboardRide.#hideCaret(lead >= 0 && active instanceof HTMLElement ? active : null);
    lists.forEach((list, idx) => {
      const scroller = listEnds[idx] ?? null;
      const rise = leadRise ?? bottomOf(listBoxes[idx] ?? list) - (listsSettled[idx] ?? 0);
      if (height > 0) KeyboardRide.#raiseList(list, rise, scroller, durationMs);
      else KeyboardRide.#lowerList(list, scroller, durationMs);
    });
    riders.forEach((rider, idx) => {
      rider.style.transform = `translateY(${drawn[idx] - laid[idx]}px)`;
    });
    void root.offsetHeight;
    //? The keys set off when the report arrived; the measuring above took a whole layout of the page per commit, so the
    //? riders start that far along rather than trailing the keys by it.
    const transition = KeyboardRide.#transitionOf(durationMs);
    riders.forEach((rider, idx) => {
      rider.style.transition = transition;
      rider.style.transform = `translateY(${settled[idx] - laid[idx]}px)`;
    });
    KeyboardRide.#timer = setTimeout(() => {
      KeyboardRide.#timer = null;
      if (isHeld) KeyboardRide.#commit(height, KeyboardRide.#scrollersAtEnd(riders));
      const settling = isOverlay && height > 0 ? [] : riders;
      for (const rider of settling) {
        rider.style.transition = "none";
        rider.style.transform = "";
      }
      void root.offsetHeight;
      for (const rider of settling) rider.style.transition = "";
      for (const list of KeyboardRide.#carried) list.style.transition = "";
      KeyboardRide.#carried.clear();
      KeyboardRide.#showCaret();
    }, durationMs);
  }

  static #shown() {
    return [...document.querySelectorAll<HTMLElement>(RIDE_SELECTOR)].filter(
      (element) => element.getClientRects().length > 0,
    );
  }

  static #measure({
    riders,
    listBoxes,
    height,
    previous,
    isHeld,
    isOverlay,
  }: {
    riders: HTMLElement[];
    listBoxes: HTMLElement[];
    height: number;
    previous: number;
    isHeld: boolean;
    isOverlay: boolean;
  }) {
    //? A list rises by what its scroller loses at the bottom, read without scrolling it: two programmatic scrolls in a
    //? layout pass left WebKit on iOS restoring a stale offset on the next frame, a jump of the whole list.
    const scrollers = KeyboardRide.#scrollersAtEnd(riders);
    KeyboardRide.#commit(height, scrollers);
    const settled = riders.map(bottomOf);
    const listsSettled = listBoxes.map(bottomOf);
    if (isHeld || isOverlay) KeyboardRide.#commit(isOverlay ? 0 : previous, scrollers);
    const laid = isHeld || isOverlay ? riders.map(bottomOf) : settled;
    return { settled, laid, listsSettled };
  }

  static #knownOf(riders: HTMLElement[], height: number) {
    if (!riders.length) return null;
    const laid = riders.map(bottomOf);
    const settled: number[] = [];
    for (const [idx, rider] of riders.entries()) {
      const known = KeyboardRide.#measured.get(rider);
      if (!known || known.height !== height || Math.abs(known.laid - (laid[idx] ?? 0)) > 0.5) return null;
      settled.push(known.settled);
    }
    return { settled, laid, listsSettled: [] as number[] };
  }

  static #remember(riders: HTMLElement[], height: number, laid: number[], settled: number[]) {
    for (const [idx, rider] of riders.entries())
      KeyboardRide.#measured.set(rider, { height, laid: laid[idx] ?? 0, settled: settled[idx] ?? 0 });
  }

  static #prepare(field: HTMLElement) {
    const height = KeyboardRide.#keptHeight();
    if (!height || KeyboardRide.#target > 0 || KeyboardRide.#timer || document.activeElement !== field) return;
    if (!field.closest(OVERLAY_SELECTOR)) return;
    const riders = KeyboardRide.#shown().filter((rider) => !isInset(rider));
    if (!riders.some((rider) => rider.contains(field))) return;
    const root = document.documentElement;
    root.toggleAttribute("data-akan-keyboard", true);
    root.toggleAttribute("data-akan-keyboard-overlay", true);
    if (!KeyboardRide.#knownOf(riders, height)) {
      const { settled, laid } = KeyboardRide.#measure({
        riders,
        listBoxes: [],
        height,
        previous: 0,
        isHeld: false,
        isOverlay: true,
      });
      KeyboardRide.#remember(riders, height, laid, settled);
    }
    root.toggleAttribute("data-akan-keyboard", false);
    root.toggleAttribute("data-akan-keyboard-overlay", false);
  }

  //? Kept across launches: the first field an app opens on would otherwise wait for a whole page layout behind the keys.
  static #keep(height: number) {
    if (height === KeyboardRide.#kept) return;
    KeyboardRide.#kept = height;
    try {
      localStorage.setItem(KEPT_HEIGHT_KEY, String(height));
    } catch {}
  }

  static #keptHeight() {
    if (KeyboardRide.#kept === null)
      try {
        KeyboardRide.#kept = Number(localStorage.getItem(KEPT_HEIGHT_KEY)) || 0;
      } catch {
        KeyboardRide.#kept = 0;
      }
    return KeyboardRide.#kept;
  }

  static #hideCaret(field: HTMLElement | null) {
    if (KeyboardRide.#caret?.field !== field) KeyboardRide.#showCaret();
    if (!field || KeyboardRide.#caret) return;
    KeyboardRide.#caret = { field, color: field.style.caretColor };
    field.style.caretColor = "transparent";
  }

  static #showCaret() {
    if (!KeyboardRide.#caret) return;
    KeyboardRide.#caret.field.style.caretColor = KeyboardRide.#caret.color;
    KeyboardRide.#caret = null;
  }

  static #transitionOf(durationMs: number) {
    const late = Math.round(performance.now() - KeyboardRide.#movedAt);
    return `transform ${durationMs}ms ${nativeKeyboardEasing()} ${late > 0 ? -late : 0}ms`;
  }

  static #drawnTopOf(list: HTMLElement) {
    const top = topOf(list);
    if (list.style.transform) {
      list.style.transition = "none";
      list.style.transform = "";
    }
    return top;
  }

  static #carry(list: HTMLElement, offset: number, durationMs: number) {
    if (!(Math.abs(offset) >= 0.5) || durationMs <= 0) return;
    list.style.transition = "none";
    list.style.transform = `translateY(${offset}px)`;
    void list.offsetHeight;
    list.style.transition = KeyboardRide.#transitionOf(durationMs);
    list.style.transform = "";
    KeyboardRide.#carried.add(list);
  }

  static #commit(height: number, scrollers: HTMLElement[]) {
    const root = document.documentElement;
    root.style.setProperty("--akan-keyboard-cover", `${height}px`);
    root.toggleAttribute("data-akan-keyboard-layout", height > 0);
    KeyboardRide.#committed = height;
    for (const scroller of scrollers) scroller.scrollTop = endOf(scroller);
  }

  //? The list grows by the rise at its end at once, so it still scrolls to its top, and one resting there follows it.
  static #raiseList(list: HTMLElement, rise: number, scroller: HTMLElement | null, durationMs: number) {
    const held = KeyboardRide.#insets.get(list);
    const base = held?.base ?? getComputedStyle(list).paddingBottom;
    if (rise <= 0) return;
    const drawnTop = KeyboardRide.#drawnTopOf(list);
    KeyboardRide.#insets.set(list, { paddingBottom: held?.paddingBottom ?? list.style.paddingBottom, base, rise });
    list.style.paddingBottom = `calc(${base} + ${rise}px)`;
    const outer = KeyboardRide.#scrollerOf(list);
    //? A reversed list rests on its bottom edge, so the padding lifted it at once; it goes back to where it was drawn.
    if (outer && isReversed(outer)) outer.scrollTop -= rise - (held?.rise ?? 0);
    KeyboardRide.#carry(list, drawnTop - topOf(list), durationMs);
    if (scroller) KeyboardRide.#glide(scroller, endOf(scroller), durationMs);
  }

  static #lowerList(list: HTMLElement, scroller: HTMLElement | null, durationMs: number) {
    const held = KeyboardRide.#insets.get(list);
    if (!held) return;
    const outer = KeyboardRide.#scrollerOf(list);
    const release = () => {
      list.style.paddingBottom = held.paddingBottom;
      KeyboardRide.#insets.delete(list);
      if (outer && isReversed(outer)) outer.scrollTop += held.rise;
    };
    if (!scroller || (isReversed(scroller) && scroller.scrollHeight - scroller.clientHeight < held.rise)) {
      const drawnTop = KeyboardRide.#drawnTopOf(list);
      release();
      return KeyboardRide.#carry(list, drawnTop - topOf(list), durationMs);
    }
    const to = isReversed(scroller) ? -held.rise : Math.max(0, scroller.scrollTop - held.rise);
    KeyboardRide.#glide(scroller, to, durationMs, release);
  }

  static #releaseInsets(kept: HTMLElement[]) {
    for (const [rider, { paddingBottom }] of KeyboardRide.#insets) {
      if (kept.includes(rider)) continue;
      rider.style.paddingBottom = paddingBottom;
      KeyboardRide.#insets.delete(rider);
    }
  }

  static #glide(scroller: HTMLElement, to: number, durationMs: number, done?: () => void) {
    const from = scroller.scrollTop;
    scroller.setAttribute(GLIDE_ATTRIBUTE, "");
    const ease = KeyboardRide.#easeOf(nativeKeyboardEasing());
    const startedAt = KeyboardRide.#movedAt;
    const step = (now: number) => {
      const progress = durationMs > 0 ? Math.min(1, (now - startedAt) / durationMs) : 1;
      scroller.scrollTop = from + (to - from) * ease(progress);
      if (progress < 1) {
        KeyboardRide.#glides.set(scroller, requestAnimationFrame(step));
        return;
      }
      KeyboardRide.#glides.delete(scroller);
      done?.();
      scroller.removeAttribute(GLIDE_ATTRIBUTE);
    };
    KeyboardRide.#glides.set(scroller, requestAnimationFrame(step));
  }

  static #stopGlides() {
    for (const [scroller, frame] of KeyboardRide.#glides) {
      cancelAnimationFrame(frame);
      scroller.removeAttribute(GLIDE_ATTRIBUTE);
    }
    KeyboardRide.#glides.clear();
  }

  //? The keys' own curve, a CSS cubic-bezier, solved for x by bisection so the scroll keeps pace with them.
  static #easeOf(easing: string) {
    const parsed = easing
      .replace(/^cubic-bezier\(|\)$/g, "")
      .split(",")
      .map(Number);
    const [x1, y1, x2, y2] = parsed.length === 4 && parsed.every(Number.isFinite) ? parsed : [0.25, 0.1, 0.25, 1];
    const curve = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
    return (progress: number) => {
      let low = 0;
      let high = 1;
      let t = progress;
      for (let step = 0; step < 24; step++) {
        const x = curve(x1, x2, t);
        if (Math.abs(x - progress) < 1e-4) break;
        if (x < progress) low = t;
        else high = t;
        t = (low + high) / 2;
      }
      return curve(y1, y2, t);
    };
  }

  static #scrollerOf(rider: HTMLElement) {
    for (let element = rider.parentElement; element; element = element.parentElement) {
      const { overflowY } = getComputedStyle(element);
      if (overflowY === "auto" || overflowY === "scroll") return element;
    }
    return null;
  }

  static #scrollersAtEnd(riders: HTMLElement[]) {
    const scrollers = new Set<HTMLElement>();
    for (const rider of riders) {
      const scroller = KeyboardRide.#scrollerOf(rider);
      if (scroller && isAtEnd(scroller)) scrollers.add(scroller);
    }
    return [...scrollers];
  }
}
