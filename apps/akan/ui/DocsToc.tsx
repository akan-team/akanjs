import { Scroll } from "@libs/util/ui";

/** 문서 우측 고정 목차 — `Scroll.TitleNavigator` 를 표준 배치로 감싸는 얇은 래퍼. */
export const DocsToc = ({ className }: { className?: string }) => (
  <Scroll.TitleNavigator className={className ?? "fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex"} />
);
