"use client";

import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import { Link, System } from "akanjs/ui";
import { useEffect, useState } from "react";
import { BsArrowUpRight } from "react-icons/bs";
import { FaBars, FaDiscord, FaGithub, FaTimes } from "react-icons/fa";
import { AkanLogo } from "./AkanLogo";
import { JellyThemeToggle } from "./Jelly";

type HeaderLabel = {
  en: string;
  ko: string;
};

export interface AkanjsHeaderLink {
  href: string;
  label: HeaderLabel;
  target?: "_blank";
}

interface AkanjsHeaderNotice {
  text: HeaderLabel;
  link: AkanjsHeaderLink;
}

interface AkanjsHeaderProps {
  className?: string;
  links: AkanjsHeaderLink[];
  logoLabel?: string;
  notice?: AkanjsHeaderNotice;
  mobileDrawerLinks?: AkanjsHeaderLink[];
  collapseMobileSubMenuOnScroll?: boolean;
}

export const akanjsHomeHeaderLinks: AkanjsHeaderLink[] = [
  { href: "/docs", label: { en: "Docs", ko: "문서" } },
  { href: "/blog", label: { en: "Blog", ko: "블로그" } },
  { href: "/cases", label: { en: "Case Studies", ko: "적용사례" } },
  { href: "/roadmap", label: { en: "Roadmap", ko: "로드맵" } },
  { href: "https://cloud.akanjs.com", label: { en: "Deploy", ko: "배포" }, target: "_blank" },
];

export const akanjsDocsHeaderLinks: AkanjsHeaderLink[] = [
  { href: "/docs", label: { en: "Docs", ko: "문서" } },
  { href: "/conventions", label: { en: "Conventions", ko: "컨벤션" } },
  { href: "/references", label: { en: "References", ko: "레퍼런스" } },
  { href: "/cheatsheet", label: { en: "Cheatsheet", ko: "Cheatsheet" } },
];

export const akanjsV1DocsHeaderLinks: AkanjsHeaderLink[] = [
  { href: "/v1/docs", label: { en: "Docs (V1)", ko: "문서 (V1)" } },
];

const navLinkClassName =
  "squish relative cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 font-bold text-foreground/75 text-sm transition-colors duration-200 hover:bg-foreground/6 hover:text-foreground";

const navActiveClassName =
  "jelly tint-primary text-primary-foreground hover:bg-(--jelly-tint) hover:text-primary-foreground";

const socialLinkClassName =
  "jelly-glass squish relative flex cursor-pointer items-center justify-center rounded-full p-2 text-xl transition-colors hover:text-primary";

export const AkanjsHeader = ({
  className,
  links,
  logoLabel,
  notice,
  mobileDrawerLinks = links,
  collapseMobileSubMenuOnScroll = false,
}: AkanjsHeaderProps) => {
  const { l } = usePage();
  const [isMobileSubMenuVisible, setIsMobileSubMenuVisible] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!collapseMobileSubMenuOnScroll) return;

    let previousScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - previousScrollY;

      if (currentScrollY <= 8) {
        setIsMobileSubMenuVisible(true);
        previousScrollY = currentScrollY;
        return;
      }

      if (Math.abs(scrollDelta) < 6) return;

      setIsMobileSubMenuVisible(scrollDelta < 0);
      previousScrollY = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [collapseMobileSubMenuOnScroll]);

  return (
    <>
      <div className={cn("fixed top-0 z-50 w-full", className)}>
        <div className="relative z-10 grid h-16 w-full grid-cols-[auto_1fr_auto] items-center border-foreground/6 border-b bg-background/70 px-6 text-foreground backdrop-blur-xl backdrop-saturate-150 md:h-20 lg:grid-cols-[1fr_auto_1fr]">
          <div className="block lg:hidden">
            <button
              type="button"
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex cursor-pointer items-center text-2xl text-foreground transition-colors hover:text-primary"
            >
              {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
          </div>
          <div className="hidden items-center gap-4 lg:flex">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <AkanLogo className="text-2xl" />
              {logoLabel ? (
                <span className="mt-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-bold text-primary text-xs">
                  {logoLabel}
                </span>
              ) : null}
            </Link>
          </div>

          <div className="hidden items-center justify-center gap-1.5 rounded-full border border-foreground/6 bg-background/50 p-1 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.target}
                className={navLinkClassName}
                activeClassName={navActiveClassName}
              >
                {l.trans(link.label)}
                {link.target === "_blank" ? <BsArrowUpRight className="-mt-0.5 ml-1 inline size-3" /> : null}
              </Link>
            ))}
          </div>

          <div className="hidden justify-end font-bold lg:flex">
            <div className="flex items-center justify-end gap-3 text-center text-foreground text-sm lg:text-xl">
              <div className="jelly-glass flex shrink-0 items-center rounded-full px-2 py-1">
                <System.SelectLanguage languages={["en", "ko"]} />
                <JellyThemeToggle className="ml-1" />
              </div>
              <Link target="_blank" href="https://github.com/akan-team/akanjs" className={socialLinkClassName}>
                <FaGithub />
              </Link>
              <Link target="_blank" href="https://discord.gg/pc228BhWmM" className={socialLinkClassName}>
                <FaDiscord />
              </Link>
            </div>
          </div>

          <div className="col-span-2 block lg:hidden">
            <div className="flex w-full items-center justify-between">
              <div className="ml-8 flex items-center gap-3">
                <Link target="_blank" href="https://github.com/akan-team/akanjs" className={socialLinkClassName}>
                  <FaGithub />
                </Link>
                <Link target="_blank" href="https://discord.gg/pc228BhWmM" className={socialLinkClassName}>
                  <FaDiscord />
                </Link>
              </div>
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                <AkanLogo className="w-24 font-bold text-lg" />
              </Link>
            </div>
          </div>
        </div>
        {notice ? (
          <div
            data-akanjs-notice
            className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 border-foreground/6 border-b bg-primary/8 px-4 py-2 text-center font-medium text-foreground text-xs backdrop-blur-xl md:text-sm"
          >
            <span>{l.trans(notice.text)}</span>
            <Link
              href={notice.link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              {l.trans(notice.link.label)}
            </Link>
          </div>
        ) : null}
        <div
          className={cn(
            "overflow-hidden border-foreground/6 border-b bg-background/70 px-3 backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-out lg:hidden",
            collapseMobileSubMenuOnScroll
              ? isMobileSubMenuVisible
                ? "max-h-14 translate-y-0 py-2 opacity-100"
                : "max-h-0 -translate-y-2 py-0 opacity-0"
              : "py-2",
          )}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-foreground">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.target}
                onClick={() => setIsMobileMenuOpen(false)}
                className={navLinkClassName}
                activeClassName={navActiveClassName}
              >
                {l.trans(link.label)}
                {link.target === "_blank" ? <BsArrowUpRight className="-mt-0.5 ml-1 inline size-3" /> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-full transform transition-transform duration-50 ease-in-out lg:hidden",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-full overflow-y-auto bg-background/95 shadow-2xl backdrop-blur-xl">
          <div className="mt-[var(--akanjs-header-offset)] flex flex-col gap-1 p-5">
            {mobileDrawerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.target}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-full px-4 py-2.5 font-bold text-base text-foreground/75 transition-colors hover:bg-foreground/6 hover:text-foreground"
                activeClassName={navActiveClassName}
              >
                {l.trans(link.label)}
                {link.target === "_blank" ? <BsArrowUpRight className="-mt-0.5 ml-1 inline size-3" /> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
