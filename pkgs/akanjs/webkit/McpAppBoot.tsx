"use client";
import { type PageDefinition, type RouteModuleSource, resolveRouteModule, router, Translator } from "akanjs/client";
import { Logger, parseAkanI18nEnv } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import { st } from "akanjs/store";
import type { ReactNode } from "react";
import * as ReactDOM from "react-dom/client";
import { McpAppAgent } from "./McpAppAgent";
import { McpAppBridge, type McpAppRoute } from "./McpAppBridge";
import { McpAppView } from "./McpAppView";

export interface McpAppRootProps {
  params: { lang: string };
  path: string;
  children: ReactNode;
}

export interface McpAppBootProps {
  /** The `.app()` this view draws. */
  app: string;
  /** The page module that declares it. */
  page: RouteModuleSource;
  /** The generated root layout of the page: its `McpAppRoot` provides what the root layout would, frame aside. */
  root: { McpAppRoot?: (props: McpAppRootProps) => ReactNode };
}

//* An MCP host's view of one `.app()`: no router, no layout and no network of its own. Its first reads come from the
//* tool result's snapshot, and every later call is relayed by the host under the host's credential.
export class McpAppBoot {
  static async run({ app, page, root }: McpAppBootProps) {
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
    const pathname = href.split(/[?#]/)[0] ?? "/";
    const path = `/${pathname.split("/").slice(2).join("/")}`;
    if (globalThis.__AKAN_EMBED__) globalThis.__AKAN_EMBED__.account = start.account;
    FetchClient.setBridge(bridge.fetchBridge(start.snapshot, { readOnly: start.readOnly }));
    router.init({
      type: "csr",
      lang,
      router: {
        push: (to) => view.open(to),
        replace: (to) => view.open(to),
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    Translator.setActiveLocale(lang);
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
      element = await McpAppBoot.#load(app, page, { ...start.route, params: { ...start.route.params, lang } });
    } catch (error) {
      Logger.error(
        `[mcp-app] ${app} failed to load: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
      );
      view.showUnavailable("The page failed to load.");
      return;
    }
    const container = document.getElementById("root");
    if (!container) throw new Error("No root element");
    const Root = root.McpAppRoot ?? McpAppBoot.#bare;
    ReactDOM.createRoot(container).render(
      <Root params={{ lang }} path={path}>
        {element}
      </Root>,
    );
  }

  static async #load(app: string, page: RouteModuleSource, route: McpAppRoute): Promise<ReactNode> {
    const { definition } = resolveRouteModule(page, `the page of ${app}`, { kind: "page" });
    if (definition?.kind !== "page") throw new Error(`the module handed to the ${app} view is not a page() chain`);
    const pageDefinition = definition as PageDefinition;
    const args = { lang: route.params.lang ?? parseAkanI18nEnv().defaultLocale, ...pageDefinition.resolveArgs(route) };
    return await pageDefinition.loadApp(app, args);
  }

  static #bare({ children }: McpAppRootProps) {
    return children;
  }
}
