interface OpenSurface {
  close: () => void;
  takesBack: boolean;
}

/**
 * The surfaces open on the page (dialogs, sheets, confirms), newest last. Escape and an app's back button close the
 * newest one only: per-component listeners would all hear one key and close nested surfaces together.
 */
export class OpenSurfaces {
  static readonly #stack: OpenSurface[] = [];
  static readonly #listeners = new Set<() => void>();

  //? `takesBack: false` for a hint that shows by itself (a tooltip on a focused button): a tap focuses the button on
  //? Android, so its tooltip would otherwise swallow the next back press and keep back from the system.
  static open(close: () => void, { takesBack = true }: { takesBack?: boolean } = {}) {
    const surface: OpenSurface = { close, takesBack };
    OpenSurfaces.#stack.push(surface);
    if (OpenSurfaces.#stack.length === 1) window.addEventListener("keydown", OpenSurfaces.#onKeyDown);
    OpenSurfaces.#notify();
    return () => {
      const index = OpenSurfaces.#stack.lastIndexOf(surface);
      if (index !== -1) OpenSurfaces.#stack.splice(index, 1);
      if (OpenSurfaces.#stack.length === 0) window.removeEventListener("keydown", OpenSurfaces.#onKeyDown);
      OpenSurfaces.#notify();
    };
  }

  static closeForBack() {
    const newest = OpenSurfaces.#stack.findLast((surface) => surface.takesBack);
    newest?.close();
    return !!newest;
  }

  static takesBack() {
    return OpenSurfaces.#stack.some((surface) => surface.takesBack);
  }

  static listen(listener: () => void) {
    OpenSurfaces.#listeners.add(listener);
    return () => {
      OpenSurfaces.#listeners.delete(listener);
    };
  }

  static #notify() {
    for (const listener of OpenSurfaces.#listeners) listener();
  }

  static #onKeyDown = (event: KeyboardEvent) => {
    const newest = OpenSurfaces.#stack.at(-1);
    if (event.key !== "Escape" || event.defaultPrevented || !newest) return;
    event.preventDefault();
    newest.close();
  };
}
