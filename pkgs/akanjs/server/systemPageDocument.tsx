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

const FALLBACK_STYLE = `
:root { color-scheme: dark; --akan-primary: #ff493b; --akan-secondary: #2b2e33; --akan-accent: #d1a23b; --akan-base-content: #ffffff; --akan-base-100: #1a1a1a; --akan-base-200: #2a2a2a; --akan-error: #f02020; }
body { margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--akan-base-100); color: var(--akan-base-content); }
a { color: inherit; }
.akan-system-page { min-height: 100vh; display: grid; place-items: center; padding: 32px 18px; box-sizing: border-box; background: radial-gradient(circle at top left, rgba(255, 73, 59, 0.16), transparent 34%), linear-gradient(135deg, var(--akan-base-100), #111); }
.akan-system-card { width: min(720px, 100%); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 32px; background: linear-gradient(145deg, rgba(42, 42, 42, 0.96), rgba(43, 46, 51, 0.78)); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.36); padding: clamp(28px, 6vw, 56px); }
.akan-system-status { margin: 0 0 18px; font-weight: 800; font-size: clamp(4rem, 18vw, 8rem); line-height: 0.85; letter-spacing: -0.08em; color: var(--akan-primary); }
.akan-system-eyebrow { margin: 0 0 10px; color: var(--akan-accent); font-size: 0.78rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
.akan-system-title { margin: 0; max-width: 12ch; font-size: clamp(2rem, 7vw, 4rem); line-height: 0.95; letter-spacing: -0.055em; color: var(--akan-base-content); }
.akan-system-description { margin: 22px 0 0; max-width: 56ch; color: rgba(255, 255, 255, 0.76); font-size: 1.05rem; line-height: 1.75; }
.akan-system-path { margin: 22px 0 0; overflow-wrap: anywhere; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; background: rgba(26, 26, 26, 0.72); padding: 12px 14px; color: rgba(255, 255, 255, 0.72); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.88rem; }
.akan-system-actions { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 12px; }
.akan-system-action { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; border: 1px solid var(--akan-primary); border-radius: 999px; background: var(--akan-primary); box-shadow: 0 12px 34px rgba(255, 73, 59, 0.26); color: var(--akan-base-content); padding: 0 18px; font-weight: 800; text-decoration: none; }
.akan-system-secondary { border: 1px solid rgba(255, 255, 255, 0.12); background: var(--akan-secondary); color: var(--akan-base-content); }
.akan-system-details { margin-top: 28px; max-height: 260px; overflow: auto; border-radius: 18px; background: rgba(26, 26, 26, 0.82); border: 1px solid rgba(240, 32, 32, 0.22); padding: 16px; color: rgba(255, 255, 255, 0.78); font-size: 0.82rem; line-height: 1.55; white-space: pre-wrap; }
`;

export function createSystemPageDocument(options: SystemPageOptions): ReactNode {
  const copy = SYSTEM_PAGE_STATUS_COPY[options.kind];
  const details = options.showDetails ? getSystemPageErrorDetails(options.error) : null;
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
        <style data-akan-system-page>{FALLBACK_STYLE}</style>
      </head>
      <body>
        <main className="akan-system-page min-h-screen bg-base-100 text-base-content">
          <section
            className="akan-system-card rounded-3xl border border-base-content/10 bg-base-content/4 p-8 shadow-2xl backdrop-blur-xl"
            aria-labelledby="akan-system-title"
          >
            <p className="akan-system-status text-primary">{copy.status}</p>
            <p className="akan-system-eyebrow text-primary">{copy.eyebrow}</p>
            <h1 id="akan-system-title" className="akan-system-title font-black">
              {copy.title}
            </h1>
            <p className="akan-system-description text-base-content/70">{copy.description}</p>
            <p className="akan-system-path border border-base-content/10 bg-base-200/50" aria-label="Requested path">
              {options.pathname}
            </p>
            <div className="akan-system-actions">
              <a className="akan-system-action btn btn-primary" href={options.homeHref}>
                {copy.actionLabel}
              </a>
              <a className="akan-system-action akan-system-secondary btn" href={options.pathname}>
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
      </body>
    </html>
  );
}

export function getSystemPageErrorDetails(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

export function getSystemPageHomeHref({
  pathname,
  i18n = DEFAULT_AKAN_I18N,
  basePaths = [],
  headerBasePath,
}: SystemPageHomeHrefOptions): string {
  const segments = pathname.split("/").filter(Boolean);
  const locale = i18n.locales.includes(segments[0] ?? "") ? segments[0] : i18n.defaultLocale;
  const basePath = getBasePathFromPathname(pathname, {
    basePaths,
    i18n,
    headerBasePath,
  });
  return `/${[locale, basePath].filter(Boolean).join("/")}`;
}
