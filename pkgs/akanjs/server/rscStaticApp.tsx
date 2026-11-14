import type { RouteRender, RouteViewport } from "akanjs/client";
import type { Logger } from "akanjs/common";
import { type AkanTheme, getRequestStore } from "akanjs/fetch";
import type { ReactNode } from "react";
import type { PagePromptRun } from "../signal/mcp/pagePrompt";
import type { McpAppRootProps } from "../webkit/McpAppBoot";
import type { ClientManifest } from "./artifact";
import { RscDocumentHead } from "./rscDocumentHead";
import type { RscFlightRenderer } from "./rscFlightRenderer";
import type { PagePromptDrawInput } from "./rscPagePrompts";

export type McpAppRoot = (props: McpAppRootProps) => ReactNode;

export interface McpAppRootOwner {
  getMcpAppRoot?: () => Promise<McpAppRoot | undefined>;
}

export interface RscStaticAppDrawing {
  flight: Uint8Array<ArrayBuffer>;
  theme?: AkanTheme;
  viewport?: RouteViewport;
  needsBrowser: boolean;
}

export interface RscPagePromptDrawn {
  run: PagePromptRun;
  drawn: RscStaticAppDrawing | null;
}

export class RscStaticApp {
  readonly #logger: Logger;
  readonly #flights: RscFlightRenderer;

  constructor(logger: Logger, flights: RscFlightRenderer) {
    this.#logger = logger;
    this.#flights = flights;
  }

  //? Wrapped in the same `McpAppRoot` as the app's view, never the layouts: those draw the page's frame, not the app.
  async draw(
    { element, route, url, lang }: PagePromptDrawInput,
    clientManifest: ClientManifest,
    signal?: AbortSignal,
  ): Promise<RscStaticAppDrawing | null> {
    const roots = route.renderRootLayouts;
    const [Root, theme, viewport] = await Promise.all([
      RscDocumentHead.firstRootValue(roots, (render) => (render as RouteRender & McpAppRootOwner).getMcpAppRoot?.()),
      RscDocumentHead.firstRootValue(roots, (render) => render.getLayoutTheme?.()),
      RscDocumentHead.firstRootValue(roots, (render) => render.getLayoutViewport?.()),
    ]);
    const path = `/${new URL(url).pathname.split("/").slice(2).join("/")}`;
    const tree = Root ? (
      <Root params={{ lang }} path={path}>
        {element}
      </Root>
    ) : (
      element
    );
    const rendered = await this.#flights.renderFlightElement(tree, clientManifest, { collectChunks: true, signal });
    if (rendered.control || rendered.cancelled) {
      this.#logger.warn(
        `static app at ${path} drew no HTML: its render ended in ${rendered.control?.type ?? "cancel"}`,
      );
      return null;
    }
    const flight = new Uint8Array(rendered.chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of rendered.chunks) {
      flight.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { flight, theme, viewport, needsBrowser: getRequestStore()?.needsBrowser === true };
  }
}
