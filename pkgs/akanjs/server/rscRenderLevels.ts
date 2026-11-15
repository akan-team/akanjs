import { requestStorage } from "akanjs/fetch";

//? React drops a cancelled render, but a page's own `await` runs on: its levels are counted until they settle.
export class RscRenderLevels {
  static #byRequest: WeakMap<Request, RscRenderLevels> | null = null;
  #pending = 0;
  #onSettled: (() => void) | null = null;

  static track(): void {
    RscRenderLevels.#byRequest ??= new WeakMap();
  }

  static begin(): RscRenderLevels | null {
    const byRequest = RscRenderLevels.#byRequest;
    const request = byRequest ? requestStorage?.getStore()?.request : undefined;
    if (!byRequest || !request) return null;
    let levels = byRequest.get(request);
    if (!levels) {
      levels = new RscRenderLevels();
      byRequest.set(request, levels);
    }
    levels.#pending += 1;
    return levels;
  }

  static of(request: Request | null): RscRenderLevels | null {
    return (request && RscRenderLevels.#byRequest?.get(request)) || null;
  }

  end(): void {
    this.#pending -= 1;
    if (this.#pending > 0) return;
    this.#onSettled?.();
    this.#onSettled = null;
  }

  whenSettled(run: () => void): void {
    if (this.#pending > 0) this.#onSettled = run;
    else run();
  }
}
