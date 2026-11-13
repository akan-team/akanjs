import type { AkanHeadSnapshotNode, ResolvedHead, RouteRender, RouteViewport } from "akanjs/client";
import { type AkanI18nConfig, getBasePathFromPathname, LocalePath } from "akanjs/common";
import { untrackedRequest } from "akanjs/fetch";
import type { ReactNode } from "react";
import { RouteHead } from "../client/route/RouteHead";
import { ViewportMeta } from "../client/viewportMeta";
import { webManifestHref } from "../client/webManifest";
import type { RouteHeadSnapshots } from "./rscPatchPlanner";
import { AkanRouteHeadReference } from "./rscSegmentOutletReference";

interface RscDocumentHeadProps {
  i18n: () => AkanI18nConfig;
  basePaths: () => string[];
  cssAssets: () => Record<string, { cssUrl: string; cssRelPath: string }>;
}

export class RscDocumentHead {
  readonly #props: RscDocumentHeadProps;

  constructor(props: RscDocumentHeadProps) {
    this.#props = props;
  }

  get #i18n(): AkanI18nConfig {
    return this.#props.i18n();
  }

  get #basePaths(): string[] {
    return this.#props.basePaths();
  }

  get #cssAssets(): Record<string, { cssUrl: string; cssRelPath: string }> {
    return this.#props.cssAssets();
  }

  static async firstRootValue<T>(
    renderRootLayouts: RouteRender[],
    read: (render: RouteRender) => T | Promise<T | undefined> | undefined,
  ): Promise<T | undefined> {
    const values = await Promise.all(renderRootLayouts.map(read));
    return values.find((value) => value !== undefined);
  }

  renderViewport(viewport: RouteViewport | undefined): ReactNode {
    return <meta key="viewport" name="viewport" content={ViewportMeta.content(viewport)} />;
  }

  //? In the shell's own head: a link streamed with the body lands in <body>, where Chromium never reads a manifest.
  async renderManifestLink(url: URL, renderRootLayouts: RouteRender[]): Promise<ReactNode> {
    const manifest = await RscDocumentHead.firstRootValue(renderRootLayouts, (render) => render.getLayoutManifest?.());
    if (manifest === undefined) return null;
    //? The basePath the URL shows; one a host maps to (x-base-path) is not in the path, and the server reads it there.
    const basePath = getBasePathFromPathname(url.pathname, { basePaths: this.#basePaths, i18n: this.#i18n });
    return <link key="manifest" rel="manifest" href={webManifestHref(basePath)} />;
  }

  renderHeadTags(
    url: URL,
    {
      manifestLink,
      routeHead,
      snapshots,
      noindex = false,
      tags = null,
      themeColors = [],
    }: {
      manifestLink: ReactNode;
      routeHead: ResolvedHead;
      themeColors?: AkanHeadSnapshotNode[];
      snapshots?: RouteHeadSnapshots;
      noindex?: boolean;
      tags?: ReactNode[] | null;
    },
  ): ReactNode {
    if (snapshots) {
      const ownsManifest = [...snapshots.layouts.nodes, ...snapshots.page.nodes].some(
        (node) => RouteHead.keyOf(node.tag, node.attrs ?? {}) === "link:manifest",
      );
      return (
        <>
          {ownsManifest ? null : manifestLink}
          <AkanRouteHeadReference
            layouts={{ ...snapshots.layouts, nodes: [...themeColors, ...snapshots.layouts.nodes] }}
            page={snapshots.page}
          />
        </>
      );
    }
    const head = routeHead.node ?? this.renderDefaultHead();
    return (
      <>
        {RouteHead.mergeNodes([
          themeColors.map((node, idx) => <meta key={`theme-color:${idx}`} {...node.attrs} />),
          manifestLink,
          head,
          noindex ? RouteHead.noindexOver(head) : null,
          tags,
        ])}
        {this.#renderLocaleAlternates(url)}
      </>
    );
  }

  renderDefaultHead(): ReactNode {
    return <title key="title">{process.env.AKAN_PUBLIC_APP_NAME ?? "Akan App"}</title>;
  }

  getBasePath(url: URL): string | null {
    return getBasePathFromPathname(url.pathname, {
      basePaths: this.#basePaths,
      i18n: this.#i18n,
      headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
    });
  }

  getLocaleAlternateLanguages(url: URL): Record<string, string> {
    const languages: Record<string, string> = {};
    const publicUrl = RscDocumentHead.#getPublicRequestUrl(url);
    for (const lang of this.#i18n.locales) {
      const alternateUrl = new URL(publicUrl);
      alternateUrl.pathname = RscDocumentHead.#replaceLocalePathSegment(publicUrl.pathname, lang, this.#i18n);
      languages[lang] = alternateUrl.href;
    }
    const xDefaultUrl = new URL(publicUrl);
    xDefaultUrl.pathname = "/";
    xDefaultUrl.search = "";
    xDefaultUrl.hash = "";
    languages["x-default"] = xDefaultUrl.href;
    return languages;
  }

  #renderLocaleAlternates(url: URL): ReactNode {
    return Object.entries(this.getLocaleAlternateLanguages(url)).map(([lang, href]) => (
      <link key={`alternate:${lang}`} rel="alternate" hrefLang={lang} href={href} />
    ));
  }

  renderStylesheet(pathname: string): ReactNode {
    const cssUrl = this.getStylesheetHref(pathname);
    if (!cssUrl) return null;
    return <link key="stylesheet" rel="stylesheet" href={cssUrl} precedence="default" data-akan-css="active" />;
  }

  getStylesheetHref(pathname: string): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: Object.keys(this.#cssAssets),
      i18n: this.#i18n,
      headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
    });
    return this.#cssAssets[basePath ?? ""]?.cssUrl ?? null;
  }

  static #getPublicRequestUrl(url: URL): URL {
    const publicUrl = new URL(url);
    const req = untrackedRequest();
    const headers = req?.headers;
    const host = headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ?? headers?.get("host");
    const proto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (host) publicUrl.host = host;
    if (host && !host.includes(":")) publicUrl.port = "";
    if (proto) publicUrl.protocol = proto.endsWith(":") ? proto : `${proto}:`;

    const basePath = headers?.get("x-base-path");
    const parts = publicUrl.pathname.split("/").filter(Boolean);
    if (basePath && parts[1] === basePath) {
      publicUrl.pathname = `/${[parts[0], ...parts.slice(2)].filter(Boolean).join("/")}`;
    }
    return publicUrl;
  }

  static #replaceLocalePathSegment(pathname: string, lang: string, i18n: AkanI18nConfig): string {
    const parts = pathname.split("/").filter(Boolean);
    return LocalePath.join(lang, `/${parts.slice(1).join("/")}`, i18n);
  }
}
