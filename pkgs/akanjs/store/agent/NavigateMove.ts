import { csrLocation, router } from "akanjs/client";
import { PendingNavigation } from "../../client/pendingNavigation";

const routeAt = (pathname: () => string): string | null => {
  try {
    const route = router.routeOf(pathname());
    return route.length > 1 ? route.replace(/\/+$/, "") : route;
  } catch {
    return null;
  }
};

/** What one `navigate` saw on its way: the page it started from, and each move a redirect began. */
export class NavigateMove {
  readonly #from = routeAt(() => csrLocation.pathname);
  readonly #redirectsBefore = router.redirectCount();
  readonly #begun = new Set<string>();
  readonly #stop: () => void;

  constructor() {
    this.#stop = PendingNavigation.subscribe(() => {
      const target = PendingNavigation.target();
      const route = target ? routeAt(() => new URL(target).pathname) : null;
      if (route) this.#begun.add(route);
    });
  }

  stop() {
    this.#stop();
  }

  arrival(path: string): string {
    const landed = routeAt(() => csrLocation.pathname);
    const wanted = routeAt(() => new URL(path, "http://route.invalid").pathname);
    if (!landed || !wanted || landed === wanted) return `Now on ${path}.`;
    if (landed !== this.#from) return `Asked for ${path}, but the app sent the page to ${landed} instead.`;
    //? A CSR guard redirects through the router; a server's redirect begins a navigation of its own in the RSC client.
    const redirected =
      router.redirectCount() !== this.#redirectsBefore || [...this.#begun].some((route) => route !== wanted);
    return redirected
      ? `Asked for ${path}, but the app sent the page back to ${landed}, the page it was on.`
      : `Asked for ${path}, but the page stayed on ${landed}: the move did not land.`;
  }
}
