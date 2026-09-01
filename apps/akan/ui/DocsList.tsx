import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface DocsListProps {
  className?: string;
  children: ReactNode;
}
/** 문서 불릿 리스트 — 무변형 표면이라 recipe 가 아닌 컴포넌트 (Divider 와 동일 계열). */
export const DocsList = ({ className, children }: DocsListProps) => (
  <ul className={cn("list-disc space-y-2 pl-5", className)}>{children}</ul>
);
