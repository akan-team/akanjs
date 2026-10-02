import { usePage } from "@apps/akan/client";
import { Scroll } from "@libs/util/ui";
import { cn } from "akanjs/client";

/** 문서 우측 고정 목차 — `Scroll.TitleNavigator` 를 표준 배치로 감싸는 얇은 래퍼. */
export const DocsToc = ({ className }: { className?: string }) => {
  const { l } = usePage();
  return (
    <nav
      className={cn(
        "jelly-glass fixed top-[calc(var(--akanjs-header-offset)+0.75rem)] right-3 hidden max-h-[calc(100vh-var(--akanjs-header-offset)-7rem)] w-60 flex-col overflow-y-auto rounded-box px-4 py-4 xl:flex",
        className,
      )}
    >
      <p className="mb-3 font-bold text-foreground/40 text-xs uppercase tracking-[0.16em]">
        {l.trans({ en: "On this page", ko: "이 페이지" })}
      </p>
      <Scroll.TitleNavigator />
    </nav>
  );
};
