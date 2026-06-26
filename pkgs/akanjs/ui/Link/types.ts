import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Record<never, never>;
export type CommonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> &
  Omit<LinkProps, "href"> & {
    /** Destination route. When omitted or disabled, Link renders a non-clickable div with the same children. */
    href?: string | null;
    children?: ReactNode;
    /** Prevent navigation while preserving layout and children rendering. */
    disabled?: boolean;
    /** Scroll to the top after client-side navigation. */
    scrollToTop?: boolean;
    /** Replace current history entry instead of pushing a new one. */
    replace?: boolean;
    /** Class applied when the current route matches href. */
    activeClassName?: string;
    /** Match activeClassName only on exact route matches. */
    activeExact?: boolean;
    /** Bypass route cache for client-side navigation when supported by the renderer. */
    noCache?: boolean;
  };

export interface CsrLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Destination route for client-side navigation. */
  href: string;
  children?: ReactNode;
  /** Replace current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Class applied when the current route matches href. */
  activeClassName?: string;
  /** Match activeClassName only on exact route matches. */
  activeExact?: boolean;
  /** Scroll to the top after client-side navigation. */
  scrollToTop?: boolean;
}

export interface SsrLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href">,
    LinkProps {
  /** Destination route for server-rendered anchor output. */
  href: string;
  children?: ReactNode;
  /** Prevent navigation while preserving layout and children rendering. */
  disabled?: boolean;
  /** Scroll to the top after navigation. */
  scrollToTop?: boolean;
  /** Replace current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Class applied when the current route matches href. */
  activeClassName?: string;
  /** Match activeClassName only on exact route matches. */
  activeExact?: boolean;
  /** Bypass route cache for client-side navigation when supported by the renderer. */
  noCache?: boolean;
}
