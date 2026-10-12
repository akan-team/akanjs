import type { LayoutModule, PageModule, RouteViewport, WebAppManifest } from "../csrTypes";
import type { ReactFont } from "../types";
import { LayoutDefinition } from "./LayoutDefinition";
import type { RouteArgsShape, RouteKind } from "./RouteDefinition";

/** What only the root `_layout.tsx` of an app (or of a basePath) may set — the generated root layout reads it. */
export class RootLayoutDefinition<Args extends RouteArgsShape = Record<never, never>> extends LayoutDefinition<Args> {
  override readonly kind: RouteKind = "rootLayout";
  #fonts?: ReactFont[];
  #manifest?: WebAppManifest;
  #theme?: string;
  #reconnect?: boolean;
  #wsConnect?: boolean;
  #layoutStyle?: "mobile" | "web";
  #viewport?: RouteViewport;

  fonts(fonts: ReactFont[]) {
    this.#fonts = fonts;
    return this;
  }
  manifest(manifest: WebAppManifest) {
    this.#manifest = manifest;
    return this;
  }
  theme(theme: string) {
    this.#theme = theme;
    return this;
  }
  reconnect(on = true) {
    this.#reconnect = on;
    return this;
  }
  wsConnect(on = true) {
    this.#wsConnect = on;
    return this;
  }
  layoutStyle(style: "mobile" | "web") {
    this.#layoutStyle = style;
    return this;
  }
  viewport(viewport: RouteViewport) {
    this.#viewport = viewport;
    return this;
  }

  protected override extendModule(module: PageModule & LayoutModule): PageModule & LayoutModule {
    return {
      ...super.extendModule(module),
      ...(this.#fonts ? { fonts: this.#fonts } : {}),
      ...(this.#manifest ? { manifest: this.#manifest } : {}),
      ...(this.#theme !== undefined ? { theme: this.#theme } : {}),
      ...(this.#reconnect !== undefined ? { reconnect: this.#reconnect } : {}),
      ...(this.#wsConnect !== undefined ? { wsConnect: this.#wsConnect } : {}),
      ...(this.#layoutStyle ? { layoutStyle: this.#layoutStyle } : {}),
      ...(this.#viewport ? { viewport: this.#viewport } : {}),
    };
  }
}
