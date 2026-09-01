import { ScreenReader } from "./ScreenReader";

const containerAttrs = ["data-agent-zone", "data-agent-scope", "data-agent-skip"] as const;
const controlAttrs = ["data-akan-action", "data-akan-state"] as const;
const headingSelector = "h1, h2, h3, h4, h5, h6";
const nameCap = 40;

/**
 * Resolves a name the agent read on screen to the element it names.
 *
 * Four vocabularies, every one of them something already on the screen rather than a selector the model invented:
 * the `data-akan-action` / `data-akan-state` annotation a control carries and `readScreen` prints beside it, a
 * container — an `Agent.Zone`, a `useScreenScope` scope, or an `Agent.Skip` region named by the marker left in its
 * place — a plain element id, what a docs slide is addressed by, and, last, a **heading by its own text**.
 *
 * A heading is matched on letters and digits alone, so the slug an agent naturally writes for a heading it read
 * ("images-and-public-env") finds "Images And Public Env". That tolerance is for headings only: a heading is a
 * landmark and scrolling to the wrong one costs nothing, while two buttons reading "Save" are not the same control
 * and matching a *control* by its label would drive the wrong one.
 *
 * Nothing hidden ever resolves, by the same rule `readScreen` skips it. A collapsed panel or an off-variant
 * duplicate is not what the user is looking at, and scrolling to one flashes a ring nobody can see — which reads
 * as the tool being broken rather than as a miss. A `display: contents` wrapper does not resolve either, even
 * though the reader now reads through it: it has no box, so `scrollIntoView` has nothing to scroll to.
 */
export class ScreenTarget {
  static container(name: string, root?: HTMLElement | null): HTMLElement | null {
    const scope = root ?? ScreenTarget.#body();
    if (!scope || !name) return null;
    if (ScreenTarget.#named(scope, containerAttrs, name)) return scope;
    const escaped = CSS.escape(name);
    const selector = containerAttrs.map((attr) => `[${attr}="${escaped}"]`).join(", ");
    // The id is compared rather than selected: `section` carries whatever the agent read on screen, and a name
    // holding a space escapes to a `#site\ footer` selector that some engines reject outright — a throw where a
    // miss belongs, since `readScreen` owes the model the list of sections that do exist.
    return (
      ScreenTarget.#first(scope, selector) ??
      [...scope.querySelectorAll<HTMLElement>("[id]")].find((el) => el.id === name && ScreenTarget.#visible(el)) ??
      null
    );
  }

  static control(name: string, root?: HTMLElement | null): HTMLElement | null {
    const scope = root ?? ScreenTarget.#body();
    if (!scope || !name) return null;
    const escaped = CSS.escape(name);
    return ScreenTarget.#first(scope, controlAttrs.map((attr) => `[${attr}="${escaped}"]`).join(", "));
  }

  /** Matched on letters and digits only, so a slug written for a heading still finds it. */
  static heading(text: string, root?: HTMLElement | null): HTMLElement | null {
    const scope = root ?? ScreenTarget.#body();
    const wanted = ScreenTarget.#slug(text);
    if (!scope || !wanted) return null;
    const headings = [...scope.querySelectorAll<HTMLElement>(headingSelector)].filter(ScreenTarget.#visible);
    return (
      headings.find((heading) => ScreenTarget.#slug(heading.textContent ?? "") === wanted) ??
      headings.find((heading) => ScreenTarget.#slug(heading.textContent ?? "").includes(wanted)) ??
      null
    );
  }

  /** A control first — an annotated button is the most specific match — then a container, then a heading. */
  static find(name: string, root?: HTMLElement | null): HTMLElement | null {
    return ScreenTarget.control(name, root) ?? ScreenTarget.container(name, root) ?? ScreenTarget.heading(name, root);
  }

  /**
   * The names a refusal can honestly offer for a region: the scope paths, plus every heading anchor on screen.
   * Leaving the anchors out is what let a page of twenty named sections answer "nothing carries a name".
   */
  static containerNames(root?: HTMLElement | null): string[] {
    return [...new Set([...ScreenTarget.#names(containerAttrs, root), ...ScreenTarget.anchorNames(root)])].slice(
      0,
      nameCap,
    );
  }

  static anchorNames(root?: HTMLElement | null): string[] {
    const scope = root ?? ScreenTarget.#body();
    if (!scope) return [];
    const names = new Set<string>();
    for (const heading of scope.querySelectorAll<HTMLElement>(headingSelector)) {
      const anchor = ScreenTarget.#visible(heading) ? ScreenReader.anchorOf(heading) : "";
      if (anchor) names.add(anchor);
    }
    return [...names];
  }

  static targetNames(root?: HTMLElement | null): string[] {
    return [...new Set([...ScreenTarget.#names(controlAttrs, root), ...ScreenTarget.containerNames(root)])].slice(
      0,
      nameCap,
    );
  }

  static #names(attrs: readonly string[], root?: HTMLElement | null): string[] {
    const scope = root ?? ScreenTarget.#body();
    if (!scope) return [];
    const names = new Set<string>();
    for (const attr of attrs) {
      const own = scope.getAttribute(attr);
      if (own) names.add(own);
      for (const el of scope.querySelectorAll<HTMLElement>(`[${attr}]`)) {
        const value = ScreenTarget.#visible(el) ? el.getAttribute(attr) : null;
        if (value) names.add(value);
      }
    }
    return [...names].slice(0, nameCap);
  }

  static #named(el: HTMLElement, attrs: readonly string[], name: string) {
    return attrs.some((attr) => el.getAttribute(attr) === name);
  }

  static #first(scope: HTMLElement, selector: string) {
    return [...scope.querySelectorAll<HTMLElement>(selector)].find(ScreenTarget.#visible) ?? null;
  }

  static #visible(el: HTMLElement) {
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
    if (el.closest("[data-agent-ui]")) return false;
    return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
  }

  static #slug(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  static #body(): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return document.body ?? document.documentElement;
  }
}
