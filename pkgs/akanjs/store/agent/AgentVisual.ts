import type { ToolActivity } from "use-agentic";
import { AgentCursor } from "./AgentCursor";
import { ScreenFlash } from "./ScreenFlash";
import { ScreenTarget } from "./ScreenTarget";

export interface AgentVisualOption {
  /** Ring the control a call was published from, scrolling to it first when it is off screen. */
  reveal?: boolean;
  /** The pointer that travels to the control and presses it. */
  cursor?: boolean;
}

/** Draws where an agent call lands, from tool activity: a store action cannot tell agent writes from the user's. */
export class AgentVisual {
  /** Past this many calls in one turn the reveal only rings, without scrolling. */
  static readonly revealCap = 4;
  /** How many of a form patch's fields are drawn. */
  static readonly fieldCap = 5;
  /** The longest a navigate call waits for its press to land. */
  static readonly leadMs = 600;

  static #revealed = 0;
  static #idle: ReturnType<typeof setTimeout> | null = null;
  static #turning = false;
  static #acting = 0;

  /** The handlers `agentSessionOf` hands the session. `true` is every effect; an object turns one of them off. */
  static sink(option: boolean | AgentVisualOption = true) {
    if (option === false) return undefined;
    const settings = option === true ? {} : option;
    return {
      onActivity: (event: ToolActivity) => AgentVisual.on(event, settings),
      onTurn: (running: boolean) => AgentVisual.turn(running, settings),
    };
  }

  /** Resets the per-turn scroll budget; the pointer is held until the turn ends. */
  static turn(running: boolean, { cursor = true }: AgentVisualOption = {}) {
    if (typeof document === "undefined") return;
    AgentVisual.#turning = running;
    AgentVisual.#revealed = 0;
    if (AgentVisual.#idle) clearTimeout(AgentVisual.#idle);
    AgentVisual.#idle = null;
    if (!running) AgentVisual.#acting = 0;
    if (!cursor) return;
    if (running) AgentCursor.hold();
    else AgentCursor.release();
  }

  static on(event: ToolActivity, { reveal = true, cursor = true }: AgentVisualOption = {}): void | Promise<void> {
    if (typeof document === "undefined" || document.hidden) return;
    if (!reveal && !cursor) return;
    if (event.phase === "end") {
      AgentVisual.#acting = Math.max(0, AgentVisual.#acting - 1);
      if (cursor && AgentVisual.#turning && !AgentVisual.#acting) AgentCursor.think();
      return;
    }
    AgentVisual.#acting += 1;
    const pressed = AgentVisual.#targetsOf(event).map((target) => AgentVisual.#act(target, { reveal, cursor }));
    // Only a navigate waits: the route change removes the link before an unlanded press could show.
    if (!cursor || !pressed.length || !AgentVisual.#navigating(event.name)) return;
    return AgentVisual.#capped(Promise.all(pressed));
  }

  static #capped(drawing: Promise<unknown>): Promise<void> {
    return new Promise((resolve) => {
      const done = () => resolve();
      setTimeout(done, AgentVisual.leadMs);
      void drawing.then(done, done);
    });
  }

  static #targetsOf(event: ToolActivity): HTMLElement[] {
    if (AgentVisual.#navigating(event.name)) return AgentVisual.#linkTo(event.args.path);
    const form = AgentVisual.#formOf(event.name);
    if (!form) return AgentVisual.#only(ScreenTarget.controls(event.name), event.args);
    return Object.keys(event.args)
      .slice(0, AgentVisual.fieldCap)
      .flatMap((key) => AgentVisual.#only(ScreenTarget.controls(`${form}.${key}`)));
  }

  // Several matches are narrowed by `data-akan-key` against the args; short of exactly one, nothing is drawn.
  static #only(targets: HTMLElement[], args?: Record<string, unknown>): HTMLElement[] {
    if (targets.length === 1) return targets;
    if (!targets.length || !args) return [];
    const named = new Set(
      Object.values(args)
        .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
        .map(String),
    );
    const keyed = targets.filter((target) => {
      const key = target.getAttribute("data-akan-key");
      return !!key && named.has(key);
    });
    return keyed.length === 1 ? keyed : [];
  }

  static #act(target: HTMLElement, { reveal, cursor }: Required<AgentVisualOption>): Promise<void> {
    AgentVisual.#count();
    const scrolled =
      reveal && AgentVisual.#revealed <= AgentVisual.revealCap && !ScreenFlash.inView(target)
        ? ScreenFlash.reveal(target)
        : null;
    if (cursor && scrolled) AgentCursor.scroll(scrolled);
    const pressed = cursor ? AgentCursor.press(target) : Promise.resolve();
    if (reveal) ScreenFlash.ring(target, { className: ScreenFlash.actingClass, ms: ScreenFlash.actingMs });
    return pressed;
  }

  static #linkTo(path: unknown): HTMLElement[] {
    const wanted = ScreenTarget.routeOf(typeof path === "string" ? path : "");
    if (!wanted || !document.body) return [];
    const links = [...document.body.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
      (link) =>
        ScreenTarget.routeOf(link.getAttribute("href") ?? "") === wanted &&
        ScreenTarget.visible(link) &&
        ScreenFlash.inView(link),
    );
    return AgentVisual.#only(links);
  }

  static #navigating(name: string) {
    return name.slice(name.lastIndexOf(".") + 1) === "navigate";
  }

  static #formOf(name: string) {
    const bare = name.slice(name.lastIndexOf(".") + 1);
    const match = /^fill([A-Z]\w*)Form$/.exec(bare);
    if (!match) return null;
    return `${match[1][0].toLowerCase()}${match[1].slice(1)}Form`;
  }

  // The quiet-second timer ends a batch for a host that reports no turns.
  static #count() {
    AgentVisual.#revealed += 1;
    if (AgentVisual.#idle) clearTimeout(AgentVisual.#idle);
    AgentVisual.#idle = setTimeout(() => {
      AgentVisual.#revealed = 0;
      AgentVisual.#idle = null;
    }, 1000);
  }
}
