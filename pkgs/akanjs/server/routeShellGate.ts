export class RouteShellGate {
  //? An element, not the bare promise: `Children.toArray`, run on each level's output, throws a pending one.
  static Wait = async ({ until }: { until: Promise<null> }) => await until;

  readonly opened: Promise<null>;
  #open: () => void = () => undefined;
  #holding = false;
  #rendering = 0;
  #activity = 0;

  constructor() {
    this.opened = new Promise<null>((resolve) => {
      this.#open = () => resolve(null);
    });
  }

  get holding(): boolean {
    return this.#holding;
  }

  hold(levels: number): void {
    this.#holding = levels > 0;
    if (levels === 0) this.#open();
  }

  enter(): void {
    this.#rendering += 1;
    this.#activity += 1;
  }

  //? Flight writes a settled level (starting the next, or reporting its error) in a `setImmediate` task: wait past it.
  leave(): void {
    this.#rendering -= 1;
    const activity = ++this.#activity;
    setImmediate(() =>
      setImmediate(() => {
        if (this.#rendering > 0 || this.#activity !== activity) return;
        this.#holding = false;
        this.#open();
      }),
    );
  }
}
