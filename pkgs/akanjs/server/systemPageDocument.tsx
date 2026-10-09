import type { AkanI18nConfig } from "akanjs/common";
import { DEFAULT_AKAN_I18N, getBasePathFromPathname } from "akanjs/common";
import type { ReactNode } from "react";

export type SystemPageKind = "not-found" | "error";

export interface SystemPageOptions {
  kind: SystemPageKind;
  pathname: string;
  homeHref: string;
  lang?: string;
  stylesheetHref?: string | null;
  showDetails?: boolean;
  error?: unknown;
  /** Dev only: the HMR client, so a page that failed to render reloads once a later build fixes it. */
  script?: string;
}

export interface SystemPageHomeHrefOptions {
  pathname: string;
  i18n?: AkanI18nConfig;
  basePaths?: Iterable<string>;
  headerBasePath?: string | null;
}

export const SYSTEM_PAGE_STATUS_COPY = {
  "not-found": {
    status: 404,
    eyebrow: "Page not found",
    title: "This page is off the flight path.",
    description: "The route you requested does not exist, or it may have moved to a different address.",
    actionLabel: "Go home",
  },
  error: {
    status: 500,
    eyebrow: "Server error",
    title: "Something broke on the server.",
    description: "The app could not finish rendering this page. Please try again in a moment.",
    actionLabel: "Back to safety",
  },
} as const;

export const SYSTEM_PAGE_STYLE = `
:root { color-scheme: dark; --akan-primary: #ff493b; --akan-secondary: #2b2e33; --akan-accent: #d1a23b; --akan-foreground: #ffffff; --akan-background: #1a1a1a; --akan-error: #f02020; }
body { margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--akan-background); color: var(--akan-foreground); }
a { color: inherit; }
.akan-system-page { min-height: 100vh; display: grid; place-items: center; padding: 32px 18px; box-sizing: border-box; background: radial-gradient(circle at top left, rgba(255, 73, 59, 0.16), transparent 34%), linear-gradient(135deg, var(--akan-background), #111); }
.akan-system-card { width: min(720px, 100%); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 32px; background: linear-gradient(145deg, rgba(42, 42, 42, 0.96), rgba(43, 46, 51, 0.78)); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.36); padding: clamp(28px, 6vw, 56px); }
.akan-system-status { margin: 0 0 18px; font-weight: 800; font-size: clamp(4rem, 18vw, 8rem); line-height: 0.85; letter-spacing: -0.08em; color: var(--akan-primary); }
.akan-system-eyebrow { margin: 0 0 10px; color: var(--akan-accent); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
.akan-system-title { margin: 0; max-width: 12ch; font-size: clamp(2rem, 7vw, 4rem); line-height: 0.95; letter-spacing: -0.055em; color: var(--akan-foreground); }
.akan-system-description { margin: 22px 0 0; max-width: 56ch; color: rgba(255, 255, 255, 0.76); font-size: 1.05rem; line-height: 1.75; }
.akan-system-path { margin: 22px 0 0; overflow-wrap: anywhere; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; background: rgba(26, 26, 26, 0.72); padding: 12px 14px; color: rgba(255, 255, 255, 0.72); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.88rem; }
.akan-system-actions { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 12px; }
.akan-system-action { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; border: 1px solid var(--akan-primary); border-radius: 999px; background: var(--akan-primary); box-shadow: 0 12px 34px rgba(255, 73, 59, 0.26); color: var(--akan-foreground); padding: 0 18px; font-weight: 800; text-decoration: none; }
.akan-system-secondary { border: 1px solid rgba(255, 255, 255, 0.12); background: var(--akan-secondary); color: var(--akan-foreground); }
.akan-system-details { margin-top: 28px; max-height: 260px; overflow: auto; border-radius: 18px; background: rgba(26, 26, 26, 0.82); border: 1px solid rgba(240, 32, 32, 0.22); padding: 16px; color: rgba(255, 255, 255, 0.78); font-size: 0.82rem; line-height: 1.55; white-space: pre-wrap; }
`;

/** The card alone, styled by the app's own tokens: what a not-found raised after the layouts streamed renders in place. */
export const SystemPageMain = (options: Omit<SystemPageOptions, "lang" | "stylesheetHref" | "script">) => {
  const copy = SYSTEM_PAGE_STATUS_COPY[options.kind];
  const details = options.showDetails ? getSystemPageErrorDetails(options.error) : null;
  return (
    <main className="akan-system-page min-h-screen bg-background text-foreground">
      <section
        className="akan-system-card rounded-3xl border border-foreground/10 bg-foreground/4 p-8 shadow-2xl backdrop-blur-xl"
        aria-labelledby="akan-system-title"
      >
        <p className="akan-system-status text-primary">{copy.status}</p>
        <p className="akan-system-eyebrow text-primary">{copy.eyebrow}</p>
        <h1 id="akan-system-title" className="akan-system-title font-black">
          {copy.title}
        </h1>
        <p className="akan-system-description text-foreground/70">{copy.description}</p>
        <p className="akan-system-path border border-foreground/10 bg-muted/50" aria-label="Requested path">
          {options.pathname}
        </p>
        <div className="akan-system-actions">
          <a className="akan-system-action" href={options.homeHref}>
            {copy.actionLabel}
          </a>
          <a className="akan-system-action akan-system-secondary" href={options.pathname}>
            Try again
          </a>
        </div>
        {details ? (
          <pre className="akan-system-details" aria-label="Development error details">
            {details}
          </pre>
        ) : null}
      </section>
    </main>
  );
};

export function createSystemPageDocument(options: SystemPageOptions): ReactNode {
  const copy = SYSTEM_PAGE_STATUS_COPY[options.kind];
  const title = `${copy.status} - ${copy.eyebrow}`;

  return (
    <html lang={options.lang ?? DEFAULT_AKAN_I18N.defaultLocale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{title}</title>
        {options.stylesheetHref ? (
          <link rel="stylesheet" href={options.stylesheetHref} precedence="default" data-akan-css="active" />
        ) : null}
        <style data-akan-system-page>{SYSTEM_PAGE_STYLE}</style>
      </head>
      <body>
        <SystemPageMain {...options} />
        {options.script ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the dev HMR client, a constant the server owns
          <script dangerouslySetInnerHTML={{ __html: options.script }} />
        ) : null}
      </body>
    </html>
  );
}

export function getSystemPageErrorDetails(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function getPathnameLocale(pathname: string, i18n: AkanI18nConfig): string {
  const [segment] = pathname.split("/").filter(Boolean);
  return segment && i18n.locales.includes(segment) ? segment : i18n.defaultLocale;
}

export function getSystemPageHomeHref({
  pathname,
  i18n = DEFAULT_AKAN_I18N,
  basePaths = [],
  headerBasePath,
}: SystemPageHomeHrefOptions): string {
  const locale = getPathnameLocale(pathname, i18n);
  const basePath = getBasePathFromPathname(pathname, {
    basePaths,
    i18n,
    headerBasePath,
  });
  return `/${[locale, basePath].filter(Boolean).join("/")}`;
}

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
