import { router } from "akanjs/client";
import { AgenticSurface, type SurfaceSource, type ToolEntry, ToolReturn } from "use-agentic";
import { AgentBridge } from "./AgentBridge";
import { ScreenFlash } from "./ScreenFlash";
import { ScreenImage } from "./ScreenImage";
import { ScreenReader } from "./ScreenReader";
import { ScreenSettle } from "./ScreenSettle";
import { ScreenTarget } from "./ScreenTarget";

/** Every screen's built-in tools. A same-named hook tool shadows one at root scope only; a zone uses `builtins`. */
export class StoreSurfaceSource implements SurfaceSource {
  /** What a session's `builtins` option selects from, in build order. */
  static readonly builtins = ["navigate", "goBack", "readScreen", "readState", "highlight", "viewImage"] as const;

  #bridge: AgentBridge | null;
  readonly #builtins = new Map<string, ToolEntry[]>();

  /** Without a bridge, `AgentBridge.of()` runs at the first `readState` call. */
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
        StoreSurfaceSource.#viewImage(viewKey),
      ];
      this.#builtins.set(viewKey, builtins);
    }
    return builtins;
  };

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
        try {
          router.push(path);
          await router.navigation();
        } catch {
          throw new Error(
            `There is no route at ${path}, so the page did not move. Call readScreen — it prints each link on this screen with its own path — and navigate to one of those.`,
          );
        }
        // `push` returns before the new route's payload lands; without this the next readScreen reads the old page.
        await ScreenSettle.wait({ appearMs: 800, timeoutMs: 5000 });
        return `Now on ${path}. Call readScreen to see it; this screen's own tools and state are listed from the next turn.`;
      },
    };
  }

  static #goBack(): ToolEntry {
    return {
      name: "goBack",
      description:
        "Go back to the previous page in this session's history. Use it to undo a navigation; use navigate for a path.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      guard: () => (router.canGoBack() ? true : "There is no previous page in this session's history."),
      run: async () => {
        router.back();
        await ScreenSettle.wait({ appearMs: 800, timeoutMs: 5000 });
        return `Back on ${router.getPath()}. Call readScreen to see it; this screen's own tools and state are listed from the next turn.`;
      },
    };
  }

  static #readScreen(viewKey: string): ToolEntry {
    const where = viewKey ? "in this zone" : "on this page";
    const subject = viewKey ? "this zone" : "the current page";
    return {
      name: "readScreen",
      description: `Read what is currently rendered ${where} — headings, prose, links, buttons, form values, and where the images are. Use it when the user asks about what ${subject} shows. A long screen is truncated, so pass \`section\` to read one part of it.`,
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "One region of the screen: a heading's anchor as readScreen prints it, the heading's own text, a scope path from the screen context, or the name in a `[skipped: name]` marker. Omit to read all of it.",
          },
          images: {
            type: "boolean",
            description:
              "Print each image's address beside its caption, for passing to a tool that takes a picture. Off by default, since a gallery spends the whole read on URLs.",
          },
        },
        additionalProperties: false,
      },
      settle: false,
      run: (args) => {
        const root = StoreSurfaceSource.#zoneRoot(viewKey);
        const section = typeof args.section === "string" ? args.section.trim() : "";
        const options = { images: args.images === true };
        if (!section) return ScreenReader.read(root, options);
        const container = ScreenTarget.container(section, root);
        if (container) return ScreenReader.read(container, options);
        const heading = ScreenTarget.heading(section, root);
        if (heading) return ScreenReader.readFrom(heading, root, options);
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
      settle: false,
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
        ScreenFlash.show(target);
        return `Highlighted ${name} on screen for the user.`;
      },
    };
  }

  static #viewImage(viewKey: string): ToolEntry {
    const absent = (src: string) =>
      `No picture at ${src} is on screen now. Call readScreen with images: true and pass an address exactly as it prints one; a picture that has left the screen cannot be viewed.`;
    return {
      name: "viewImage",
      description:
        "Look at one picture on screen, to answer from what it shows rather than from its caption. Pass an [image] address readScreen printed with `images: true`. Each picture costs this turn over a thousand tokens, so view only the ones the answer needs.",
      parameters: {
        type: "object",
        properties: { src: { type: "string", description: "The image address exactly as readScreen printed it." } },
        required: ["src"],
        additionalProperties: false,
      },
      settle: false,
      // Only what the screen shows: an arbitrary address would have the user's browser fetch it for the model.
      guard: (args) => {
        const src = typeof args.src === "string" ? args.src.trim() : "";
        if (!src) return "viewImage needs a src.";
        if (src.startsWith("data:"))
          return "A data: address is the picture's bytes, not an address readScreen prints. Pass one readScreen printed.";
        return ScreenImage.find(src, StoreSurfaceSource.#zoneRoot(viewKey)) ? true : absent(src);
      },
      run: async (args) => {
        const src = String(args.src).trim();
        const image = ScreenImage.find(src, StoreSurfaceSource.#zoneRoot(viewKey));
        if (!image) throw new Error(absent(src));
        const { attachment, size } = await ScreenImage.view(image);
        return ToolReturn.attach(`Attached ${attachment.name}: ${size}.`, [attachment]);
      },
    };
  }

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
      settle: false,
      run: (args: Record<string, unknown>) => {
        this.#bridge ??= AgentBridge.of();
        return this.#bridge.read(String(args.key), viewKey);
      },
    };
  }

  static #zoneRoot(viewKey: string): HTMLElement | undefined {
    if (!viewKey || typeof document === "undefined") return undefined;
    return [...document.querySelectorAll<HTMLElement>(`[data-agent-zone="${CSS.escape(viewKey)}"]`)].find(
      ScreenTarget.visible,
    );
  }
}

export interface StoreSurface {
  bridge: AgentBridge;
  source: StoreSurfaceSource;
  surface: AgenticSurface;
}

const SURFACE_KEY = Symbol.for("akanjs.store.agentSurface");

/** Once per runtime, lazily; never attached on the server, where one global surface would span requests. */
export const ensureStoreSurface = (): StoreSurface => {
  const holder = globalThis as typeof globalThis & { [SURFACE_KEY]?: StoreSurface };
  if (!holder[SURFACE_KEY]) {
    const bridge = AgentBridge.of();
    const source = new StoreSurfaceSource(bridge);
    const surface = AgenticSurface.shared;
    if (typeof window !== "undefined") surface.addSource(source);
    holder[SURFACE_KEY] = { bridge, source, surface };
  }
  return holder[SURFACE_KEY];
};
