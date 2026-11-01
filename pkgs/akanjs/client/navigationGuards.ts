import { Logger } from "akanjs/common";

export type NavigationKind = "push" | "replace" | "back" | "pop";

export interface NavigationAttempt {
  /** `pop` is the browser's back or forward; `back` is `router.back()`, a native back button or a swipe. */
  kind: NavigationKind;
  /** The route on screen, without its locale and basePath, as `/docs/1?tab=a`. */
  from: string;
  /** Where it goes, written the same way; `null` for `back`, whose entry is not known until it arrives. */
  to: string | null;
}

/** Answers `false` to keep the page; a guard that throws or rejects keeps it too. */
export type NavigationGuard = (navigation: NavigationAttempt) => boolean | Promise<boolean>;

export class NavigationRefused extends Error {
  constructor(navigation: NavigationAttempt) {
    super(`A navigation guard kept ${navigation.from} instead of moving to ${navigation.to ?? "the previous page"}`);
    this.name = "NavigationRefused";
  }
}

export class NavigationGuards {
  #guards = new Set<NavigationGuard>();
  #isDeciding: boolean = false;

  get size() {
    return this.#guards.size;
  }

  add(guard: NavigationGuard) {
    this.#guards.add(guard);
    return () => {
      this.#guards.delete(guard);
    };
  }

  //? One at a time, in the order added: a guard that opens a dialog must not meet a second one, or a second ask.
  decide(navigation: NavigationAttempt): boolean | Promise<boolean> {
    if (this.#isDeciding) return false;
    const guards = [...this.#guards];
    for (const [idx, guard] of guards.entries()) {
      const answer = NavigationGuards.#ask(guard, navigation);
      if (answer === false) return false;
      if (answer === true) continue;
      this.#isDeciding = true;
      return NavigationGuards.#decideRest(answer, guards.slice(idx + 1), navigation).finally(() => {
        this.#isDeciding = false;
      });
    }
    return true;
  }

  static async #decideRest(first: Promise<boolean>, rest: NavigationGuard[], navigation: NavigationAttempt) {
    if (!(await first)) return false;
    for (const guard of rest) if (!(await NavigationGuards.#ask(guard, navigation))) return false;
    return true;
  }

  static #ask(guard: NavigationGuard, navigation: NavigationAttempt): boolean | Promise<boolean> {
    const refuse = (error: unknown) => {
      Logger.error(`A navigation guard failed, so ${navigation.from} was kept: ${String(error)}`);
      return false;
    };
    try {
      const answer = guard(navigation);
      return answer instanceof Promise ? answer.then((value) => value !== false, refuse) : answer !== false;
    } catch (error) {
      return refuse(error);
    }
  }
}
