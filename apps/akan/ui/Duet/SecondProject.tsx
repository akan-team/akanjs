import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface SecondProjectProps {
  className?: string;
  footer?: ReactNode;
}
export const SecondProject = ({ className, footer }: SecondProjectProps) => {
  const { l } = usePage();
  const files = [
    {
      name: "tools.json",
      note: l.trans({ en: "Every action, described again for a model", ko: "모든 동작을 모델용으로 다시 설명" }),
    },
    { name: "mcp-server.ts", note: l.trans({ en: "A second server beside your API", ko: "API 옆에 서버 하나 더" }) },
    {
      name: "oauth/",
      note: l.trans({ en: "Sign-in and consent for AI clients", ko: "AI 클라이언트용 로그인과 동의" }),
    },
    {
      name: "permissions.ts",
      note: l.trans({ en: "Who may do what — written a second time", ko: "누가 무엇을 할 수 있는지, 한 번 더" }),
    },
    {
      name: "ui-bridge.ts",
      note: l.trans({ en: "Glue so a chat can press your buttons", ko: "채팅이 버튼을 누르게 하는 연결 코드" }),
    },
    {
      name: "ApprovalDialog.tsx",
      note: l.trans({ en: "A human check before anything that matters", ko: "중요한 일 앞의 사람 확인" }),
    },
  ];
  return (
    <div className={cn("jelly-glass flex flex-col overflow-hidden rounded-3xl text-left", className)}>
      <div className="flex h-11 items-center gap-2 border-foreground/10 border-b px-5 font-mono text-foreground/55 text-xs">
        <span className="text-foreground/35">▾</span>
        agent/
        <span className="ml-auto text-foreground/35">
          {l.trans({ en: "the second project", ko: "두 번째 프로젝트" })}
        </span>
      </div>
      <ul className="divide-y divide-foreground/5">
        {files.map(({ name, note }) => (
          <li key={name} className="relative flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
            <span className="strike-dim font-mono text-sm sm:w-44 sm:shrink-0">{name}</span>
            <span className="strike-dim text-foreground/60 text-sm">{note}</span>
            <span className="strike-sweep pointer-events-none absolute inset-x-3 top-1/2 h-0.5 bg-primary" />
          </li>
        ))}
      </ul>
      {footer ? (
        <p className="mt-auto border-foreground/10 border-t px-5 py-3.5 font-mono text-[11px] text-foreground/45">
          {footer}
        </p>
      ) : null}
    </div>
  );
};
