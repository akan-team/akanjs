import { ScreenReader } from "./ScreenReader";

const containerAttrs = ["data-agent-zone", "data-agent-scope", "data-agent-skip"] as const;
const controlAttrs = ["data-akan-action", "data-akan-state"] as const;
const headingSelector = "h1, h2, h3, h4, h5, h6";
const nameCap = 40;

/** Resolves an on-screen name to a visible element. Only headings match loosely: a loose control match is unsafe. */
export class ScreenTarget {
  static container(name: string, root?: HTMLElement | null): HTMLElement | null {
    const scope = root ?? ScreenTarget.#body();
    if (!scope || !name) return null;
    if (ScreenTarget.#named(scope, containerAttrs, name)) return scope;
    const escaped = CSS.escape(name);
    const selector = containerAttrs.map((attr) => `[${attr}="${escaped}"]`).join(", ");
    // Compared, not selected: an id holding a space escapes to a selector some engines reject with a throw.
    return (
      ScreenTarget.#first(scope, selector) ??
      [...scope.querySelectorAll<HTMLElement>("[id]")].find((el) => el.id === name && ScreenTarget.visible(el)) ??
      null
    );
  }

  static control(name: string, root?: HTMLElement | null): HTMLElement | null {
    return ScreenTarget.controls(name, root)[0] ?? null;
  }

  static controls(name: string, root?: HTMLElement | null): HTMLElement[] {
    const scope = root ?? ScreenTarget.#body();
    if (!scope || !name) return [];
    const escaped = CSS.escape(name);
    const selector = controlAttrs.map((attr) => `[${attr}="${escaped}"]`).join(", ");
    return [...scope.querySelectorAll<HTMLElement>(selector)].filter(ScreenTarget.visible);
  }

  /** Matched on letters and digits only, so a slug written for a heading still finds it. */
  static heading(text: string, root?: HTMLElement | null): HTMLElement | null {
    const scope = root ?? ScreenTarget.#body();
    const wanted = ScreenTarget.#slug(text);
    if (!scope || !wanted) return null;
    const headings = [...scope.querySelectorAll<HTMLElement>(headingSelector)].filter(ScreenTarget.visible);
    return (
      headings.find((heading) => ScreenTarget.#slug(heading.textContent ?? "") === wanted) ??
      headings.find((heading) => ScreenTarget.#slug(heading.textContent ?? "").includes(wanted)) ??
      null
    );
  }

  static find(name: string, root?: HTMLElement | null): HTMLElement | null {
    return ScreenTarget.control(name, root) ?? ScreenTarget.container(name, root) ?? ScreenTarget.heading(name, root);
  }

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
      const anchor = ScreenTarget.visible(heading) ? ScreenReader.anchorOf(heading) : "";
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
        const value = ScreenTarget.visible(el) ? el.getAttribute(attr) : null;
        if (value) names.add(value);
      }
    }
    return [...names].slice(0, nameCap);
  }

  static #named(el: HTMLElement, attrs: readonly string[], name: string) {
    return attrs.some((attr) => el.getAttribute(attr) === name);
  }

  static #first(scope: HTMLElement, selector: string) {
    return [...scope.querySelectorAll<HTMLElement>(selector)].find(ScreenTarget.visible) ?? null;
  }

  static visible(el: HTMLElement) {
    if (el.closest('[hidden], [aria-hidden="true"], [inert], [data-agent-ui]')) return false;
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
