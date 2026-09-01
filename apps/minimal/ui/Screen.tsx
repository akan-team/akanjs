import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface ScreenProps {
  className?: string;
  children?: ReactNode;
}
/** 전체 화면 배경/전경 — 페이지 루트 컨테이너. 무변형 표면이라 recipe 가 아닌 컴포넌트. */
export const Screen = ({ className, children }: ScreenProps) => (
  <div className={cn("min-h-screen bg-background text-foreground", className)}>{children}</div>
);
