import type { RouteRender } from "akanjs/client";
import type { ReactNode } from "react";
import { RscRenderLevels } from "./rscRenderLevels";

interface RouteLevel {
  routeRender: RouteRender;
  children: ReactNode;
}

interface PrestartedRun {
  result: Promise<ReactNode>;
  failed: boolean;
}

//* A level's body reads its params and search, never the output above it, so it need not wait for the level above.
export class RouteLevelRuns {
  readonly #params: Record<string, string>;
  readonly #searchParams: Record<string, string | string[]>;
  readonly #prestartFrom: number;
  readonly #levels: RouteLevel[] = [];
  #prestarted: Map<number, PrestartedRun> | null = null;

  constructor({
    params,
    searchParams,
    prestartFrom,
  }: {
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    prestartFrom: number;
  }) {
    this.#params = params;
    this.#searchParams = searchParams;
    this.#prestartFrom = prestartFrom;
  }

  add(index: number, routeRender: RouteRender, children: ReactNode): void {
    this.#levels[index] = { routeRender, children };
  }

  //? A start that settled failed (a redirect or a not-found is a throw too) is dropped and the level renders again under
  //? the levels above, as it would have alone: only a level's own run reaches React, which logs it.
  take(index: number): Promise<ReactNode> | null {
    if (index >= this.#prestartFrom && !this.#prestarted) this.#prestarted = this.#prestartBelow(index);
    const run = this.#prestarted?.get(index);
    this.#prestarted?.delete(index);
    return run && !run.failed ? run.result : null;
  }

  //? Route module levels only: a fallback view offers its head tags to the document as it renders.
  #prestartBelow(index: number): Map<number, PrestartedRun> {
    const runs = new Map<number, PrestartedRun>();
    for (let below = index + 1; below < this.#levels.length; below++) {
      const level = this.#levels[below];
      if (level?.routeRender.isAsync) runs.set(below, this.#start(level));
    }
    return runs;
  }

  //? From a microtask, so a body starting early runs outside the component rendering above it, hooks and owner alike.
  #start({ routeRender, children }: RouteLevel): PrestartedRun {
    const levels = RscRenderLevels.begin();
    const props = { children, params: this.#params, searchParams: this.#searchParams };
    const run: PrestartedRun = {
      result: Promise.resolve().then(() => routeRender.render(props as never)),
      failed: false,
    };
    run.result.then(
      () => levels?.end(),
      () => {
        run.failed = true;
        levels?.end();
      },
    );
    return run;
  }
}
