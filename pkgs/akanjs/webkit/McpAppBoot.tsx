"use client";
import {
  csrLocation,
  type PageDefinition,
  type RouteModuleSource,
  resolveRouteModule,
  router,
  Translator,
} from "akanjs/client";
import { Logger, parseAkanI18nEnv } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import { st } from "akanjs/store";
import { createElement, type ReactNode } from "react";
import * as ReactDOM from "react-dom/client";
import { McpAppAgent } from "./McpAppAgent";
import { McpAppBridge, type McpAppRoute } from "./McpAppBridge";
import { McpAppView } from "./McpAppView";

export interface McpAppRootProps {
  params: { lang: string };
  path: string;
  children: ReactNode;
}

type McpAppOverride = (props: { children?: ReactNode }) => ReactNode;

export interface McpAppBootProps {
  app: string;
  page: RouteModuleSource;
  /** The generated root layout of the page: its `McpAppRoot` provides what the root layout would, frame aside. */
  root: { McpAppRoot?: (props: McpAppRootProps) => ReactNode };
  /** The generated wrappers of the `_overrides.tsx` the web draws outside the root layout, outermost first: they also
   * reach what `McpAppRoot` draws beside the page, its toasts and approvals. */
  rootOverrides?: McpAppOverride[];
  /** The generated wrappers of the rest of the `_overrides.tsx` over the page, outermost first. */
  overrides?: McpAppOverride[];
  /** The basePath the page sits under, which every app path the view opens keeps. */
  basePath?: string;
}

//* An MCP host's view of one `.app()`: no router, no layout and no network of its own. Its first reads come from the
//* tool result's snapshot, and every later call is relayed by the host under the host's credential.
export class McpAppBoot {
  static async run({ app, page, root, rootOverrides = [], overrides = [], basePath = "" }: McpAppBootProps) {
    const bridge = new McpAppBridge();
    const view = new McpAppView(bridge);
    const start = await bridge.connect();
    if (!start.ok) {
      view.showUnavailable(start.message);
      return;
    }
    const { locales, defaultLocale } = parseAkanI18nEnv();
    const lang = McpAppView.languageOf(bridge.hostContext.locale, locales) ?? start.route.params.lang ?? defaultLocale;
    const href = McpAppView.localize(start.href, bridge.hostContext.locale, locales);
    csrLocation.view(href);
    const pathname = href.split(/[?#]/)[0] ?? "/";
    const path = `/${pathname.split("/").slice(2).join("/")}`;
    if (globalThis.__AKAN_EMBED__) globalThis.__AKAN_EMBED__.account = start.account;
    FetchClient.setBridge(bridge.fetchBridge(start.snapshot, { readOnly: start.readOnly }));
    router.init({
      type: "csr",
      lang,
      prefix: basePath,
      router: {
        push: (to) => view.open(to),
        replace: (to) => view.open(to),
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    Translator.setActiveLocale(lang);
    document.documentElement.lang = lang;
    st.set({
      params: { ...start.route.params, lang },
      searchParams: start.route.searchParams,
      pathname,
      path,
    });
    view.mount();
    new McpAppAgent(bridge).start();
    let element: ReactNode;
    try {
      element = await McpAppBoot.#load(app, page, start.route, lang);
    } catch (error) {
      McpAppBoot.#fail(view, `${app} failed to load`, error);
      return;
    }
    const container = document.getElementById("root");
    if (!container) throw new Error("No root element");
    const Root = root.McpAppRoot ?? McpAppBoot.#bare;
    //? No layout's error boundary sits above the element: a read that fails while it draws would leave a blank view.
    ReactDOM.createRoot(container, {
      onUncaughtError: (error) => McpAppBoot.#fail(view, `${app} failed to draw`, error),
    }).render(
      McpAppBoot.#wrap(
        rootOverrides,
        <Root params={{ lang }} path={path}>
          {McpAppBoot.#wrap(overrides, element)}
        </Root>,
      ),
    );
  }

  static #wrap(overrides: McpAppOverride[], element: ReactNode) {
    return overrides.reduceRight<ReactNode>((children, Override) => createElement(Override, null, children), element);
  }

  static #fail(view: McpAppView, what: string, error: unknown) {
    Logger.error(`[mcp-app] ${what}: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
    view.showUnavailable("The page failed to load.");
  }

  static async #load(app: string, page: RouteModuleSource, route: McpAppRoute, lang: string): Promise<ReactNode> {
    const { definition } = resolveRouteModule(page, `the page of ${app}`, { kind: "page" });
    if (definition?.kind !== "page") throw new Error(`the module handed to the ${app} view is not a page() chain`);
    const pageDefinition = definition as PageDefinition;
    return await pageDefinition.loadApp(app, { lang, ...pageDefinition.resolveArgs(route) });
  }

  static #bare({ children }: McpAppRootProps) {
    return children;
  }
}
