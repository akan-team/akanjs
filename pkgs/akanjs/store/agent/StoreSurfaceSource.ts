import { router } from "akanjs/client";
import type { SurfaceSource, ToolEntry } from "use-agentic";
import { AgentBridge } from "./AgentBridge";
import { ScreenReader } from "./ScreenReader";
import { ScreenSettle } from "./ScreenSettle";
import { ScreenTarget } from "./ScreenTarget";

/**
 * The tools every akan screen has whatever it declares: where it can go, what it is rendering, what one of the
 * store keys it reads holds, and where on screen a thing the user is being told about actually is. Everything else
 * an agent may do is a component's own `st.tool` declaration — the store contributes no actions, because a method
 * on a store class is not something the screen offers the user.
 *
 * Per zone view: a zone's `readState` reaches the keys its own subtree subscribes, and its `readScreen` and
 * `highlight` reach into its own `data-agent-zone` container rather than the whole document. A page can shadow any
 * of them by registering a hook tool of the same name — hook entries win over a source's. **That is a root-scope
 * move only**: inside a zone the hook entry is registered under its scope-prefixed name, which can never collide
 * with the bare name a source publishes, so a zone drops a built-in with the session's `builtins` option instead.
 */
export class StoreSurfaceSource implements SurfaceSource {
  /** Defined in `akanjs/ui/styles.css`, so the flash follows the app's own theme tokens. */
  static readonly highlightClass = "akan-agent-highlight";
  /** Mirrors the animation in that stylesheet: the class outlives the ring by nothing. */
  static readonly highlightMs = 2400;
  /**
   * What `tools()` contributes, in the order it builds them — the list a session's `builtins` option selects from.
   * A screen that declares a hook tool of one of these names is not in it: that entry is the screen's, not this
   * source's, so withholding the built-ins never withholds a tool a component published on purpose.
   */
  static readonly builtins = ["navigate", "goBack", "readScreen", "readState", "highlight"] as const;

  #bridge: AgentBridge | null;
  readonly #builtins = new Map<string, ToolEntry[]>();

  /** Lazy by default: `AgentBridge.of()` walks the whole store, so it waits for the first enumeration. */
  constructor(bridge?: AgentBridge) {
    this.#bridge = bridge ?? null;
  }

  tools = (view: string[] = []): ToolEntry[] => {
    const viewKey = view.join(".");
    let builtins = this.#builtins.get(viewKey);
    if (!builtins) {
      builtins = [
        StoreSurfaceSource.#navigate(),
        StoreSurfaceSource.#goBack(),
        StoreSurfaceSource.#readScreen(viewKey),
        this.#readState(viewKey),
        StoreSurfaceSource.#highlight(viewKey),
      ];
      this.#builtins.set(viewKey, builtins);
    }
    return builtins;
  };

  /** Screen-driving is client navigation, so the agent gets the same router `Link` rides. */
  static #navigate(): ToolEntry {
    return {
      name: "navigate",
      description: "Navigate this page to an internal path of this app, e.g. /docs/intro/quickstart.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
      // An absolute or scheme-relative URL would send the user off-site; the agent only ever drives this app.
      guard: (args) =>
        typeof args.path === "string" && args.path.startsWith("/") && !args.path.startsWith("//")
          ? true
          : "path must be an internal path starting with /.",
      run: async (args) => {
        const path = String(args.path);
        router.push(path);
        // The push returns while the payload for the new route is still in flight, so without this the readScreen
        // right after it reads the page the user just left, and the new screen's tools are not registered yet.
        await ScreenSettle.wait({ appearMs: 800, timeoutMs: 5000 });
        return `Now on ${path}. Call readScreen to see it; this screen's own tools and state are listed from the next turn.`;
      },
    };
  }

  /**
   * Global rather than declared by whatever `Link.Back` happens to be on screen: history is not a control the page
   * owns. Every route has a previous page, the browser's own back gesture is always there, and a page that draws
   * no back link is not a page you may not leave — the same reasoning that makes `navigate` a built-in.
   */
  static #goBack(): ToolEntry {
    return {
      name: "goBack",
      description:
        "Go back to the previous page in this session's history. Use it to undo a navigation; use navigate for a path.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      // Re-checked at call time, so a first page with nothing behind it refuses instead of leaving the app.
      guard: () => (router.canGoBack() ? true : "There is no previous page in this session's history."),
      run: async () => {
        router.back();
        await ScreenSettle.wait({ appearMs: 800, timeoutMs: 5000 });
        return `Back on ${router.getPath()}. Call readScreen to see it; this screen's own tools and state are listed from the next turn.`;
      },
    };
  }

  /** What the user is looking at, read from the rendered DOM — the store never held it, so no key can answer it. */
  static #readScreen(viewKey: string): ToolEntry {
    const where = viewKey ? "in this zone" : "on this page";
    const subject = viewKey ? "this zone" : "the current page";
    return {
      name: "readScreen",
      description: `Read what is currently rendered ${where} — headings, prose, links, buttons, and form values. Use it when the user asks about what ${subject} shows. A long screen is truncated, so pass \`section\` to read one part of it.`,
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "One region of the screen: a heading's anchor as readScreen prints it, the heading's own text, a scope path from the screen context, or the name in a `[skipped: name]` marker. Omit to read all of it.",
          },
        },
        additionalProperties: false,
      },
      settle: false,
      run: (args) => {
        const root = StoreSurfaceSource.#zoneRoot(viewKey);
        const section = typeof args.section === "string" ? args.section.trim() : "";
        if (!section) return ScreenReader.read(root);
        const container = ScreenTarget.container(section, root);
        if (container) return ScreenReader.read(container);
        const heading = ScreenTarget.heading(section, root);
        if (heading) return ScreenReader.readFrom(heading, root);
        const named = ScreenTarget.containerNames(root);
        throw new Error(
          `No section named ${section} is on screen. ${
            named.length
              ? `Sections here: ${named.join(", ")}.`
              : "This screen names no sections; omit section to read all of it."
          }`,
        );
      },
    };
  }

  /**
   * Showing beats describing: an agent that has just been asked where something is can put it in front of the
   * user instead of writing directions to it. It drives nothing and changes no data — it is the one built-in that
   * exists for the *user's* benefit rather than the model's, which is why it is worth a slot on every screen.
   */
  static #highlight(viewKey: string): ToolEntry {
    return {
      name: "highlight",
      description:
        "Scroll one thing into view and flash it, to show the user where it is instead of describing where it is. `target` is a tool name as it appears beside a control in readScreen, a state key, a scope path, a heading's anchor, or a heading's own text.",
      parameters: {
        type: "object",
        properties: { target: { type: "string" } },
        required: ["target"],
        additionalProperties: false,
      },
      run: (args) => {
        const name = typeof args.target === "string" ? args.target.trim() : "";
        if (!name) throw new Error("highlight needs a target.");
        const root = StoreSurfaceSource.#zoneRoot(viewKey);
        if (typeof document === "undefined") return "No rendered document is available.";
        const target = ScreenTarget.find(name, root);
        if (!target) {
          const named = ScreenTarget.targetNames(root);
          throw new Error(
            `Nothing named ${name} is on screen. ${
              named.length ? `On screen now: ${named.join(", ")}.` : "Nothing on this screen carries a name."
            }`,
          );
        }
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        StoreSurfaceSource.#flash(target);
        return `Highlighted ${name} on screen for the user.`;
      },
    };
  }

  /** The pull half of the state context block: keys are listed there, values arrive masked through this. */
  #readState(viewKey: string): ToolEntry {
    return {
      name: "readState",
      description: "Read one store state key of this page. Keys are listed in the state context block.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
        additionalProperties: false,
      },
      run: (args: Record<string, unknown>) => {
        this.#bridge ??= AgentBridge.of();
        return this.#bridge.read(String(args.key), viewKey);
      },
    };
  }

  /**
   * The ring goes on once the scroll lands, not when it starts: a smooth scroll across a long page takes most of a
   * second, and a flash begun at the top is already fading by the time the user's eye arrives. Settles on the
   * element's own position rather than a scroll event, which no browser fires consistently, and is capped so a page
   * that never stops moving still flashes. Removed on a timer — a React re-render that drops the class early only
   * ends it sooner.
   */
  static #flash(target: HTMLElement) {
    let last = Number.NaN;
    let frames = 0;
    const settle = () => {
      const { top } = target.getBoundingClientRect();
      frames += 1;
      if (Math.abs(top - last) >= 1 && frames < 90) {
        last = top;
        requestAnimationFrame(settle);
        return;
      }
      target.classList.add(StoreSurfaceSource.highlightClass);
      setTimeout(() => target.classList.remove(StoreSurfaceSource.highlightClass), StoreSurfaceSource.highlightMs);
    };
    requestAnimationFrame(settle);
  }

  static #zoneRoot(viewKey: string): HTMLElement | undefined {
    if (!viewKey || typeof document === "undefined") return undefined;
    return document.querySelector<HTMLElement>(`[data-agent-zone="${CSS.escape(viewKey)}"]`) ?? undefined;
  }
}
