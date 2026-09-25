"use client";

import { getCookie, setCookie } from "akanjs/client";
import { st } from "akanjs/store";
import { useLayoutEffect } from "react";
import { buttonRecipe } from "../Button";
import { Dropdown } from "../Dropdown";
import { Switch } from "../Switch";

export interface ThemeToggleProps {
  themes?: string[];
}
export const ThemeToggle = ({ themes }: ThemeToggleProps) => {
  const theme = st.use.theme();
  const applyTheme = st
    .tool("applyTheme")
    .desc(`Switch this page's color theme. One of: ${themes?.join(", ") ?? "none"}.`)
    .arg("theme", String)
    .exec((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      setCookie("theme", theme);
      st.do.setTheme(theme);
    });
  useLayoutEffect(() => {
    if (!themes) return;
    const cookieTheme = getCookie("theme");
    const documentTheme = document.documentElement.getAttribute("data-theme");
    // Cookie outranks the live attribute: a cached RSC tree can restore a stale data-theme on <html>.
    const next =
      cookieTheme && themes.includes(cookieTheme)
        ? cookieTheme
        : documentTheme && themes.includes(documentTheme)
          ? documentTheme
          : themes[0];
    document.documentElement.setAttribute("data-theme", next);
    st.do.setTheme(next);
  }, [themes]);

  if (!themes || themes.length <= 1) return null;
  if (themes.length === 2)
    return (
      <div className="flex items-center gap-1 text-foreground">
        <svg aria-label="sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
          <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2"></path>
            <path d="M12 20v2"></path>
            <path d="m4.93 4.93 1.41 1.41"></path>
            <path d="m17.66 17.66 1.41 1.41"></path>
            <path d="M2 12h2"></path>
            <path d="M20 12h2"></path>
            <path d="m6.34 17.66-1.41 1.41"></path>
            <path d="m19.07 4.93-1.41 1.41"></path>
          </g>
        </svg>
        <Switch
          checked={theme === themes[1]}
          onChange={(checked) => {
            applyTheme(checked ? themes[1] : themes[0]);
          }}
        />
        <svg aria-label="moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
          <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" fill="none" stroke="currentColor">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
          </g>
        </svg>
      </div>
    );
  return (
    <Dropdown
      className="mb-72"
      buttonClassName="m-1"
      value={
        <>
          Theme
          <svg
            width="12px"
            height="12px"
            className="inline-block h-2 w-2 fill-current opacity-60"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 2048 2048"
          >
            <path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path>
          </svg>
        </>
      }
      dropdownClassName="w-52 bg-border"
      content={themes.map((theme) => (
        <li key={theme}>
          <button
            type="button"
            className={buttonRecipe({ variant: "ghost", size: "sm" }, "w-full justify-start")}
            onClick={() => {
              applyTheme(theme);
            }}
          >
            {theme}
          </button>
        </li>
      ))}
    />
  );
};
