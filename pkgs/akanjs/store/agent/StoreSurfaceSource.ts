import { csrLocation, isNotFoundView, router } from "akanjs/client";
import { AgenticSurface, type SurfaceSource, type ToolEntry, ToolReturn } from "use-agentic";
import { InlineToken } from "../../common/inlineToken";
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
  readonly #surface: AgenticSurface;
  readonly #builtins = new Map<string, ToolEntry[]>();

  /** Without a bridge, `AgentBridge.of()` runs at the first `readState` call. */
  constructor(bridge?: AgentBridge, surface: AgenticSurface = AgenticSurface.shared) {
    this.#bridge = bridge ?? null;
    this.#surface = surface;
  }

  tools = (view: string[] = []): ToolEntry[] => {
    const viewKey = view.join(".");
    let builtins = this.#builtins.get(viewKey);
    if (!builtins) {
      builtins = [
        StoreSurfaceSource.#navigate(),
        StoreSurfaceSource.#goBack(),
        this.#readScreen(viewKey),
        this.#readState(view),
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
      taint: "exempt",
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
        } catch (error) {
          if (StoreSurfaceSource.#isKept(error)) throw new Error(StoreSurfaceSource.#kept);
          throw new Error(`There is no route at ${path}, so the page did not move. ${StoreSurfaceSource.#linked()}`);
        }
        // `push` returns before the new route's payload lands; without this the next readScreen reads the old page.
        await StoreSurfaceSource.#settled();
        if (isNotFoundView()) {
          const left = await StoreSurfaceSource.#leaveNotFound();
          throw new Error(
            `There is no route at ${path}, so ${left ? "the page went back" : "the page shows the app's not-found page"}. ${StoreSurfaceSource.#linked()}`,
          );
        }
        const landed = StoreSurfaceSource.#redirected(path);
        return `${landed ? `Asked for ${path}, but the app sent the page to ${landed} instead.` : `Now on ${path}.`} ${StoreSurfaceSource.#arrived}`;
      },
    };
  }

  //? A section streamed in after the page, a board's list and the tools it mounts, lands past the quiet the draw left.
  static async #settled() {
    await ScreenSettle.wait({ appearMs: 800, timeoutMs: 5000 });
    if (await ScreenSettle.loaded({ timeoutMs: 5000 })) await ScreenSettle.wait({ timeoutMs: 2000 });
  }

  //? The not-found view is drawn at the address asked for, on a history entry of its own, so the move is undone.
  static async #leaveNotFound(): Promise<boolean> {
    if (!router.canGoBack()) return false;
    router.back();
    const left = await router.navigation().then(
      () => true,
      () => false,
    );
    await StoreSurfaceSource.#settled();
    return left;
  }

  static readonly #arrived =
    "This screen's own tools and state replace the previous screen's and are listed on your next turn — call them then, by the names listed. Call readScreen to see the page.";

  static readonly #kept =
    "The app asked before leaving this page and kept it, so the page did not move. Tell the user why you could not move, and do not try again unless they ask.";

  //? By name, not `instanceof`: the router is inlined into more than one browser bundle.
  static #isKept(error: unknown) {
    return error instanceof Error && error.name === "NavigationRefused";
  }

  static #linked() {
    const routes = ScreenTarget.linkedRoutes();
    return routes.length
      ? `Paths this screen links to: ${routes.join(", ")}. Navigate to one of those rather than composing a path.`
      : "Call readScreen — it prints each link on this screen with its own path — and navigate to one of those.";
  }

  /** A redirect moves the page somewhere other than the path it was sent to. */
  static #redirected(path: string): string | null {
    const trimmed = (route: string) => (route.length > 1 ? route.replace(/\/+$/, "") : route);
    try {
      const landed = router.routeOf(csrLocation.pathname);
      const wanted = router.routeOf(new URL(path, "http://route.invalid").pathname);
      return trimmed(landed) === trimmed(wanted) ? null : landed;
    } catch {
      return null;
    }
  }

  static #goBack(): ToolEntry {
    return {
      name: "goBack",
      taint: "exempt",
      description:
        "Go back to the previous page in this session's history. Use it to undo a navigation; use navigate for a path.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      guard: () => (router.canGoBack() ? true : "There is no previous page in this session's history."),
      run: async () => {
        router.back();
        await router.navigation().catch((error: unknown) => {
          if (StoreSurfaceSource.#isKept(error)) throw new Error(StoreSurfaceSource.#kept);
        });
        await StoreSurfaceSource.#settled();
        return `Back on ${router.getPath()}. ${StoreSurfaceSource.#arrived}`;
      },
    };
  }

  #readScreen(viewKey: string): ToolEntry {
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
      taint: "source",
      run: (args) => {
        const root = StoreSurfaceSource.#zoneRoot(viewKey);
        const section = typeof args.section === "string" ? args.section.trim() : "";
        const options = { images: args.images === true };
        if (!section) return this.#underZoneLabel(viewKey, ScreenReader.read(root, options));
        const container = ScreenTarget.container(section, root);
        if (container) return this.#underZoneLabel(section, ScreenReader.read(container, options));
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
      `No picture at ${src} is on screen now. Call readScreen with images: true and pass the <address> of an [image: <alt>](<address>) it prints; a picture that has left the screen cannot be viewed.`;
    return {
      name: "viewImage",
      description:
        "Look at one picture on screen, to answer from what it shows rather than from its caption. readScreen with `images: true` prints each picture as `[image: <alt>](<address>)`, or `[image](<address>)` when it has no alt; pass that address. Each picture costs this turn over a thousand tokens, so view only the ones the answer needs.",
      parameters: {
        type: "object",
        properties: {
          src: {
            type: "string",
            description: "The <address> of an [image: <alt>](<address>) readScreen printed, without the parentheses.",
          },
        },
        required: ["src"],
        additionalProperties: false,
      },
      settle: false,
      taint: "source",
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

  #underZoneLabel(path: string, text: string): string {
    if (!path) return text;
    const zone = this.#surface.snapshot().scopes.find((scope) => scope.path === path && scope.kind === "zone");
    return zone?.label && !InlineToken.is(zone.label) ? `Zone label: ${zone.label}\n${text}` : text;
  }

  #readState(view: string[]): ToolEntry {
    const viewKey = view.join(".");
    return {
      name: "readState",
      description:
        "Read one store state key of this page, or one resource by its name. Keys are listed in the state context block and in `withheld` of the route block; a resource the screen block or a tool result's `changes` marks `withheld` is read by its name.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
        additionalProperties: false,
      },
      settle: false,
      taint: "source",
      run: (args: Record<string, unknown>) => {
        this.#bridge ??= AgentBridge.of();
        const key = String(args.key);
        const stateKey =
          this.#bridge.readableKeys(viewKey).includes(key) ||
          (AgentBridge.routeKeys as readonly string[]).includes(key);
        const resource = stateKey ? undefined : this.#surface.snapshot(view).resources.find(({ name }) => name === key);
        if (!resource) return this.#bridge.read(key, viewKey);
        if (resource.error !== undefined) throw new Error(resource.error);
        return resource.value;
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
