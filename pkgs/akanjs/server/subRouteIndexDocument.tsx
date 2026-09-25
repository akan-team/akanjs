import type { ReactNode } from "react";
import { SYSTEM_PAGE_STYLE } from "./systemPageDocument";

export interface SubRouteIndexOptions {
  locale: string;
  basePaths: string[];
  subRoutes?: Record<string, string[]>;
}

const SUB_ROUTE_INDEX_STYLE = `
.akan-sub-route-list { margin: 26px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.akan-sub-route-link { display: grid; gap: 4px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 18px; background: rgba(26, 26, 26, 0.72); padding: 16px 18px; text-decoration: none; }
.akan-sub-route-link:hover { border-color: var(--akan-primary); background: rgba(255, 73, 59, 0.08); }
.akan-sub-route-name { color: var(--akan-foreground); font-size: 1.1rem; font-weight: 800; letter-spacing: -0.02em; }
.akan-sub-route-path { color: rgba(255, 255, 255, 0.66); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85rem; }
.akan-sub-route-hosts { color: var(--akan-accent); font-size: 0.76rem; letter-spacing: 0.06em; overflow-wrap: anywhere; }
`;

export const getSubRouteIndexHref = (locale: string, basePath: string): string => `/${locale}/${basePath}`;

export function createSubRouteIndexDocument({ locale, basePaths, subRoutes = {} }: SubRouteIndexOptions): ReactNode {
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Sub routes</title>
        <style data-akan-system-page>{`${SYSTEM_PAGE_STYLE}${SUB_ROUTE_INDEX_STYLE}`}</style>
      </head>
      <body>
        <main className="akan-system-page">
          <section className="akan-system-card" aria-labelledby="akan-sub-route-title">
            <p className="akan-system-eyebrow">Local dev</p>
            <h1 id="akan-sub-route-title" className="akan-system-title">
              Pick a sub route.
            </h1>
            <p className="akan-system-description">
              This app serves every route under a sub path, so the site root has no page of its own. Only local runs see
              this list; deployed hosts map straight onto one sub route.
            </p>
            <ul className="akan-sub-route-list">
              {basePaths.map((basePath) => {
                const hosts = subRoutes[basePath] ?? [];
                return (
                  <li key={basePath}>
                    <a className="akan-sub-route-link" href={getSubRouteIndexHref(locale, basePath)}>
                      <span className="akan-sub-route-name">{basePath}</span>
                      <span className="akan-sub-route-path">{getSubRouteIndexHref(locale, basePath)}</span>
                      {hosts.length ? <span className="akan-sub-route-hosts">{hosts.join(", ")}</span> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </main>
      </body>
    </html>
  );
}
