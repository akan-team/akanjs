import type { Logger } from "akanjs/common";

type StartMark = "started" | "baseBuilt" | "builderReady" | "backendSpawned" | "backendReady";

const BASE_BUILD_PARTS = ["runtime", "routes", "styles", "dictionary", "pages"];

export class DevStartTimeline {
  readonly #logger: Logger;
  readonly #now: () => number;
  #marks: Partial<Record<StartMark, number>> = {};
  #basePhaseMs: Partial<Record<string, number>> = {};
  #reported = true;

  constructor(logger: Logger, now: () => number = () => performance.now()) {
    this.#logger = logger;
    this.#now = now;
  }

  begin(): void {
    this.#marks = { started: this.#now() };
    this.#basePhaseMs = {};
    this.#reported = false;
  }

  baseBuilt(phaseMs: Record<string, number>): void {
    if (this.#reported || this.#marks.baseBuilt !== undefined) return;
    this.#basePhaseMs = phaseMs;
    this.#marks.baseBuilt = this.#now();
  }

  mark(mark: Exclude<StartMark, "started" | "baseBuilt">): void {
    if (this.#reported) return;
    if (mark === "backendSpawned") this.#marks.backendSpawned = this.#now();
    else this.#marks[mark] ??= this.#now();
    this.#report();
  }

  #report(): void {
    const { started, baseBuilt, builderReady, backendSpawned, backendReady } = this.#marks;
    if (started === undefined || builderReady === undefined || backendReady === undefined) return;
    this.#reported = true;
    const ms = (value: number) => Math.round(value).toString();
    //? The clock counts from the start of the process, so the first mark is what the CLI spent before the host.
    const parts = [`prepare ${ms(started)}`, `builder ${ms(builderReady - started)}${this.#builderParts()}`];
    if (backendSpawned !== undefined) parts.push(`backend ${ms(backendReady - backendSpawned)}`);
    if (baseBuilt !== undefined) parts.push(`first artifact at ${ms(baseBuilt)}`);
    this.#logger.info(`ready in ${ms(Math.max(builderReady, backendReady))}ms (${parts.join(" · ")})`);
  }

  #builderParts(): string {
    const { started, baseBuilt, builderReady } = this.#marks;
    if (started === undefined || baseBuilt === undefined || builderReady === undefined) return "";
    const total = this.#basePhaseMs.total ?? 0;
    const base = BASE_BUILD_PARTS.flatMap((part) => {
      const partMs = this.#basePhaseMs[part];
      return partMs === undefined ? [] : [`${part} ${Math.round(partMs)}`];
    });
    const spawn = Math.max(0, Math.round(baseBuilt - started - total));
    const watch = Math.max(0, Math.round(builderReady - baseBuilt));
    return `: spawn ${spawn} + base build ${Math.round(total)} [${base.join(" · ")}] + watch ${watch}`;
  }
}
