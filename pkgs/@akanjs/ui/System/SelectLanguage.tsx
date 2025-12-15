"use client";
import { router, usePage } from "@akanjs/client";
import { useState } from "react";

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
export const SelectLanguage = ({ className, languages = ["en", "ko"] }: SelectLanguageProps) => {
  const { l, lang } = usePage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div
        id="select-language"
        onClick={() => {
          setOpen(!open);
        }}
        className="mx-2 my-auto cursor-pointer rounded-3xl border bg-black/50 px-3 text-xs font-light text-white md:mx-4"
      >
        {languageNames[lang]}
      </div>
      {open ? (
        <div className="absolute top-6 -left-4 w-28 rounded-xl border bg-slate-900/90 py-2 text-center text-white">
          {languages
            .filter((lang) => !!languageNames[lang])
            .map((lang) => (
              <div
                key={lang}
                onClick={() => {
                  router.setLang(lang);
                  setOpen(false);
                }}
                className="cursor-pointer py-1 hover:bg-white/20"
              >
                {languageNames[lang]}
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
};
