import type { LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type CommonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> &
  Omit<LinkProps, "href"> & {
    href?: string | null;
    children?: ReactNode;
    disabled?: boolean;
    scrollToTop?: boolean;
    activeClassName?: string;
  };

export interface CsrLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: ReactNode;
  replace?: boolean;
  activeClassName?: string;
  scrollToTop?: boolean;
}

export interface NextLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href">,
    LinkProps {
  href: string;
  children?: ReactNode;
  disabled?: boolean;
  scrollToTop?: boolean;
  activeClassName?: string;
}
