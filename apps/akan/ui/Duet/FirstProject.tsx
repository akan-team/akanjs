import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";

interface FirstProjectProps {
  className?: string;
}
export const FirstProject = ({ className }: FirstProjectProps) => {
  const { l } = usePage();
  const layers = [
    { name: "schema", note: l.trans({ en: "Define the DB schema", ko: "DB 스키마 정의" }) },
    { name: "query", note: l.trans({ en: "Add the query field", ko: "쿼리 필드 추가" }) },
    { name: "service", note: l.trans({ en: "Add the service logic", ko: "서비스 로직 추가" }) },
    { name: "api", note: l.trans({ en: "Add the API field", ko: "API 필드 추가" }) },
    { name: "fetch", note: l.trans({ en: "Add the fetch field", ko: "fetch 필드 추가" }) },
    { name: "type", note: l.trans({ en: "Declare the client type", ko: "클라이언트 타입 선언" }) },
    { name: "state", note: l.trans({ en: "Declare the state management", ko: "상태관리 선언" }) },
    { name: "ui", note: l.trans({ en: "Declare the UI prop", ko: "UI prop 선언" }) },
  ];
  return (
    <div className={cn("jelly-glass flex flex-col overflow-hidden rounded-3xl text-left", className)}>
      <div className="flex h-11 items-center gap-2 border-foreground/10 border-b px-5 font-mono text-foreground/55 text-xs">
        <span className="text-foreground/35">▾</span>+ name
        <span className="ml-auto text-foreground/35">
          {l.trans({ en: "the first project", ko: "첫 번째 프로젝트" })}
        </span>
      </div>
      <ul className="divide-y divide-foreground/5">
        {layers.map(({ name, note }) => (
          <li key={name} className="relative flex items-center gap-6 px-5 py-3">
            <span className="strike-dim w-16 shrink-0 font-mono text-sm">{name}</span>
            <span className="strike-dim text-foreground/60 text-sm">{note}</span>
            <span className="strike-sweep pointer-events-none absolute inset-x-3 top-1/2 h-0.5 bg-primary" />
          </li>
        ))}
      </ul>
      <p className="mt-auto border-foreground/10 border-t px-5 py-3.5 font-mono text-[11px] text-foreground/45">
        {l.trans({
          en: "…for one field. Then again on every platform you ship.",
          ko: "…필드 하나에 이만큼. 배포하는 플랫폼마다 한 번 더.",
        })}
      </p>
    </div>
  );
};
