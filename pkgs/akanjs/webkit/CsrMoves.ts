//? The stack takes a move at once and makes it once its page is drawn, or once the page sliding in has settled, so
//? `router.navigation()` waits on it here. A move dropped by a back or the browser's own move settles too, and one
//? another took the place of settles with that one, as an overtaken RSC navigation leaves the page where it is.
export class CsrMoves {
  static readonly #open = new WeakMap<object, { made: Promise<void>; settle: () => void }>();

  static open(move: object): Promise<void> {
    let settle: () => void = () => undefined;
    const made = new Promise<void>((resolve) => {
      settle = resolve;
    });
    CsrMoves.#open.set(move, { made, settle });
    return made;
  }

  static of(move: object | null | undefined): Promise<void> | undefined {
    return move ? CsrMoves.#open.get(move)?.made : undefined;
  }

  static settle(move: object | null | undefined) {
    if (!move) return;
    CsrMoves.#open.get(move)?.settle();
    CsrMoves.#open.delete(move);
  }

  static follow(move: object | null | undefined, next: void | Promise<void>) {
    if (!move) return;
    const settle = () => CsrMoves.settle(move);
    void Promise.resolve(next).then(settle, settle);
  }
}
