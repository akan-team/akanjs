"use client";
import { st, usePage } from "@apps/akan/client";
import { cn, setCookie } from "akanjs/client";

const themes = ["light", "dark"] as const;

interface JellyThemeToggleProps {
  className?: string;
}
export const JellyThemeToggle = ({ className }: JellyThemeToggleProps) => {
  const { l } = usePage();
  const theme = st.use.theme();
  const applyTheme = st
    .tool("applyTheme")
    .desc(`Switch this page's color theme. One of: ${themes.join(", ")}.`)
    .arg("theme", String)
    .exec((next) => {
      document.documentElement.setAttribute("data-theme", next);
      setCookie("theme", next);
      st.do.setTheme(next);
    });
  const isDark = theme === "dark";
  return (
    <button
      aria-checked={isDark}
      aria-label={l.trans({ en: "Dark theme", ko: "다크 테마" })}
      className={cn(
        "group/theme relative inline-flex h-8 w-[3.75rem] shrink-0 cursor-pointer items-center rounded-full bg-foreground/8 p-1 ring-1 ring-foreground/6 ring-inset transition-colors duration-500 dark:bg-foreground/10",
        className,
      )}
      onClick={() => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark")}
      role="switch"
      type="button"
    >
      <span className="absolute top-2 left-2.5 hidden size-1 rounded-full bg-starlight dark:block" />
      <span className="absolute bottom-2 left-4.5 hidden size-0.5 rounded-full bg-starlight dark:block" />
      <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-cloud/50 dark:hidden" />
      <span className="jelly tint-moon dark:tint-cloud flex size-6 items-center justify-center rounded-full text-black/60 transition-[translate,scale] duration-700 ease-jelly group-hover/theme:scale-110 group-active/theme:scale-x-125 group-active/theme:scale-y-75 group-active/theme:duration-100 dark:translate-x-7 dark:text-white">
        <svg
          className="size-3.5 dark:hidden"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.4"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
        <svg className="hidden size-3.5 dark:block" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14.5 2.8a8.6 8.6 0 1 0 6.7 12.9 7 7 0 0 1-6.7-12.9Z" />
        </svg>
      </span>
    </button>
  );
};
