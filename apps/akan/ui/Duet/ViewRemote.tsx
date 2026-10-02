import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";

interface ViewRemoteProps {
  className?: string;
}
export const ViewRemote = ({ className }: ViewRemoteProps) => {
  const { l } = usePage();
  return (
    <div aria-hidden="true" className={cn("flex flex-col items-center gap-2.5", className)}>
      <div className="jelly-glass inline-flex rounded-full p-1 font-bold text-xs">
        <label
          htmlFor="duet-human"
          className="jelly tint-foreground flex cursor-pointer items-center gap-2 rounded-full duet-agent:bg-none duet-agent:bg-transparent px-3.5 py-1.5 duet-agent:text-foreground/55 text-background duet-agent:shadow-none transition"
        >
          <span className="size-1.5 rounded-full bg-current" />
          {l.trans({ en: "Human view", ko: "사람의 눈" })}
        </label>
        <label
          htmlFor="duet-agent"
          className="duet-agent:jelly duet-agent:tint-primary flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 duet-agent:text-primary-foreground text-foreground/55 transition"
        >
          <span className="size-1.5 rounded-full bg-current" />
          {l.trans({ en: "Agent view", ko: "에이전트의 눈" })}
        </label>
      </div>
      <p className="min-h-4 text-center font-mono duet-agent:text-primary text-[11px] text-foreground/40">
        <span className="duet-agent:hidden">
          {l.trans({
            en: "Flip it — every mock on this page has a second face.",
            ko: "눌러 보세요. 이 페이지의 모든 화면에는 얼굴이 하나 더 있습니다.",
          })}
        </span>
        <span className="duet-agent:inline hidden">
          {l.trans({
            en: "What a model reads: tools and their arguments, not pixels.",
            ko: "모델이 읽는 화면입니다. 픽셀이 아니라 도구와 인자를 봅니다.",
          })}
        </span>
      </p>
    </div>
  );
};
