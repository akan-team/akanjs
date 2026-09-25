"use client";

import { usePage } from "@apps/akan/client";
import { clsx } from "akanjs/client";
import { Link, System } from "akanjs/ui";
import { useEffect, useState } from "react";
import { FaBars, FaDiscord, FaGithub } from "react-icons/fa";
import { AkanLogo } from "./AkanLogo";

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
  "relative cursor-pointer whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 font-semibold text-sm duration-200 after:absolute after:right-3 after:bottom-0 after:left-3 after:h-0.5 after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:border-base-content/10 hover:bg-base-content/5 hover:text-primary";

const socialLinkClassName =
  "relative cursor-pointer rounded-full border border-base-content/10 bg-base-content/5 p-2 text-2xl duration-300 hover:border-primary/20 hover:bg-primary/10 hover:text-primary";

export const AkanjsHeader = ({
  className,
  links,
  logoLabel,
  notice,
  mobileDrawerLinks,
  collapseMobileSubMenuOnScroll = false,
}: AkanjsHeaderProps) => {
  const { l } = usePage();
  const [isMobileSubMenuVisible, setIsMobileSubMenuVisible] = useState(true);

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
      <div className={clsx("fixed top-0 z-50 w-full", className)}>
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative z-10 grid h-16 w-full grid-cols-[auto_1fr_auto] items-center border-base-content/10 border-b bg-base-100/85 px-6 text-base-content shadow-base-content/5 shadow-lg backdrop-blur-xl md:h-20 lg:grid-cols-[1fr_auto_1fr]">
          <div className="block lg:hidden">
            <label
              htmlFor="mobile-menu-toggle"
              className="cursor-pointer text-2xl text-base-content transition-colors hover:text-primary"
            >
              <FaBars />
            </label>
          </div>
          <div className="hidden items-center gap-4 lg:flex">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <AkanLogo className="text-2xl" />
              {logoLabel && <span className="mt-2 text-base-content/50 text-sm">{logoLabel}</span>}
            </Link>
          </div>

          <div className="hidden items-center justify-center gap-3 font-bold lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.target}
                className={navLinkClassName}
                activeClassName="text-primary after:scale-x-100"
              >
                {l.trans(link.label)}
              </Link>
            ))}
          </div>

          <div className="hidden justify-end font-bold lg:flex">
            <div className="flex items-center justify-end gap-3 text-center text-base-content text-sm lg:text-xl">
              <div className="flex shrink-0 items-center rounded-full border border-base-content/10 bg-base-content/5 px-2 py-1">
                <System.SelectLanguage languages={["en", "ko"]} />
                <System.ThemeToggle themes={["light", "dark"]} />
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
              <Link href="/">
                <AkanLogo className="w-24 font-bold text-lg" />
              </Link>
            </div>
          </div>
        </div>
        {notice && (
          <div className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 border-base-content/10 border-b bg-base-content/6 px-4 py-2 text-center font-medium text-base-content text-xs shadow-sm backdrop-blur-xl md:text-sm">
            <span>{l.trans(notice.text)}</span>
            <Link href={notice.link.href} className="font-bold text-primary underline-offset-4 hover:underline">
              {l.trans(notice.link.label)}
            </Link>
          </div>
        )}
        <div
          className={clsx(
            "overflow-hidden border-base-content/10 border-b bg-base-100/85 px-3 shadow-sm backdrop-blur-xl transition-all duration-300 ease-out lg:hidden",
            collapseMobileSubMenuOnScroll
              ? isMobileSubMenuVisible
                ? "max-h-14 translate-y-0 py-2 opacity-100"
                : "max-h-0 -translate-y-2 py-0 opacity-0"
              : "py-2",
          )}
        >
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap text-base-content">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                target={link.target}
                className={navLinkClassName}
                activeClassName="text-primary after:scale-x-100"
              >
                {l.trans(link.label)}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {mobileDrawerLinks && (
        <>
          <input type="checkbox" id="mobile-menu-toggle" className="peer hidden" />
          <div className="fixed inset-y-0 left-0 z-40 w-full -translate-x-full transform transition-transform duration-50 ease-in-out peer-checked:translate-x-0 lg:hidden">
            <div className="h-full overflow-y-auto bg-base-200 shadow-lg">
              <div className="mt-28 p-5">
                {mobileDrawerLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    target={link.target}
                    className="block rounded py-2 text-base transition-all hover:text-primary"
                    activeClassName="font-bold text-primary"
                  >
                    {l.trans(link.label)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
