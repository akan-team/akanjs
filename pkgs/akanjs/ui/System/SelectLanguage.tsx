"use client";
import { router, usePage } from "akanjs/client";
import { parseAkanI18nEnv } from "akanjs/common";

import { buttonRecipe } from "../Button";
import { Dropdown } from "../Dropdown";

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
    <Dropdown
      className={className}
      buttonClassName="mx-2 my-auto h-8 min-h-0 border-none px-3 font-medium text-xs md:mx-4"
      value={languageNames[lang as keyof typeof languageNames]}
      content={languages
        .filter((lang) => !!languageNames[lang as keyof typeof languageNames])
        .map((lang) => (
          <li key={lang}>
            <button
              type="button"
              className={buttonRecipe({ variant: "ghost", size: "sm" }, "w-full justify-start")}
              onClick={() => {
                router.setLang(lang);
              }}
            >
              {languageNames[lang as keyof typeof languageNames]}
            </button>
          </li>
        ))}
    />
  );
};
