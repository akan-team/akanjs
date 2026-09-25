"use client";
import { clsx, router, usePage } from "akanjs/client";
import { parseAkanI18nEnv } from "akanjs/common";

const languageNames = {
  en: "English",
  ko: "한국어",
  zhChs: "简体中文",
  zhCht: "繁體中文",
};

export interface SelectLanguageProps {
  className?: string;
  languages?: string[];
}
export const SelectLanguage = ({ className, languages = parseAkanI18nEnv().locales }: SelectLanguageProps) => {
  const { lang } = usePage();

  return (
    <div className={clsx("dropdown dropdown-end", className)}>
      <div
        id="select-language"
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-sm mx-2 my-auto min-h-0 border-none px-3 font-medium text-xs md:mx-4"
      >
        {languageNames[lang as keyof typeof languageNames]}
      </div>
      <ul tabIndex={0} className="dropdown-content menu rounded-box bg-base-100 p-2 shadow-sm">
        {languages
          .filter((lang) => !!languageNames[lang as keyof typeof languageNames])
          .map((lang) => (
            <li key={lang}>
              <button
                type="button"
                onClick={() => {
                  router.setLang(lang);
                }}
              >
                {languageNames[lang as keyof typeof languageNames]}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
};
