"use client";
import { router, Translator } from "akanjs/client";
import { parseAkanI18nEnv } from "akanjs/common";

interface PageNotFoundProps {
  pathname: string;
}
export const PageNotFound = ({ pathname }: PageNotFoundProps) => {
  const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-black text-5xl text-primary">404</p>
      <p className="max-w-sm text-foreground/70 text-sm">{Translator.translateByLocale(lang, "base.pageNotFound")}</p>
      <p className="max-w-sm break-all font-mono text-foreground/50 text-xs">{pathname}</p>
      <button
        type="button"
        onClick={() => router.backOrFallback()}
        className="rounded-field bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
      >
        {Translator.translateByLocale(lang, "base.goBack")}
      </button>
    </div>
  );
};
